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

describe('GET /notifications/push/public_key', () => {
    test('returns 503 when VAPID_PUBLIC_KEY is not set', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/public_key`);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toContain('VAPID_PUBLIC_KEY');
    });
});

describe('POST /notifications/push/register', () => {
    test('returns 400 when subscription is missing endpoint', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: { keys: { p256dh: 'key', auth: 'auth' } },
            }),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when subscription is missing keys.p256dh', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: { endpoint: 'https://push.example.com/sub', keys: { auth: 'auth' } },
            }),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when subscription is missing keys.auth', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: { endpoint: 'https://push.example.com/sub', keys: { p256dh: 'key' } },
            }),
        });
        expect(res.status).toBe(400);
    });

    test('returns 201 for valid subscription', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: {
                    endpoint: 'https://push.example.com/sub/1',
                    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
                },
            }),
        });
        expect(res.status).toBe(201);
    });
});

describe('POST /notifications/push/send', () => {
    test('returns 201 when sending notifications', async () => {
        const res = await fetch(`${baseUrl}/notifications/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Test Notification',
                body: 'This is a test',
            }),
        });
        expect(res.status).toBe(201);
    });
});
