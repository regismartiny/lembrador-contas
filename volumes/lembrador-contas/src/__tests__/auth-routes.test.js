import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

afterEach(() => {
    delete process.env.APP_PASSWORD;
});

describe('POST /login', () => {
    test('redirects to / when APP_PASSWORD is not set', async () => {
        delete process.env.APP_PASSWORD;
        const body = new URLSearchParams({ email: 'admin@example.com', password: 'any' });
        const res = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });

    test('returns unified generic error for both unknown email and wrong password', async () => {
        process.env.APP_PASSWORD = 'super-secret-password';

        const unknownRes = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email: 'missing@example.com', password: 'super-secret-password' }).toString(),
        });
        const unknownHtml = await unknownRes.text();

        const wrongPassRes = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email: 'admin@example.com', password: 'wrong-password' }).toString(),
        });
        const wrongPassHtml = await wrongPassRes.text();

        expect(unknownHtml).toContain('E-mail ou senha inválidos.');
        expect(wrongPassHtml).toContain('E-mail ou senha inválidos.');
    });

    test('authenticates valid user and redirects to /', async () => {
        process.env.APP_PASSWORD = 'super-secret-password';
        const res = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email: 'admin@example.com', password: 'super-secret-password' }).toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });
});

describe('Logout route', () => {
    test('POST /logout redirects to /login', async () => {
        const res = await fetch(`${baseUrl}/logout`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/login');
    });

    test('GET /logout is no longer allowed (returns 404)', async () => {
        const res = await fetch(`${baseUrl}/logout`, { redirect: 'manual' });
        expect(res.status).toBe(404);
    });

    test('navbar uses POST form with CSRF input for logout', () => {
        const navbarPath = path.resolve(__dirname, '../views/templates/navbar.html');
        const navbar = fs.readFileSync(navbarPath, 'utf8');
        expect(navbar).toContain('action="/logout" method="post"');
        expect(navbar).toContain('name="_csrf"');
    });
});
