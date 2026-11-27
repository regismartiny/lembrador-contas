import { describe, test, expect, afterEach } from 'bun:test';
import { validateExternalApiUrl } from '../util/urlValidator.js';

afterEach(() => {
    delete process.env.ALLOW_PRIVATE_API_URLS;
});

describe('validateExternalApiUrl', () => {
    test('accepts public https and http URLs', () => {
        expect(validateExternalApiUrl('https://api.example.com/price').valid).toBe(true);
        expect(validateExternalApiUrl('http://api.example.com/price').valid).toBe(true);
    });

    test('rejects non-http protocols', () => {
        expect(validateExternalApiUrl('file:///etc/passwd').valid).toBe(false);
        expect(validateExternalApiUrl('ftp://example.com/file').valid).toBe(false);
        expect(validateExternalApiUrl('javascript:alert(1)').valid).toBe(false);
    });

    test('rejects private, loopback and metadata IP addresses', () => {
        const blocked = [
            'http://localhost:8080/test',
            'http://127.0.0.1/secret',
            'http://169.254.169.254/latest/meta-data/',
            'http://10.0.0.1/internal',
            'http://172.16.0.5/internal',
            'http://192.168.1.1/router',
            'http://[::1]:3000/',
            'http://[::ffff:127.0.0.1]/',
        ];
        for (const url of blocked) {
            expect(validateExternalApiUrl(url).valid).toBe(false);
        }
    });

    test('allows private URLs when ALLOW_PRIVATE_API_URLS=true', () => {
        process.env.ALLOW_PRIVATE_API_URLS = 'true';
        expect(validateExternalApiUrl('http://127.0.0.1:8080/api').valid).toBe(true);
        expect(validateExternalApiUrl('http://192.168.1.10/api').valid).toBe(true);
    });
});
