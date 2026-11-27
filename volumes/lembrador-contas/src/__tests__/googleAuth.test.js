import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import http from 'http';
import app from '../app.js';
import { getRedirectUrl, handleOAuthCallback } from '../util/googleAuth.js';

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
    delete process.env.GOOGLE_OAUTH_REDIRECT_URL;
});

describe('googleAuth', () => {
    test('defaults redirect URL to http://localhost:9090/oauth2/callback', () => {
        expect(getRedirectUrl()).toBe('http://localhost:9090/oauth2/callback');
    });

    test('uses GOOGLE_OAUTH_REDIRECT_URL when configured', () => {
        process.env.GOOGLE_OAUTH_REDIRECT_URL = 'https://app.example.com/oauth2/callback';
        expect(getRedirectUrl()).toBe('https://app.example.com/oauth2/callback');
    });

    test('handleOAuthCallback rejects when code is missing', async () => {
        await expect(handleOAuthCallback('')).rejects.toThrow('Código de autorização OAuth ausente.');
    });
});

describe('GET /oauth2/callback', () => {
    test('returns 400 when code query parameter is missing', async () => {
        const res = await fetch(`${baseUrl}/oauth2/callback`);
        expect(res.status).toBe(400);
    });
});
