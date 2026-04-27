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

describe('GET /bills/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/bills/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /bills/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/bills/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /bills/add', () => {
    test('redirects to /bills/list on valid input', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
            table: 'some-table-id',
            paymentType: 'PIX',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
    });

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when company is missing', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            dueDay: '10',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when dueDay is out of range', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '0',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /bills/edit/:id', () => {
    test('returns 500 for valid ObjectId when bill not found (mock returns null)', async () => {
        const res = await fetch(`${baseUrl}/bills/edit/507f1f77bcf86cd799439011`);
        // Mock findById returns null, template fails rendering without bill data
        expect(res.status).toBe(500);
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /bills/update', () => {
    test('redirects to /bills/list on valid input', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Internet Updated',
            company: 'ISP Corp',
            dueDay: '15',
        });
        const res = await fetch(`${baseUrl}/bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
    });

    test('returns 400 when id is missing', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
        });
        const res = await fetch(`${baseUrl}/bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /bills/remove/:id', () => {
    test('redirects to /bills/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
