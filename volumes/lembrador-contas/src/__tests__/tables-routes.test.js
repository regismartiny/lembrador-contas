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

describe('GET /tables/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/tables/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /tables/listJSON', () => {
    test('returns JSON array', async () => {
        const res = await fetch(`${baseUrl}/tables/listJSON`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});

describe('GET /tables/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/tables/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /tables/add', () => {
    test('redirects to /tables/list on valid input', async () => {
        const body = new URLSearchParams({
            name: 'Energy Table',
            value: '150.00',
            period: '2024-01',
        });
        const res = await fetch(`${baseUrl}/tables/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/tables/list');
    });

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({
            value: '150.00',
            period: '2024-01',
        });
        const res = await fetch(`${baseUrl}/tables/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /tables/edit/:id', () => {
    test('returns 200 for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/tables/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/tables/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /tables/update', () => {
    test('redirects to /tables/list on valid input', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Updated Table',
        });
        const res = await fetch(`${baseUrl}/tables/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/tables/list');
    });

    test('returns 400 when id is missing', async () => {
        const body = new URLSearchParams({ name: 'Table' });
        const res = await fetch(`${baseUrl}/tables/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /tables/remove/:id', () => {
    test('redirects to /tables/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/tables/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/tables/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/tables/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
