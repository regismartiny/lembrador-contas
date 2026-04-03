import { mock, describe, test, expect } from 'bun:test';

// Mock Gmail-dependent module — db.js and logger.js are handled by setup.js preload
//
// The snippet format CORSAN emails use:
//   "Código do Imóvel: XXXXXXXXXXX Vencimento: DD/MM/YYYY Valor: XX,XX ..."
//
// parse() extracts fields by string search + fixed-length substring:
//   - codImovel:  11 chars after "Código do Imóvel: "
//   - vencimento: 10 chars after "Vencimento: "  (DD/MM/YYYY)
//   - valor:       5 chars after "Valor: "        (XX,XX)

const FIXTURE_SNIPPET =
    'Código do Imóvel: 12345678901 Vencimento: 15/01/2024 Valor: 95,00 outras informações';

const mockGetMessages = mock(() => Promise.resolve([{ snippet: FIXTURE_SNIPPET }]));

mock.module('../util/emailUtils.js', () => ({
    default: { getMessagesByDateInterval: mockGetMessages }
}));

import corsanEmailParser from '../parser/corsanEmailParser.js';

describe('corsanEmailParser.fetch', () => {
    const period = { month: 0, year: 2024 };

    test('returns one parsed record for a valid snippet', async () => {
        const result = await corsanEmailParser.fetch('pagamentos@corsan.com.br', 'Sua conta de água', period);
        expect(result).toHaveLength(1);
    });

    test('extracted value is correct', async () => {
        const [record] = await corsanEmailParser.fetch('addr', 'subject', period);
        expect(record.value).toBe(95);
    });

    test('extracted dueDate is on the 15th of January 2024', async () => {
        const [record] = await corsanEmailParser.fetch('addr', 'subject', period);
        expect(record.dueDate).toBeInstanceOf(Date);
        expect(record.dueDate.getDate()).toBe(15);
        expect(record.dueDate.getMonth()).toBe(0);
        expect(record.dueDate.getFullYear()).toBe(2024);
    });

    test('returns empty array when no messages are found', async () => {
        mockGetMessages.mockImplementationOnce(() => Promise.resolve(null));
        const result = await corsanEmailParser.fetch('addr', 'subject', period);
        expect(result).toEqual([]);
    });
});
