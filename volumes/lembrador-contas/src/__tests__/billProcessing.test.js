import { describe, test, expect } from 'bun:test';

// db.js and logger.js are mocked globally via src/__tests__/setup.js (bunfig.toml preload)
import billProcessing from '../util/billProcessing.js';
import { mockData } from './setup.js';

// ---------------------------------------------------------------------------
// getSum
// ---------------------------------------------------------------------------

describe('getSum', () => {
    test('adds two valid numbers', () => {
        expect(billProcessing.getSum(10, 5)).toBe(15);
        expect(billProcessing.getSum(0, 100)).toBe(100);
    });

    test('treats NaN as 0', () => {
        expect(billProcessing.getSum(10, NaN)).toBe(10);
    });

    test('treats undefined as 0', () => {
        expect(billProcessing.getSum(10, undefined)).toBe(10);
    });

    test('works as Array.reduce accumulator', () => {
        expect([1, 2, 3, 4].reduce(billProcessing.getSum, 0)).toBe(10);
        expect([50, NaN, 25, undefined].reduce(billProcessing.getSum, 0)).toBe(75);
    });
});

// ---------------------------------------------------------------------------
// groupByPaymentType
// ---------------------------------------------------------------------------

describe('groupByPaymentType', () => {
    test('returns empty array for an empty bill list', () => {
        expect(billProcessing.groupByPaymentType([])).toEqual([]);
    });

    test('groups bills by paymentType', () => {
        const bills = [
            { name: 'Água',    paymentType: 'PIX',      value: 100 },
            { name: 'Luz',     paymentType: 'PIX',      value: 200 },
            { name: 'Mercado', paymentType: 'DINHEIRO', value: 300 },
        ];
        const result = billProcessing.groupByPaymentType(bills);

        expect(result).toHaveLength(2);

        const pix = result.find(g => g.type === 'PIX');
        expect(pix.total).toBe(300);
        expect(pix.bills).toHaveLength(2);

        const dinheiro = result.find(g => g.type === 'DINHEIRO');
        expect(dinheiro.total).toBe(300);
        expect(dinheiro.bills).toHaveLength(1);
    });

    test('sorts bills alphabetically within each group', () => {
        const bills = [
            { name: 'Luz',  paymentType: 'PIX', value: 200 },
            { name: 'Água', paymentType: 'PIX', value: 100 },
        ];
        const [group] = billProcessing.groupByPaymentType(bills);
        expect(group.bills[0].name).toBe('Água');
        expect(group.bills[1].name).toBe('Luz');
    });

    test('defaults to PIX when paymentType is missing', () => {
        const bills = [{ name: 'Conta', value: 50 }];
        const [group] = billProcessing.groupByPaymentType(bills);
        expect(group.type).toBe('PIX');
        expect(group.total).toBe(50);
    });

    test('sums values correctly within a group', () => {
        const bills = [
            { name: 'A', paymentType: 'PIX', value: 150.5 },
            { name: 'B', paymentType: 'PIX', value: 49.5  },
        ];
        const [group] = billProcessing.groupByPaymentType(bills);
        expect(group.total).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// findActiveTableBills — mocked db always returns null for findById
// ---------------------------------------------------------------------------

describe('findActiveTableBills', () => {
    const periods = [{ month: 0, year: 2024 }];

    test('returns empty array when the referenced table is not found', async () => {
        const bill = {
            name: 'Internet', valueSourceId: 'nonexistent-id',
            dueDay: 10, type: 'RECURRENT_SERVICE',
            users: [], icon: null, paymentType: 'PIX'
        };
        const result = await billProcessing.findActiveTableBills([bill], periods);
        expect(result).toEqual([]);
    });

    test('returns empty array when bill list is empty', async () => {
        const result = await billProcessing.findActiveTableBills([], periods);
        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// findActiveApiBills — mocked db always returns null for findById
// ---------------------------------------------------------------------------

describe('findActiveApiBills', () => {
    const periods = [{ month: 0, year: 2024 }];

    test('returns empty array when the referenced API config is not found', async () => {
        const bill = {
            name: 'Crypto', valueSourceId: 'nonexistent-api',
            dueDay: 5, type: 'RECURRENT_SERVICE',
            users: [], icon: null, paymentType: 'PIX'
        };
        const result = await billProcessing.findActiveApiBills([bill], periods);
        expect(result).toEqual([]);
    });

    test('returns empty array when bill list is empty', async () => {
        const result = await billProcessing.findActiveApiBills([], periods);
        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// getDefaultPeriods
// ---------------------------------------------------------------------------

describe('getDefaultPeriods', () => {
    test('returns at least 2 periods (previous + current month)', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        expect(periods.length).toBeGreaterThanOrEqual(2);
    });

    test('each period has month and year properties', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        for (const period of periods) {
            expect(period).toHaveProperty('month');
            expect(period).toHaveProperty('year');
        }
    });

    test('includes current month', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        const now = new Date();
        const current = periods.find(p => p.month === now.getMonth() && p.year === now.getFullYear());
        expect(current).toBeDefined();
    });

    test('includes previous month', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        const now = new Date();
        let prevMonth = now.getMonth() - 1;
        let prevYear = now.getFullYear();
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }
        const previous = periods.find(p => p.month === prevMonth && p.year === prevYear);
        expect(previous).toBeDefined();
    });

    test('returns sorted periods', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        for (let i = 1; i < periods.length; i++) {
            const prev = periods[i - 1];
            const curr = periods[i];
            expect(curr.year * 12 + curr.month).toBeGreaterThanOrEqual(prev.year * 12 + prev.month);
        }
    });

    test('no duplicate periods', async () => {
        const periods = await billProcessing.getDefaultPeriods([]);
        const keys = periods.map(p => `${p.month}/${p.year}`);
        expect(new Set(keys).size).toBe(periods.length);
    });

    test('extracts periods from table.data period field', async () => {
        mockData.tables.length = 0;
        mockData.tables.push({ _id: 'table1', data: [
            { period: { month: 3, year: 2026 }, value: 100 },
            { period: { month: 4, year: 2026 }, value: 120 }
        ]});

        const billsSourceTable = [{ name: 'Test Bill', valueSourceId: 'table1' }];
        const periods = await billProcessing.getDefaultPeriods(billsSourceTable);
        const hasMar2026 = periods.find(p => p.month === 2 && p.year === 2026);
        const hasApr2026 = periods.find(p => p.month === 3 && p.year === 2026);
        expect(hasMar2026).toBeDefined();
        expect(hasApr2026).toBeDefined();

        mockData.tables.length = 0;
    });
});

// ---------------------------------------------------------------------------
// resolveJsonPath
// ---------------------------------------------------------------------------

describe('resolveJsonPath', () => {
    test('resolves a single-level path', () => {
        expect(billProcessing.resolveJsonPath({ price: 42 }, 'price')).toBe(42);
    });

    test('resolves a nested path', () => {
        expect(billProcessing.resolveJsonPath({ data: { price: 42 } }, 'data.price')).toBe(42);
    });

    test('returns undefined for missing path', () => {
        expect(billProcessing.resolveJsonPath({ data: {} }, 'data.missing')).toBeUndefined();
    });

    test('returns undefined for empty object', () => {
        expect(billProcessing.resolveJsonPath({}, 'foo.bar')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getBillName
// ---------------------------------------------------------------------------

describe('getBillName', () => {
    test('returns plain name for RECURRENT_SERVICE', () => {
        const bill = { name: 'Internet', type: 'RECURRENT_SERVICE' };
        expect(billProcessing.getBillName(bill, 0, 3)).toBe('Internet');
    });

    test('returns name with installment for PURCHASE', () => {
        const bill = { name: 'Celular', type: 'PURCHASE' };
        expect(billProcessing.getBillName(bill, 1, 10)).toBe('Celular (2/10)');
    });

    test('returns first installment correctly', () => {
        const bill = { name: 'Notebook', type: 'PURCHASE' };
        expect(billProcessing.getBillName(bill, 0, 12)).toBe('Notebook (1/12)');
    });
});

// ---------------------------------------------------------------------------
// getDateFromPeriod
// ---------------------------------------------------------------------------

describe('getDateFromPeriod', () => {
    test('returns correct Date from period and dueDay', () => {
        const date = billProcessing.getDateFromPeriod({ month: 0, year: 2024 }, 15);
        expect(date.getFullYear()).toBe(2024);
        expect(date.getMonth()).toBe(0);
        expect(date.getDate()).toBe(15);
    });

    test('handles December correctly', () => {
        const date = billProcessing.getDateFromPeriod({ month: 11, year: 2024 }, 31);
        expect(date.getMonth()).toBe(11);
        expect(date.getDate()).toBe(31);
    });
});

// ---------------------------------------------------------------------------
// filterCurrentPeriodData
// ---------------------------------------------------------------------------

describe('filterCurrentPeriodData', () => {
    test('matches when data.month (1-based) equals period.month (0-based) + 1', () => {
        const data = { period: { month: 1, year: 2024 } }; // January (1-based storage)
        const period = { month: 0, year: 2024 }; // January (0-based JS month)
        expect(billProcessing.filterCurrentPeriodData(data, period)).toBe(true);
    });

    test('rejects non-matching month', () => {
        const data = { period: { month: 3, year: 2024 } }; // March (1-based)
        const period = { month: 0, year: 2024 }; // January (0-based)
        expect(billProcessing.filterCurrentPeriodData(data, period)).toBe(false);
    });

    test('rejects non-matching year', () => {
        const data = { period: { month: 1, year: 2023 } };
        const period = { month: 0, year: 2024 };
        expect(billProcessing.filterCurrentPeriodData(data, period)).toBe(false);
    });
});
