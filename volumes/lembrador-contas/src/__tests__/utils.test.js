import { describe, test, expect } from 'bun:test';
import utils from '../util/utils.js';

describe('toArray', () => {
    test('returns array unchanged', () => {
        const arr = [1, 2, 3];
        expect(utils.toArray(arr)).toBe(arr);
    });

    test('wraps a string into an array', () => {
        expect(utils.toArray('hello')).toEqual(['hello']);
    });

    test('wraps a number into an array', () => {
        expect(utils.toArray(42)).toEqual([42]);
    });

    test('wraps null into an array', () => {
        const result = utils.toArray(null);
        expect(result).toEqual([null]);
    });
});
