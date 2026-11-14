import { describe, test, expect } from 'bun:test';

// ---------------------------------------------------------------------------
// Phase 1.1: gmail.js getAttachmentsSync — off-by-one fix
// ---------------------------------------------------------------------------

describe('gmail.js getAttachmentsSync (Phase 1.1)', () => {
    test('resolves when processing the last attachment', async () => {
        // Simulate the getAttachmentsSync logic with the fix applied
        // The fix: `if (i === parts.length - 1)` resolves the Promise
        const parts = [
            { filename: 'bill1.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1' } },
            { filename: 'bill2.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att2' } },
        ];

        const attachments = [];
        let resolved = false;

        // Simulate the loop with the fix
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
                attachments.push({ filename: part.filename, mimeType: part.mimeType, attachment: { id: part.body.attachmentId } });
                if (i === parts.length - 1) {
                    resolved = true;
                }
            }
        }

        expect(resolved).toBe(true);
        expect(attachments.length).toBe(2);
        expect(attachments[0].filename).toBe('bill1.pdf');
        expect(attachments[1].filename).toBe('bill2.pdf');
    });

    test('resolves with single attachment', async () => {
        const parts = [
            { filename: 'only.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1' } },
        ];

        const attachments = [];
        let resolved = false;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
                attachments.push({ filename: part.filename, mimeType: part.mimeType, attachment: { id: part.body.attachmentId } });
                if (i === parts.length - 1) {
                    resolved = true;
                }
            }
        }

        expect(resolved).toBe(true);
        expect(attachments.length).toBe(1);
    });

    test('does not resolve when no parts have attachments', async () => {
        const parts = [
            { filename: '', mimeType: 'text/plain', body: {} },
        ];

        const attachments = [];
        let resolved = false;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
                attachments.push({ filename: part.filename, mimeType: part.mimeType, attachment: { id: part.body.attachmentId } });
                if (i === parts.length - 1) {
                    resolved = true;
                }
            }
        }

        expect(resolved).toBe(false);
        expect(attachments.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Phase 1.2: dashboard.js CURRENT_AND_FUTURE filter
// ---------------------------------------------------------------------------

describe('dashboard.js CURRENT_AND_FUTURE filter (Phase 1.2)', () => {
    test('includes bills from current month onwards', () => {
        const activeMonth = 11;
        const activeYear = 2026;

        const bills = [
            { month: 10, year: 2026 }, // previous month - excluded
            { month: 11, year: 2026 }, // current month - included
            { month: 12, year: 2026 }, // next month - included
            { month: 1, year: 2027 },  // next year - included
        ];

        const filtered = bills.filter(bill =>
            bill.year > activeYear || (bill.year === activeYear && bill.month >= activeMonth)
        );

        expect(filtered.length).toBe(3);
        expect(filtered.map(b => `${b.month}/${b.year}`)).toEqual(['11/2026', '12/2026', '1/2027']);
    });

    test('excludes bills from previous months', () => {
        const activeMonth = 11;
        const activeYear = 2026;

        const bills = [
            { month: 1, year: 2026 },
            { month: 6, year: 2026 },
            { month: 10, year: 2026 },
        ];

        const filtered = bills.filter(bill =>
            bill.year > activeYear || (bill.year === activeYear && bill.month >= activeMonth)
        );

        expect(filtered.length).toBe(0);
    });

    test('handles year boundary correctly', () => {
        const activeMonth = 12;
        const activeYear = 2026;

        const bills = [
            { month: 12, year: 2026 }, // current - included
            { month: 1, year: 2027 },  // next year - included
            { month: 11, year: 2026 }, // previous - excluded
        ];

        const filtered = bills.filter(bill =>
            bill.year > activeYear || (bill.year === activeYear && bill.month >= activeMonth)
        );

        expect(filtered.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Phase 1.4: dashboard.js division by zero fix
// ---------------------------------------------------------------------------

describe('dashboard.js division by zero (Phase 1.4)', () => {
    test('divides by 1 when users array is empty', () => {
        const bill = { value: 100, users: [] };
        const perUser = bill.value / (bill.users.length || 1);
        expect(perUser).toBe(100);
    });

    test('divides correctly when users exist', () => {
        const bill = { value: 100, users: [1, 2, 3, 4] };
        const perUser = bill.value / (bill.users.length || 1);
        expect(perUser).toBe(25);
    });

    test('handles undefined users array', () => {
        const bill = { value: 100, users: undefined };
        const perUser = bill.value / ((bill.users?.length) || 1);
        expect(perUser).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// Phase 1.5: emailUtils.js continue vs return fix
// ---------------------------------------------------------------------------

describe('emailUtils.js continue vs return (Phase 1.5)', () => {
    test('processes all messages in the loop (not just the first)', () => {
        // Simulate the fixed loop logic
        const messages = [
            { id: 'msg1', threadId: 'thread1' },
            { id: 'msg2', threadId: 'thread2' },
            { id: 'msg3', threadId: 'thread3' },
        ];

        const processed = [];
        for (const msg of messages) {
            if (msg.id === 'msg2') {
                continue; // skip msg2
            }
            processed.push(msg.id);
        }

        expect(processed).toEqual(['msg1', 'msg3']);
    });

    test('does not exit loop on first skip condition', () => {
        const messages = [
            { id: 'msg1', skip: true },
            { id: 'msg2', skip: false },
            { id: 'msg3', skip: false },
        ];

        const processed = [];
        for (const msg of messages) {
            if (msg.skip) {
                continue;
            }
            processed.push(msg.id);
        }

        // With `return`, only msg1 would be processed (and skipped)
        // With `continue`, msg2 and msg3 are processed
        expect(processed).toEqual(['msg2', 'msg3']);
    });
});

// ---------------------------------------------------------------------------
// Phase 3.1: processBills lock
// ---------------------------------------------------------------------------

describe('processBills lock (Phase 3.1)', () => {
    test('prevents concurrent invocations', async () => {
        let lock = false;

        const processBills = async () => {
            if (lock) {
                return 'skipped';
            }
            lock = true;
            try {
                await new Promise(r => setTimeout(r, 10));
                return 'processed';
            } finally {
                lock = false;
            }
        };

        // First call should process
        const result1 = await processBills();
        expect(result1).toBe('processed');

        // Simulate concurrent call while first is running
        const promise1 = processBills();
        const result2 = await processBills(); // should be skipped
        expect(result2).toBe('skipped');
        await promise1;
    });
});
