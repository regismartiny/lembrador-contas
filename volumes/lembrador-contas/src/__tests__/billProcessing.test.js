import { describe, test, expect } from 'bun:test';

// db.js and logger.js are mocked globally via src/__tests__/setup.js (bunfig.toml preload)
import billProcessing from '../util/billProcessing.js';

// ---------------------------------------------------------------------------
// getBillMonth
// ---------------------------------------------------------------------------

describe('getBillMonth', () => {
    test('returns "month/year" string with 1-based month', () => {
        expect(billProcessing.getBillMonth(new Date(2024, 0, 15))).toBe('1/2024');
        expect(billProcessing.getBillMonth(new Date(2024, 11, 1))).toBe('12/2024');
        expect(billProcessing.getBillMonth(new Date(2023, 5, 10))).toBe('6/2023');
    });
});

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
    test('returns array of 3 periods', () => {
        const periods = billProcessing.getDefaultPeriods();
        expect(periods).toHaveLength(3);
    });

    test('each period has month and year properties', () => {
        const periods = billProcessing.getDefaultPeriods();
        for (const period of periods) {
            expect(period).toHaveProperty('month');
            expect(period).toHaveProperty('year');
        }
    });

    test('middle period is the current month', () => {
        const periods = billProcessing.getDefaultPeriods();
        const now = new Date();
        expect(periods[1].month).toBe(now.getMonth());
        expect(periods[1].year).toBe(now.getFullYear());
    });

    test('first period is previous month', () => {
        const periods = billProcessing.getDefaultPeriods();
        const now = new Date();
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        expect(periods[0].month).toBe(prevMonth);
        expect(periods[0].year).toBe(prevYear);
    });

    test('last period is next month', () => {
        const periods = billProcessing.getDefaultPeriods();
        const now = new Date();
        const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
        const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
        expect(periods[2].month).toBe(nextMonth);
        expect(periods[2].year).toBe(nextYear);
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
