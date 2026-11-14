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
    test('redirects to /dashboard', async () => {
        const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

describe('GET /login', () => {
    test('is handled by auth router (returns 200 or redirect)', async () => {
        const res = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
        // /login is handled by the auth router which renders a login form
        // or redirects depending on auth state
        expect([200, 302]).toContain(res.status);
    });
});
