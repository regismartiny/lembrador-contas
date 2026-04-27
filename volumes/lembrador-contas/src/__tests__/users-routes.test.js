import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import app from '../app.js';

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
    test('returns 500 for valid ObjectId when user not found (mock returns null)', async () => {
        const res = await fetch(`${baseUrl}/users/edit/507f1f77bcf86cd799439011`);
        // Mock findById returns null, template fails rendering without user data
        expect(res.status).toBe(500);
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
    test('redirects to /users/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/users/remove/507f1f77bcf86cd799439011`, {
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
});
