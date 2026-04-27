import { describe, test, expect } from 'bun:test';
import { validateBody } from '../middleware/validate.js';

function createMockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { res.statusCode = code; return res; },
        json(data) { res.body = data; return res; },
    };
    return res;
}

describe('validateBody', () => {
    test('calls next when all required fields are present', () => {
        const middleware = validateBody({
            name: { required: true, message: 'Name is required.' },
        });
        const req = { body: { name: 'Internet' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBe(200);
    });

    test('returns 400 when required field is missing', () => {
        const middleware = validateBody({
            name: { required: true, message: 'Name is required.' },
        });
        const req = { body: {} };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Name is required.');
    });

    test('returns 400 when required field is whitespace-only', () => {
        const middleware = validateBody({
            name: { required: true, message: 'Name is required.' },
        });
        const req = { body: { name: '   ' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
    });

    test('trims whitespace from string values', () => {
        const middleware = validateBody({
            name: { required: true, trim: true },
        });
        const req = { body: { name: '  Internet  ' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(req.body.name).toBe('Internet');
    });

    test('returns 400 when value is not in enum list', () => {
        const middleware = validateBody({
            type: { enum: ['TABLE', 'EMAIL'], enumMessage: 'Invalid type.' },
        });
        const req = { body: { type: 'INVALID' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Invalid type.');
    });

    test('passes when value is in enum list', () => {
        const middleware = validateBody({
            type: { enum: ['TABLE', 'EMAIL'] },
        });
        const req = { body: { type: 'TABLE' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('returns 400 when value does not match pattern', () => {
        const middleware = validateBody({
            email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Email invalid.' },
        });
        const req = { body: { email: 'not-an-email' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Email invalid.');
    });

    test('passes when value matches pattern', () => {
        const middleware = validateBody({
            email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        });
        const req = { body: { email: 'user@example.com' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('returns 400 when value is below min', () => {
        const middleware = validateBody({
            dueDay: { min: 1, max: 31, rangeMessage: 'Day out of range.' },
        });
        const req = { body: { dueDay: '0' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Day out of range.');
    });

    test('returns 400 when value is above max', () => {
        const middleware = validateBody({
            dueDay: { min: 1, max: 31, rangeMessage: 'Day out of range.' },
        });
        const req = { body: { dueDay: '32' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Day out of range.');
    });

    test('passes when value is within range', () => {
        const middleware = validateBody({
            dueDay: { min: 1, max: 31 },
        });
        const req = { body: { dueDay: '15' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('returns 400 when isInt is true and value is not an integer', () => {
        const middleware = validateBody({
            count: { isInt: true, message: 'Must be integer.' },
        });
        const req = { body: { count: 'abc' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Must be integer.');
    });

    test('passes when isInt is true and value is a valid integer string', () => {
        const middleware = validateBody({
            count: { isInt: true },
        });
        const req = { body: { count: '10' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('collects multiple errors and joins with spaces', () => {
        const middleware = validateBody({
            name: { required: true, message: 'Name required.' },
            email: { required: true, message: 'Email required.' },
        });
        const req = { body: {} };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Name required.');
        expect(res.body.error).toContain('Email required.');
    });
});
