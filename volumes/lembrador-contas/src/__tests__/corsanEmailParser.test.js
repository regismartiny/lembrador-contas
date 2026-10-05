import { mock, describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Mock puppeteer to avoid real browser navigation in tests
let _responseHandler = null;
let _mockPdfBuffer = null;
let _nextPdfData = null;
let _mockResponse = null;
let _parsedPdfBuffer = null;
let _mockEvaluateResult = null;
let _evaluatedEndpoint = null;

mock.module('puppeteer', () => ({
    default: {
        launch: mock(() => Promise.resolve({
            close: mock(() => Promise.resolve()),
            newPage: mock(() => {
                const mockPage = {
                    setUserAgent: mock(() => Promise.resolve()),
                    setRequestInterception: mock(() => Promise.resolve()),
                    evaluate: mock((_, endpoint) => {
                        if (endpoint) _evaluatedEndpoint = endpoint;
                        return Promise.resolve(endpoint ? _mockEvaluateResult : []);
                    }),
                    on: mock((event, handler) => {
                        if (event === 'response') _responseHandler = handler;
                    }),
                    goto: mock(async (url) => {
                        // Simulate a PDF response by calling the registered response handler
                        return new Promise(resolve => {
                            const fakeResponse = _mockResponse || {
                                url: () => url,
                                status: () => 200,
                                headers: () => ({ 'content-type': 'application/pdf' }),
                                buffer: mock(() => Promise.resolve(_mockPdfBuffer || Buffer.from('%PDF-1.4 fake'))),
                            };
                            setTimeout(() => {
                                _responseHandler(fakeResponse);
                                resolve(fakeResponse);
                            }, 10);
                        });
                    }),
                };
                return mockPage;
            }),
        })),
    },
}));

// Mock emailUtils
const mockGetMessages = mock(() => Promise.resolve(null));

mock.module('../util/emailUtils.js', () => ({
    default: { getMessagesByDateInterval: mockGetMessages }
}));

// Mock base64Util as identity (so raw HTML passes through)
mock.module('../util/base64Util.js', () => ({
    default: {
        fixBase64: mock(s => s),
        base64ToText: mock(s => s),
    }
}));

import { fetch as corsanFetch, extractPDFLink, extractTotalFromPDF, extractDueDateFromPDF, extractReferencePeriodFromPDF, setParsePDFBuffer } from '../parser/corsanEmailParser.js';

// ---------------------------------------------------------------------------
// HTML fixture — simulates CORSAN email with "Clique aqui para ver sua fatura" link
// ---------------------------------------------------------------------------
const CORSAN_HTML_FIXTURE = [
    '<html><body>',
    '<p>Sua conta de água está disponível.</p>',
    '<a href="https://corsan.rs.gov.br/fatura/12345">Clique aqui para ver sua fatura.</a>',
    '</body></html>',
].join('');

// HTML without the expected link
const CORSAN_HTML_NO_LINK = '<html><body><p>Sem link de fatura</p></body></html>';

// ---------------------------------------------------------------------------
// PDF data fixtures — simulates pdf2json output
// ---------------------------------------------------------------------------
function makePDFData(texts) {
    return {
        Pages: [{
            Texts: texts.map(([x, y, t]) => ({
                x, y,
                R: [{ T: encodeURIComponent(t) }]
            }))
        }]
    };
}

const PDF_FIXTURE_WITH_TOTAL = makePDFData([
    [1, 10, 'CORSAN'],
    [1, 20, 'Vencimento'],
    [5, 20, '15/03/2024'],
    [1, 30, 'TOTAL (R$)'],
    [5, 30, '95,00'],
]);

const PDF_FIXTURE_INLINE_TOTAL = makePDFData([
    [1, 10, 'CORSAN'],
    [1, 20, 'Vencimento'],
    [5, 20, '10/05/2024'],
    [1, 30, 'TOTAL (R$) 150,75'],
]);

const PDF_FIXTURE_NO_TOTAL = makePDFData([
    [1, 10, 'CORSAN'],
]);

const PDF_FIXTURE_NO_VENCIMENT = makePDFData([
    [1, 10, 'CORSAN'],
    [1, 30, 'TOTAL (R$)'],
    [5, 30, '50,00'],
]);

const PDF_FIXTURE_AEGEA_LAYOUT = makePDFData([
    [504, 755.92, 'TOTAL A PAGAR'],
    [505, 741.54, 'R$ 82,97'],
    [504, 755.92, 'VENCIMENTO'],
    [505, 704.54, '30/08/2026'],
    [327, 755.92, 'REFERÊNCIA'],
    [326, 741.54, '08/2026'],
]);

// ---------------------------------------------------------------------------
// Helper to simulate message with HTML in parts
// ---------------------------------------------------------------------------
function makeMessage(html) {
    return {
        payload: {
            mimeType: 'multipart/alternative',
            parts: [
                { mimeType: 'text/plain', body: { data: 'plain text' } },
                { mimeType: 'text/html', body: { data: html } }
            ]
        }
    };
}

// Set the PDF data that will be returned by the injected parser mock
function setNextPdfData(pdfData) {
    // Inject a custom parser that returns our test data
    setParsePDFBuffer(buffer => {
        _parsedPdfBuffer = Buffer.from(buffer);
        return Promise.resolve(pdfData);
    });
}

// Reset the parser back to default (for cleanup between tests)
function resetParser() {
    setParsePDFBuffer(null);
    _parsedPdfBuffer = null;
}

// Helper to create a fake PDF response for global fetch (no longer used, kept for compatibility)
function mockFetchSuccess() {
    // No-op - puppeteer is mocked instead
}

function mockAegeaJsonResponse(pdfBuffer) {
    const body = JSON.stringify({ content: { bytes: pdfBuffer.toString('base64') } });
    _mockResponse = {
        url: () => 'https://api.aegea.com.br/external/agencia-virtual/app/v1/publico/fatura-eletronica/download',
        status: () => 200,
        headers: () => ({}),
        buffer: mock(() => Promise.reject(new Error('Could not load body for this request'))),
    };
    _mockEvaluateResult = { status: 200, body };
}

// ---------------------------------------------------------------------------
// extractPDFLink
// ---------------------------------------------------------------------------
describe('corsanEmailParser.extractPDFLink', () => {
    test('extracts the PDF link from HTML with matching anchor text', () => {
        const result = extractPDFLink(CORSAN_HTML_FIXTURE);
        expect(result).toBe('https://corsan.rs.gov.br/fatura/12345');
    });

    test('returns null when no matching link is found', () => {
        const result = extractPDFLink(CORSAN_HTML_NO_LINK);
        expect(result).toBeNull();
    });

    test('returns null for empty HTML', () => {
        const result = extractPDFLink('');
        expect(result).toBeNull();
    });

    test('rejects invoice links outside approved HTTPS hosts', () => {
        const unsafeUrls = [
            'http://corsan.rs.gov.br/fatura/12345',
            'https://corsan.rs.gov.br.attacker.example/fatura/12345',
            'https://127.0.0.1/fatura/12345',
        ];

        for (const unsafeUrl of unsafeUrls) {
            const html = `<a href="${unsafeUrl}">Clique aqui para ver sua fatura</a>`;
            expect(extractPDFLink(html)).toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// extractTotalFromPDF
// ---------------------------------------------------------------------------
describe('corsanEmailParser.extractTotalFromPDF', () => {
    test('extracts total value when TOTAL (R$) and value are separate texts', () => {
        const result = extractTotalFromPDF(PDF_FIXTURE_WITH_TOTAL);
        expect(result).toBe(95);
    });

    test('extracts total value when TOTAL (R$) and value are in same text', () => {
        const result = extractTotalFromPDF(PDF_FIXTURE_INLINE_TOTAL);
        expect(result).toBe(150.75);
    });

    test('throws when TOTAL (R$) is not found', () => {
        expect(() => extractTotalFromPDF(PDF_FIXTURE_NO_TOTAL)).toThrow('TOTAL (R$) not found');
    });

    test('extracts total from the current Aegea layout', () => {
        expect(extractTotalFromPDF(PDF_FIXTURE_AEGEA_LAYOUT)).toBe(82.97);
    });

    test('extracts totals with Brazilian thousands separators', () => {
        const pdfData = makePDFData([[1, 10, 'TOTAL A PAGAR'], [5, 10, 'R$ 1.234,56']]);
        expect(extractTotalFromPDF(pdfData)).toBe(1234.56);
    });

    test('preserves dot-decimal totals', () => {
        const pdfData = makePDFData([[1, 10, 'TOTAL (R$) 95.00']]);
        expect(extractTotalFromPDF(pdfData)).toBe(95);
    });

    test('extracts thousands-separated totals inline without currency prefix', () => {
        const pdfData = makePDFData([[1, 10, 'TOTAL A PAGAR 1.234,56']]);
        expect(extractTotalFromPDF(pdfData)).toBe(1234.56);
    });

    test('ignores subtotal labels', () => {
        const pdfData = makePDFData([
            [1, 10, 'SUBTOTAL A PAGAR 12,00'],
            [1, 20, 'TOTAL A PAGAR 82,97'],
        ]);
        expect(extractTotalFromPDF(pdfData)).toBe(82.97);
    });

    test('ignores labels containing the invoice total text', () => {
        const pdfData = makePDFData([[1, 10, 'NAO TOTAL A PAGAR 12,00']]);
        expect(() => extractTotalFromPDF(pdfData)).toThrow('TOTAL (R$) not found');
    });
});

// ---------------------------------------------------------------------------
// extractDueDateFromPDF
// ---------------------------------------------------------------------------
describe('corsanEmailParser.extractDueDateFromPDF', () => {
    test('extracts due date from PDF with Vencimento on same line as date', () => {
        const result = extractDueDateFromPDF(PDF_FIXTURE_WITH_TOTAL);
        expect(result).toBeInstanceOf(Date);
        expect(result.getDate()).toBe(15);
        expect(result.getMonth()).toBe(2); // March = 2
        expect(result.getFullYear()).toBe(2024);
    });

    test('extracts due date when Vencimento text includes the date inline', () => {
        const pdfData = makePDFData([
            [1, 10, 'Vencimento: 20/06/2024'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '80,00'],
        ]);
        const result = extractDueDateFromPDF(pdfData);
        expect(result).toBeInstanceOf(Date);
        expect(result.getDate()).toBe(20);
        expect(result.getMonth()).toBe(5); // June = 5
    });

    test('returns null when Vencimento is not found', () => {
        const result = extractDueDateFromPDF(PDF_FIXTURE_NO_VENCIMENT);
        expect(result).toBeNull();
    });

    test('extracts due date from the current Aegea layout', () => {
        const result = extractDueDateFromPDF(PDF_FIXTURE_AEGEA_LAYOUT);
        expect(result).toBeInstanceOf(Date);
        expect(result.getDate()).toBe(30);
        expect(result.getMonth()).toBe(7);
        expect(result.getFullYear()).toBe(2026);
    });
});

// ---------------------------------------------------------------------------
// extractReferencePeriodFromPDF
// ---------------------------------------------------------------------------
describe('corsanEmailParser.extractReferencePeriodFromPDF', () => {
    test('extracts reference period from REFERÊNCIA field with Abr/2026 format', () => {
        const pdfData = makePDFData([
            [1, 10, 'CORSAN'],
            [1, 20, 'REFERÊNCIA'],
            [5, 20, 'Abr/2026'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '75,63'],
        ]);
        const result = extractReferencePeriodFromPDF(pdfData);
        expect(result).toBe('04/2026');
    });

    test('extracts reference period when inline with REFERÊNCIA label', () => {
        const pdfData = makePDFData([
            [1, 10, 'REFERÊNCIA: Mar/2025'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '95,00'],
        ]);
        const result = extractReferencePeriodFromPDF(pdfData);
        expect(result).toBe('03/2025');
    });

    test('returns null when REFERÊNCIA is not found', () => {
        const pdfData = makePDFData([
            [1, 10, 'CORSAN'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '50,00'],
        ]);
        const result = extractReferencePeriodFromPDF(pdfData);
        expect(result).toBeNull();
    });

    test('handles December format Dez/2024', () => {
        const pdfData = makePDFData([
            [1, 10, 'REFERÊNCIA'],
            [5, 10, 'Dez/2024'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '60,00'],
        ]);
        const result = extractReferencePeriodFromPDF(pdfData);
        expect(result).toBe('12/2024');
    });

    test('handles October format Out/2024', () => {
        const pdfData = makePDFData([
            [1, 10, 'REFERÊNCIA'],
            [5, 10, 'Out/2024'],
        ]);
        expect(extractReferencePeriodFromPDF(pdfData)).toBe('10/2024');
    });

    test('extracts numeric reference period from the current Aegea layout', () => {
        expect(extractReferencePeriodFromPDF(PDF_FIXTURE_AEGEA_LAYOUT)).toBe('08/2026');
    });
});

const _originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// fetch (integration)
// ---------------------------------------------------------------------------
describe('corsanEmailParser.fetch', () => {
    const period = { month: 0, year: 2024 };

    beforeEach(() => {
        mockGetMessages.mockReset();
        mockGetMessages.mockImplementation(() => Promise.resolve(null));

        // Reset the parser mock before each test
        resetParser();
        _responseHandler = null;
    });

    afterEach(() => {
        // Clean up - reset parser back to default
        resetParser();
        mockGetMessages.mockReset();
        _mockResponse = null;
        _mockEvaluateResult = null;
        _evaluatedEndpoint = null;
        _responseHandler = null;
    });

    test('returns parsed data for a valid email with PDF', async () => {
        mockGetMessages.mockImplementationOnce(() =>
            Promise.resolve([makeMessage(CORSAN_HTML_FIXTURE)])
        );
        setNextPdfData(PDF_FIXTURE_WITH_TOTAL);

        const result = await corsanFetch('corsan@corsan.com.br', 'Conta de água', period);
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(95);
        expect(result[0].dueDate).toBeInstanceOf(Date);
        expect(result[0].dueDate.getDate()).toBe(15);
        expect(result[0].referencePeriod).toBeNull();
    });

    test('returns parsed data with reference period from PDF', async () => {
        mockGetMessages.mockImplementationOnce(() =>
            Promise.resolve([makeMessage(CORSAN_HTML_FIXTURE)])
        );
        const pdfWithRef = makePDFData([
            [1, 10, 'CORSAN'],
            [1, 20, 'Vencimento'],
            [5, 20, '17/04/2026'],
            [1, 25, 'REFERÊNCIA'],
            [5, 25, 'Abr/2026'],
            [1, 30, 'TOTAL (R$)'],
            [5, 30, '75,63'],
        ]);
        setNextPdfData(pdfWithRef);

        const result = await corsanFetch('corsan@corsan.com.br', 'Conta de água', period);
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(75.63);
        expect(result[0].referencePeriod).toBe('04/2026');
    });

    test('parses PDF bytes from Aegea JSON response without content type', async () => {
        mockGetMessages.mockImplementationOnce(() =>
            Promise.resolve([makeMessage('<a href="https://cliente.aegea.com.br/fatura-eletronica/download?u=corsanweb&amp;nf=203064644&amp;k=test">Clique aqui para ver sua fatura</a>')])
        );
        mockAegeaJsonResponse(Buffer.from('%PDF-1.4 fake'));
        setNextPdfData(PDF_FIXTURE_WITH_TOTAL);

        const result = await corsanFetch('corsan@corsan.com.br', 'Conta de água', period);

        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(95);
        expect(_parsedPdfBuffer.toString('ascii')).toBe('%PDF-1.4 fake');
        expect(_evaluatedEndpoint).toBe('https://api.aegea.com.br/external/agencia-virtual/app/v1/publico/fatura-eletronica/download?u=corsanweb&nf=203064644&k=test');
    });

    test('returns empty array when no messages are found', async () => {
        mockGetMessages.mockImplementationOnce(() => Promise.resolve(null));

        const result = await corsanFetch('addr', 'subject', period);
        expect(result).toEqual([]);
    });

    test('returns empty array when no HTML body is found', async () => {
        mockGetMessages.mockImplementationOnce(() =>
            Promise.resolve([{ payload: { mimeType: 'text/plain', body: { data: 'plain' } } }])
        );

        const result = await corsanFetch('addr', 'subject', period);
        expect(result).toEqual([]);
    });

    test('returns empty array when no PDF link is found in HTML', async () => {
        mockGetMessages.mockImplementationOnce(() =>
            Promise.resolve([makeMessage(CORSAN_HTML_NO_LINK)])
        );

        const result = await corsanFetch('addr', 'subject', period);
        expect(result).toEqual([]);
    });
});
