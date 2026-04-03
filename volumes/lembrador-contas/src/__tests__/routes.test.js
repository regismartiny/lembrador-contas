import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';

// db.js and logger.js are mocked globally via src/__tests__/setup.js (bunfig.toml preload).
// APP_PASSWORD is unset so requireAuth calls next() immediately.

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

// ---------------------------------------------------------------------------
// POST /bills/add — validation
// ---------------------------------------------------------------------------

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
            table: 'some-table-id',
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
            table: 'some-table-id',
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
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when dueDay is 32', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '32',
            valueSourceType: 'TABLE',
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 for an invalid valueSourceType', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'INVALID',
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// GET /dashboard/processBills
// ---------------------------------------------------------------------------

describe('GET /dashboard/processBills', () => {
    test('redirects to /dashboard after processing', async () => {
        const res = await fetch(`${baseUrl}/dashboard/processBills`, {
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// GET /dashboard/paybill/:id
// ---------------------------------------------------------------------------

describe('GET /dashboard/paybill/:id', () => {
    test('redirects to /dashboard after marking bill as paid', async () => {
        // Any ObjectId-shaped string; ActiveBill.findOneAndUpdate is mocked
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await fetch(`${baseUrl}/dashboard/paybill/${fakeId}`, {
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// GET /health — sanity check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
    test('returns { status: "ok" }', async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ status: 'ok' });
    });
});
