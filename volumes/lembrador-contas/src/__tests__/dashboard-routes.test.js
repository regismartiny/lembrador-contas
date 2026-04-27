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

describe('GET /dashboard/', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/dashboard/`);
        expect(res.status).toBe(200);
    });
});

describe('GET /dashboard/dashboard-new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/dashboard/dashboard-new`);
        expect(res.status).toBe(200);
    });
});

describe('GET /dashboard/user-bill-list', () => {
    test('returns 200 when no userId is provided', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with userId parameter', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with periodFilter=ALL', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=507f1f77bcf86cd799439011&periodFilter=ALL`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with null userId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=null`);
        expect(res.status).toBe(200);
    });
});

describe('POST /dashboard/processBills', () => {
    test('redirects to /dashboard after processing', async () => {
        const res = await fetch(`${baseUrl}/dashboard/processBills`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

describe('POST /dashboard/deleteProcessed', () => {
    test('redirects to /dashboard after deleting', async () => {
        const res = await fetch(`${baseUrl}/dashboard/deleteProcessed`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

describe('POST /dashboard/paybill/:id', () => {
    test('redirects to /dashboard for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/paybill/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/paybill/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
