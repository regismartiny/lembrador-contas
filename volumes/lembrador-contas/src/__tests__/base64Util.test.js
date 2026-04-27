import { describe, test, expect } from 'bun:test';
import base64Util from '../util/base64Util.js';

describe('fixBase64', () => {
    test('replaces _ with /', () => {
        expect(base64Util.fixBase64('abc_def')).toBe('abc/def');
    });

    test('replaces - with +', () => {
        expect(base64Util.fixBase64('abc-def')).toBe('abc+def');
    });

    test('replaces both _ and - in the same string', () => {
        expect(base64Util.fixBase64('abc-def_ghi')).toBe('abc+def/ghi');
    });

    test('passes through clean base64 unchanged', () => {
        const clean = 'SGVsbG8=';
        expect(base64Util.fixBase64(clean)).toBe(clean);
    });
});

describe('base64ToText', () => {
    test('decodes a valid base64 string', () => {
        expect(base64Util.base64ToText('SGVsbG8gV29ybGQ=')).toBe('Hello World');
    });

    test('strips whitespace before decoding', () => {
        expect(base64Util.base64ToText('SGVs bG8=')).toBe('Hello');
    });

    test('decodes empty string', () => {
        expect(base64Util.base64ToText('')).toBe('');
    });
});

describe('base64ToBin', () => {
    test('returns Uint8Array with correct byte values', () => {
        // 'AQID' decodes to bytes [1, 2, 3]
        const result = base64Util.base64ToBin('AQID');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    test('handles multi-byte content', () => {
        // 'SGVsbG8=' decodes to 'Hello'
        const result = base64Util.base64ToBin('SGVsbG8=');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBe(5);
        // H=72, e=101, l=108, l=108, o=111
        expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    test('returns empty Uint8Array for empty input', () => {
        const result = base64Util.base64ToBin('');
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBe(0);
    });
});
