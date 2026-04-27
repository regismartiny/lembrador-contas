import { describe, test, expect } from 'bun:test';
import db from '../db.js';

describe('requireAdmin logic', () => {
    test('finds admin user by email', async () => {
        const user = await db.User.findOne({ email: 'admin@example.com' }).lean();
        expect(user).toBeTruthy();
        expect(user.admin).toBe(true);
    });

    test('finds non-admin user by email', async () => {
        const user = await db.User.findOne({ email: 'nonadmin@example.com' }).lean();
        expect(user).toBeTruthy();
        expect(user.admin).toBe(false);
    });

    test('returns falsy for unknown email', async () => {
        const user = await db.User.findOne({ email: 'unknown@example.com' }).lean();
        expect(user).toBeFalsy();
    });

    test('session-based admin check pattern works with mock data', async () => {
        const sessionEmail = 'admin@example.com';
        const user = await db.User.findOne({ email: sessionEmail }).lean();
        const isAdmin = user && user.admin;
        expect(isAdmin).toBe(true);
    });

    test('session-based admin check denies non-admin', async () => {
        const sessionEmail = 'nonadmin@example.com';
        const user = await db.User.findOne({ email: sessionEmail }).lean();
        const isAdmin = user && user.admin;
        expect(isAdmin).toBe(false);
    });
});
