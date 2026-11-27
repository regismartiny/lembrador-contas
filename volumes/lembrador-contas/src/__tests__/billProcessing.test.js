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

describe('logger formatting', () => {
    test('includes additional values in the logged message', async () => {
        const { formatLogMessage } = await import('../util/logger.js');
        const periods = [{ month: 0, year: 2024 }];
        expect(formatLogMessage('Processing bills for periods', periods)).toBe('Processing bills for periods [{"month":0,"year":2024}]');
    });

    test('formats Error instances with their message', async () => {
        const { formatLogMessage } = await import('../util/logger.js');
        const error = new Error('boom');
        const formatted = formatLogMessage('Failed to process bill', error);
        expect(formatted).toContain('Failed to process bill');
        expect(formatted).toContain('boom');
    });
});

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

    test('sets dueDate month using 0-based month for 1-based table period', async () => {
        mockData.tables.length = 0;
        mockData.tables.push({
            _id: 'table-march',
            data: [{ period: { month: 3, year: 2026 }, value: 250 }],
        });
        const bill = {
            name: 'Condomínio', valueSourceId: 'table-march',
            dueDay: 10, type: 'RECURRENT_SERVICE',
            users: [], icon: null, paymentType: 'PIX',
        };
        const result = await billProcessing.findActiveTableBills([bill], [{ month: 2, year: 2026 }]);
        expect(result).toHaveLength(1);
        expect(result[0].dueDate.getFullYear()).toBe(2026);
        expect(result[0].dueDate.getMonth()).toBe(2); // March (0-based)
        expect(result[0].dueDate.getDate()).toBe(10);
        expect(result[0].referencePeriod).toBe('03/2026');
        mockData.tables.length = 0;
    });
});

describe('processBills', () => {
    test('preserves status PAID and updates updated_at on reprocess', async () => {
        mockData.tables.length = 0;
        mockData.activeBills.length = 0;
        const dueDate = new Date(2026, 2, 10);
        const oldUpdatedAt = new Date(2026, 0, 1);
        mockData.activeBills.push({
            _id: 'paid-bill-1',
            name: 'Internet',
            dueDate,
            value: 100,
            status: 'PAID',
            updated_at: oldUpdatedAt,
        });
        mockData.tables.push({
            _id: 'table-paid',
            data: [{ period: { month: 3, year: 2026 }, value: 120 }],
        });

        const bills = [{
            name: 'Internet',
            valueSourceType: 'TABLE',
            valueSourceId: 'table-paid',
            dueDay: 10,
            type: 'RECURRENT_SERVICE',
            users: [],
            icon: null,
            paymentType: 'PIX',
        }];

        await billProcessing.processBills(bills, JSON.stringify([{ month: 2, year: 2026 }]));

        const updated = mockData.activeBills.find(b => b._id === 'paid-bill-1');
        expect(updated.status).toBe('PAID');
        expect(updated.value).toBe(120);
        expect(updated.updated_at.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());

        mockData.tables.length = 0;
        mockData.activeBills.length = 0;
    });

    test('sets status UNPAID and created_at when inserting a new bill', async () => {
        mockData.tables.length = 0;
        mockData.activeBills.length = 0;
        mockData.tables.push({
            _id: 'table-new',
            data: [{ period: { month: 4, year: 2026 }, value: 85 }],
        });
        const bills = [{
            name: 'Nova Conta',
            valueSourceType: 'TABLE',
            valueSourceId: 'table-new',
            dueDay: 15,
            type: 'RECURRENT_SERVICE',
            users: [],
            icon: null,
            paymentType: 'PIX',
        }];

        const result = await billProcessing.processBills(bills, JSON.stringify([{ month: 3, year: 2026 }]));
        expect(result.skipped).toBe(false);
        const inserted = mockData.activeBills.find(b => b.name === 'Nova Conta');
        expect(inserted).toBeDefined();
        expect(inserted.status).toBe('UNPAID');
        expect(inserted.created_at).toBeInstanceOf(Date);
        expect(inserted.updated_at).toBeInstanceOf(Date);

        mockData.tables.length = 0;
        mockData.activeBills.length = 0;
    });

    test('returns { skipped: true } on concurrent invocation', async () => {
        mockData.tables.length = 0;
        mockData.activeBills.length = 0;
        const slowBill = {
            name: 'Slow',
            valueSourceType: 'TABLE',
            valueSourceId: 'table-slow',
            dueDay: 10,
            type: 'RECURRENT_SERVICE',
            users: [],
            icon: null,
            paymentType: 'PIX',
        };
        const p1 = billProcessing.processBills([slowBill], JSON.stringify([{ month: 3, year: 2026 }]));
        const p2 = billProcessing.processBills([slowBill], JSON.stringify([{ month: 3, year: 2026 }]));
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1.skipped).toBe(false);
        expect(r2.skipped).toBe(true);
    });
});

