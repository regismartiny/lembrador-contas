import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { checkAndNotify, getDaysUntilDue, formatDueMessage } from '../util/notificationScheduler.js';

describe('notificationScheduler helpers', () => {
    test('getDaysUntilDue calculates calendar day differences', () => {
        const now = new Date(2026, 10, 24, 14, 30);
        expect(getDaysUntilDue(new Date(2026, 10, 24, 0, 0), now)).toBe(0);
        expect(getDaysUntilDue(new Date(2026, 10, 25, 0, 0), now)).toBe(1);
        expect(getDaysUntilDue(new Date(2026, 10, 27, 0, 0), now)).toBe(3);
    });

    test('formatDueMessage formats today, tomorrow, and multiple days', () => {
        expect(formatDueMessage('Luz', 0)).toBe('A conta "Luz" vence hoje.');
        expect(formatDueMessage('Luz', 1)).toBe('A conta "Luz" vence amanhã.');
        expect(formatDueMessage('Luz', 3)).toBe('A conta "Luz" vence em 3 dias.');
    });
});

describe('checkAndNotify', () => {
    const savedReminders = [];
    let reminderQuery = null;

    beforeEach(() => {
        savedReminders.length = 0;
        reminderQuery = null;
        process.env.VAPID_PUBLIC_KEY = 'pub';
        process.env.VAPID_PRIVATE_KEY = 'priv';
        process.env.VAPID_MAILTO = 'test@example.com';
    });

    afterEach(() => {
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;
        delete process.env.VAPID_MAILTO;
    });

    function makeMockDb({ bills = [], reminders = [], subscriptions = [] }) {
        class MockBillReminder {
            constructor(data) { Object.assign(this, data); }
            save() { savedReminders.push(this); return Promise.resolve(this); }
            static find(q) {
                reminderQuery = q;
                return { lean: () => Promise.resolve(reminders) };
            }
        }
        return {
            ActiveBill: {
                find: () => ({ lean: () => Promise.resolve(bills) }),
            },
            BillReminder: MockBillReminder,
            PushNotificationSubscription: {
                find: () => ({ lean: () => Promise.resolve(subscriptions) }),
                deleteOne: () => Promise.resolve({ deletedCount: 1 }),
            },
        };
    }

    test('does not save BillReminder when there are no active push subscriptions', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const mockDb = makeMockDb({
            bills: [{ _id: 'bill-1', name: 'Água', dueDate: tomorrow, status: 'UNPAID' }],
            subscriptions: [],
        });

        await checkAndNotify(mockDb, 3);
        expect(savedReminders).toHaveLength(0);
    });

    test('filters BillReminder query by unpaid bill ids and saves reminder with real days when delivered', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const mockDb = makeMockDb({
            bills: [{ _id: 'bill-2', name: 'Internet', dueDate: tomorrow, status: 'UNPAID' }],
            subscriptions: [{ _id: 'sub-1', endpoint: 'https://push.example.com/1', keys: { p256dh: 'k', auth: 'a' } }],
        });

        await checkAndNotify(mockDb, 3);
        expect(reminderQuery).toEqual({
            activeBill: { $in: ['bill-2'] },
            notifiedAt: { $ne: null },
        });
        expect(savedReminders).toHaveLength(1);
        expect(savedReminders[0].body).toBe('A conta "Internet" vence amanhã.');
        expect(savedReminders[0].daysBeforeDue).toBe(1);
    });

    test('skips bills that already have a sent reminder (idempotency)', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const mockDb = makeMockDb({
            bills: [{ _id: 'bill-3', name: 'Gás', dueDate: tomorrow, status: 'UNPAID' }],
            reminders: [{ activeBill: 'bill-3', notifiedAt: new Date() }],
            subscriptions: [{ _id: 'sub-1', endpoint: 'https://push.example.com/1', keys: { p256dh: 'k', auth: 'a' } }],
        });

        await checkAndNotify(mockDb, 3);
        expect(savedReminders).toHaveLength(0);
    });
});
