import { mock, describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Store the pdf2json ready handler so tests can trigger it
let _pdfReadyHandler = null;
let _pdfErrorHandler = null;
let _nextPdfData = null;

// Mock pdf2json
mock.module('pdf2json', () => ({
    default: function MockPDFParser() {
        this.on = (event, handler) => {
            if (event === 'pdfParser_dataReady') _pdfReadyHandler = handler;
            if (event === 'pdfParser_dataError') _pdfErrorHandler = handler;
        };
        this.parseBuffer = () => {
            if (_nextPdfData) {
                const data = _nextPdfData;
                // Resolve synchronously so the Promise in parsePDFBuffer resolves
                process.nextTick(() => _pdfReadyHandler(data));
                _nextPdfData = null;
            }
        };
    }
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

import { fetch as corsanFetch, extractPDFLink, extractTotalFromPDF, extractDueDateFromPDF } from '../parser/corsanEmailParser.js';

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

// Set the PDF data that will be returned by the mock parser
function setNextPdfData(pdfData) {
    _nextPdfData = pdfData;
}

// Helper to create a fake PDF response for global fetch
function mockFetchSuccess() {
    const fakePDF = Buffer.from('%PDF-1.4 fake content');
    globalThis.fetch = mock(() => Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(fakePDF)
    }));
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
});

const _originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// fetch (integration)
// ---------------------------------------------------------------------------
describe('corsanEmailParser.fetch', () => {
    const period = { month: 0, year: 2024 };

    beforeEach(() => {
        mockFetchSuccess();
    });

    afterEach(() => {
        globalThis.fetch = _originalFetch;
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
