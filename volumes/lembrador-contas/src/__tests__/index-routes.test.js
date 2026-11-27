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

describe('GET /', () => {
    test('redirects to /carteira (Household Wallet SPA)', async () => {
        const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/carteira');
    });
});

describe('GET /login', () => {
    test('is handled by auth router (returns 200 or redirect)', async () => {
        const res = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
        expect([200, 302]).toContain(res.status);
    });
});