describe('findActiveEmailBills', () => {
    test('returns empty array when email configuration cannot be loaded', async () => {
        const bill = {
            name: 'Electricity', valueSourceId: 'missing-email-config',
            dueDay: 15, users: [], icon: null, paymentType: 'PIX'
        };

        const result = await billProcessing.findActiveEmailBills([bill], [{ month: 0, year: 2024 }]);
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

    test('blocks SSRF internal API URLs without calling fetch', async () => {
        mockData.apis.length = 0;
        mockData.apis.push({
            _id: 'ssrf-api',
            url: 'http://169.254.169.254/latest/meta-data/',
            method: 'GET',
            value: 'price',
        });
        const originalFetch = globalThis.fetch;
        let fetchCalled = false;
        globalThis.fetch = () => { fetchCalled = true; return Promise.reject(new Error('should not be called')); };
        try {
            const bill = {
                name: 'Blocked API', valueSourceId: 'ssrf-api',
                dueDay: 5, type: 'RECURRENT_SERVICE',
                users: [], icon: null, paymentType: 'PIX',
            };
            const result = await billProcessing.findActiveApiBills([bill], periods);
            expect(fetchCalled).toBe(false);
            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('ERROR');
        } finally {
            globalThis.fetch = originalFetch;
            mockData.apis.length = 0;
        }
    });

    test('passes AbortSignal timeout to fetch for valid external API URL', async () => {
        mockData.apis.length = 0;
        mockData.apis.push({
            _id: 'public-api',
            url: 'https://api.example.com/price',
            method: 'GET',
            value: 'data.amount',
        });
        const originalFetch = globalThis.fetch;
        let capturedOptions = null;
        globalThis.fetch = (_url, opts) => {
            capturedOptions = opts;
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: { amount: 42.5 } }),
            });
        };
        try {
            const bill = {
                name: 'Public API', valueSourceId: 'public-api',
                dueDay: 5, type: 'RECURRENT_SERVICE',
                users: [], icon: null, paymentType: 'PIX',
            };
            const result = await billProcessing.findActiveApiBills([bill], periods);
            expect(capturedOptions.signal).toBeInstanceOf(AbortSignal);
            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('UNPAID');
            expect(result[0].value).toBe(42.5);
        } finally {
            globalThis.fetch = originalFetch;
            mockData.apis.length = 0;
        }
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

        // Only expect table periods to be included when they are the previous, current or future months
        const now = new Date();
        let prevMonth = now.getMonth() - 1;
        let prevYear = now.getFullYear();
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }

        for (const d of [{ month: 3, year: 2026 }, { month: 4, year: 2026 }]) {
            const month0 = d.month - 1;
            const shouldInclude = (d.year > prevYear) || (d.year === prevYear && month0 >= prevMonth);
            const found = periods.find(p => p.month === month0 && p.year === d.year);
            if (shouldInclude) {
                expect(found).toBeDefined();
            } else {
                expect(found).toBeUndefined();
            }
        }

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
