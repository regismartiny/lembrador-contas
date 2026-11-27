import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import http from 'http';
import { mockData, resetMockData } from './setup.js';
import app from '../app.js';
import db from '../db.js';

let server;
let baseUrl;

beforeAll(() => {
    return new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

afterAll(() => {
    return new Promise((resolve) => server.close(resolve));
});

describe('GET /users/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/users/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /users/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/users/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /users/add', () => {
    test('redirects to /users/list on valid input', async () => {
        const body = new URLSearchParams({
            name: 'Test User',
            email: 'test@example.com',
        });
        const res = await fetch(`${baseUrl}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/users/list');
    });

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({ email: 'test@example.com' });
        const res = await fetch(`${baseUrl}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when email is missing', async () => {
        const body = new URLSearchParams({ name: 'Test User' });
        const res = await fetch(`${baseUrl}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when email format is invalid', async () => {
        const body = new URLSearchParams({ name: 'Test User', email: 'not-an-email' });
        const res = await fetch(`${baseUrl}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /users/edit/:id', () => {
    test('returns 404 for valid ObjectId when user not found', async () => {
        const res = await fetch(`${baseUrl}/users/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(404);
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/users/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /users/update', () => {
    test('redirects to /users/list on valid input', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Updated User',
            email: 'updated@example.com',
        });
        const res = await fetch(`${baseUrl}/users/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/users/list');
    });

    test('returns 400 when id is missing', async () => {
        const body = new URLSearchParams({
            name: 'Updated User',
            email: 'updated@example.com',
        });
        const res = await fetch(`${baseUrl}/users/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /users/remove/:id', () => {
    const userId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
        resetMockData();
    });

    afterEach(() => {
        resetMockData();
    });

    test('redirects to /users/list for valid ObjectId when user has no assigned bills', async () => {
        const res = await fetch(`${baseUrl}/users/remove/${userId}`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/users/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/users/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });

    test('blocks deletion with 409 JSON and reason when user has configured Bill assigned', async () => {
        let deleteCalled = false;
        const originalDelete = db.User.findOneAndDelete;
        db.User.findOneAndDelete = (...args) => {
            deleteCalled = true;
            return originalDelete(...args);
        };

        try {
            mockData.users.push({ _id: userId, name: 'Maria', email: 'maria@example.com', status: 'ACTIVE' });
            mockData.bills.push({
                _id: '507f1f77bcf86cd799439051',
                name: 'Internet Fibra',
                users: [userId],
                status: 'ACTIVE',
            });

            const res = await fetch(`${baseUrl}/users/remove/${userId}`, {
                method: 'POST',
                headers: { Accept: 'application/json' },
            });
            expect(res.status).toBe(409);
            const payload = await res.json();
            expect(payload.error).toContain('Maria');
            expect(payload.error).toContain('1 conta(s) cadastrada(s)');
            expect(payload.error).toContain('Internet Fibra');
            expect(deleteCalled).toBe(false);
        } finally {
            db.User.findOneAndDelete = originalDelete;
        }
    });

    test('blocks deletion with 409 HTML alert when browser attempts to delete user with ActiveBill assigned', async () => {
        mockData.users.push({ _id: userId, name: 'João', email: 'joao@example.com', status: 'ACTIVE' });
        mockData.activeBills.push({
            _id: '507f1f77bcf86cd799439061',
            name: 'Energia',
            users: [{ _id: userId, name: 'João' }],
            referencePeriod: '11/2026',
        });

        const res = await fetch(`${baseUrl}/users/remove/${userId}`, {
            method: 'POST',
            headers: { Accept: 'text/html,application/xhtml+xml' },
        });
        expect(res.status).toBe(409);
        const html = await res.text();
        expect(html).toContain('alert-danger');
        expect(html).toContain('João');
        expect(html).toContain('1 lançamento(s) no demonstrativo mensal');
        expect(html).toContain('/bills/list');
    });
});
