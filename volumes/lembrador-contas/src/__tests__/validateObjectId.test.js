import { describe, test, expect } from 'bun:test';
import { validateObjectId } from '../middleware/validateObjectId.js';

function createMockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { res.statusCode = code; return res; },
        json(data) { res.body = data; return res; },
    };
    return res;
}

describe('validateObjectId', () => {
    test('calls next for a valid ObjectId', () => {
        const middleware = validateObjectId('id');
        const req = { params: { id: '507f1f77bcf86cd799439011' }, body: {} };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('returns 400 for an invalid ObjectId', () => {
        const middleware = validateObjectId('id');
        const req = { params: { id: 'not-a-valid-id' }, body: {} };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('ID invalido.');
    });

    test('calls next when id is not present in params or body', () => {
        const middleware = validateObjectId('id');
        const req = { params: {}, body: {} };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('reads from custom param name', () => {
        const middleware = validateObjectId('billId');
        const req = { params: { billId: '507f1f77bcf86cd799439011' }, body: {} };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('falls back to req.body when param is missing', () => {
        const middleware = validateObjectId('id');
        const req = { params: {}, body: { id: '507f1f77bcf86cd799439011' } };
        const res = createMockRes();
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('returns 400 for invalid ObjectId in body fallback', () => {
        const middleware = validateObjectId('id');
        const req = { params: {}, body: { id: 'invalid' } };
        const res = createMockRes();
        middleware(req, res, () => {});
        expect(res.statusCode).toBe(400);
    });
});
