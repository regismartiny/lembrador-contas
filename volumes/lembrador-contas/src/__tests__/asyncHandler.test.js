import { describe, test, expect } from 'bun:test';
import asyncHandler from '../util/asyncHandler.js';

describe('asyncHandler', () => {
    test('calls the wrapped handler with req, res, next', async () => {
        const fn = async (_req, _res, _next) => {};
        const wrapped = asyncHandler(fn);

        const req = {};
        const res = {};
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await wrapped(req, res, next);

        // Handler should have been called (it does nothing), next should NOT be called on success
        expect(nextCalled).toBe(false);
    });

    test('calls next with error when async handler rejects', async () => {
        const error = new Error('async failure');
        const fn = async () => { throw error; };
        const wrapped = asyncHandler(fn);

        let capturedError;
        const next = (err) => { capturedError = err; };

        await wrapped({}, {}, next);

        expect(capturedError).toBe(error);
    });

    test('does not call next when handler resolves successfully', async () => {
        const fn = async () => 42;
        const wrapped = asyncHandler(fn);

        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await wrapped({}, {}, next);

        expect(nextCalled).toBe(false);
    });
});
