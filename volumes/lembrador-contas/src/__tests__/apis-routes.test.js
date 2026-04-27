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

describe('GET /apis/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/apis/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /apis/listJSON', () => {
    test('returns JSON array', async () => {
        const res = await fetch(`${baseUrl}/apis/listJSON`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});

describe('GET /apis/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/apis/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /apis/add', () => {
    test('redirects to /apis/list on valid input', async () => {
        const body = new URLSearchParams({
            name: 'Crypto Price API',
            url: 'https://api.example.com/price',
            method: 'GET',
            value: 'data.price',
        });
        const res = await fetch(`${baseUrl}/apis/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/apis/list');
    });

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({
            url: 'https://api.example.com/price',
        });
        const res = await fetch(`${baseUrl}/apis/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when url is missing', async () => {
        const body = new URLSearchParams({
            name: 'Crypto Price API',
        });
        const res = await fetch(`${baseUrl}/apis/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /apis/edit/:id', () => {
    test('returns 200 for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/apis/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/apis/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /apis/update', () => {
    test('redirects to /apis/list on valid input', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Updated API',
            url: 'https://api.example.com/v2/price',
        });
        const res = await fetch(`${baseUrl}/apis/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/apis/list');
    });

    test('returns 400 when id is missing', async () => {
        const body = new URLSearchParams({
            name: 'API',
            url: 'https://api.example.com',
        });
        const res = await fetch(`${baseUrl}/apis/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /apis/remove/:id', () => {
    test('redirects to /apis/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/apis/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/apis/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/apis/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
