import { mock, describe, test, expect, afterAll } from 'bun:test';

const mockGetMessages = mock(() => Promise.resolve(null));

// Mock Gmail-dependent modules — db.js and logger.js are handled by setup.js preload
mock.module('../util/emailUtils.js', () => ({
    default: { getMessagesByDateInterval: mockGetMessages }
}));

afterAll(() => {
    mock.restore();
});

const encodeBodyData = (text) => Buffer.from(text, 'utf8').toString('base64');

import { fetch as cpflFetch, parseHTML, parseEmailData } from '../parser/cpflEmailParser.js';

// ---------------------------------------------------------------------------
// HTML fixture
//
// The parser traverses the DOM as follows from the R$ span:
//   elemValor                          → <span>R$ 150,00 </span>
//   .parentElement                     → <td> (valor cell)
//   .parentElement                     → <tr> (valor row)
//   .previousElementSibling            → <tr> (vencimento row)
//     .childNodes[0]                   → <td>
//     .childNodes[1]                   → <span>    15/01/2024</span>
//   ...previousElementSibling          → <tr> (mesReferencia row)
//     .childNodes[0].childNodes[1]     → <span>    01/2024</span>
//   ...previousElementSibling          → <tr> (instalacao row)
//     .childNodes[0].childNodes[1]     → <span>    1234567890</span>
//
// innerHTML.substring(4) strips the 4-char prefix from each data span.
// valor: "R$ 150,00 ".substring(3, length-1) → "150,00" → 150
// ---------------------------------------------------------------------------
const CPFL_HTML_FIXTURE = [
    '<table>',
    '<tr><td><span>Instalacao:</span><span>    1234567890</span></td></tr>',
    '<tr><td><span>Mes Ref:</span><span>    01/2024</span></td></tr>',
    '<tr><td><span>Vencimento:</span><span>    15/01/2024</span></td></tr>',
    '<tr><td><span>Valor:</span><span>R$ 150,00 </span></td></tr>',
    '</table>',
].join('');

describe('cpflEmailParser.parseHTML', () => {
    test('extracts valor from valid CPFL HTML', () => {
        const result = parseHTML(CPFL_HTML_FIXTURE);
        expect(result.valor).toBe(150);
    });

    test('extracts vencimento as Date from valid CPFL HTML', () => {
        const result = parseHTML(CPFL_HTML_FIXTURE);
        expect(result.vencimento).toBeInstanceOf(Date);
        expect(result.vencimento.getDate()).toBe(15);
        expect(result.vencimento.getMonth()).toBe(0);       // January = 0
        expect(result.vencimento.getFullYear()).toBe(2024);
    });

    test('extracts mesReferencia from valid CPFL HTML', () => {
        const result = parseHTML(CPFL_HTML_FIXTURE);
        expect(result.mesReferencia).toBe('01/2024');
    });

    test('extracts instalacao from valid CPFL HTML', () => {
        const result = parseHTML(CPFL_HTML_FIXTURE);
        expect(result.instalacao).toBe('1234567890');
    });

    test('throws when R$ span is missing', () => {
        const badHtml = '<table><tr><td><span>No price here</span></td></tr></table>';
        expect(() => parseHTML(badHtml)).toThrow();
    });

    test('parses values >= R$ 1.000,00 with Brazilian thousands separator', () => {
        const highValueHtml = CPFL_HTML_FIXTURE.replace('R$ 150,00 ', 'R$ 1.234,56 ');
        const result = parseHTML(highValueHtml);
        expect(result.valor).toBe(1234.56);
    });
});

describe('cpflEmailParser.parseEmailData', () => {
    test('parses a message object using its body data', () => {
        const msg = { payload: { mimeType: 'text/html', body: { data: encodeBodyData(CPFL_HTML_FIXTURE) } } };
        const result = parseEmailData(msg);
        expect(result.valor).toBe(150);
        expect(result.vencimento).toBeInstanceOf(Date);
    });

    test('parses a multipart message with HTML part', () => {
        const msg = {
            payload: {
                mimeType: 'multipart/mixed',
                parts: [
                    { mimeType: 'text/plain', body: { data: encodeBodyData('plain text') } },
                    { mimeType: 'text/html', body: { data: encodeBodyData(CPFL_HTML_FIXTURE) } },
                ],
            },
        };
        const result = parseEmailData(msg);
        expect(result.valor).toBe(150);
    });

    test('returns undefined when body data is missing', () => {
        const msg = { payload: { mimeType: 'text/html', body: { data: null } } };
        const result = parseEmailData(msg);
        expect(result).toBeUndefined();
    });
});

describe('cpflEmailParser.fetch', () => {
    test('returns empty array when messages array is empty and uses last day of month', async () => {
        mockGetMessages.mockReset();
        mockGetMessages.mockImplementationOnce(() => Promise.resolve([]));
        const result = await cpflFetch('cpfl@example.com', 'Conta', { month: 1, year: 2024 });
        expect(result).toEqual([]);
        const [, , startDate, endDate] = mockGetMessages.mock.calls[0];
        expect(startDate.getMonth()).toBe(1);
        expect(startDate.getDate()).toBe(1);
        expect(endDate.getMonth()).toBe(1);
        expect(endDate.getDate()).toBe(29);
    });
});
