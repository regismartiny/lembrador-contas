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

describe('GET /emails/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/emails/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /emails/listJSON', () => {
    test('returns JSON array', async () => {
        const res = await fetch(`${baseUrl}/emails/listJSON`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});

describe('GET /emails/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/emails/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /emails/add', () => {
    test('redirects to /emails/list on valid input', async () => {
        const body = new URLSearchParams({
            address: 'sender@example.com',
            subject: 'Sua conta',
        });
        const res = await fetch(`${baseUrl}/emails/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/emails/list');
    });

    test('returns 400 when address is missing', async () => {
        const body = new URLSearchParams({ subject: 'Sua conta' });
        const res = await fetch(`${baseUrl}/emails/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when subject is missing', async () => {
        const body = new URLSearchParams({ address: 'sender@example.com' });
        const res = await fetch(`${baseUrl}/emails/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /emails/edit/:id', () => {
    test('returns 200 for valid ObjectId (template handles null email via locals)', async () => {
        const res = await fetch(`${baseUrl}/emails/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/emails/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /emails/update', () => {
    test('redirects to /emails/list on valid input', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            address: 'updated@example.com',
            subject: 'Updated Subject',
        });
        const res = await fetch(`${baseUrl}/emails/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/emails/list');
    });
});

describe('POST /emails/remove/:id', () => {
    test('redirects to /emails/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/emails/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/emails/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/emails/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
