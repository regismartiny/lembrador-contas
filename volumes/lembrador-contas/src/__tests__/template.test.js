import { describe, test, expect } from 'bun:test';
import template from '../routes/template.js';

describe('template module', () => {
    test('exports head, navbar, and scripts strings', () => {
        expect(typeof template.head).toBe('string');
        expect(typeof template.navbar).toBe('string');
        expect(typeof template.scripts).toBe('string');
        expect(template.head.length).toBeGreaterThan(0);
        expect(template.navbar.length).toBeGreaterThan(0);
        expect(template.scripts.length).toBeGreaterThan(0);
    });

    test('head contains script tag', () => {
        expect(template.head).toContain('<script');
    });

    test('navbar contains navigation markup', () => {
        expect(template.navbar).toContain('navbar');
    });

    test('scripts contains script tags', () => {
        expect(template.scripts).toContain('<script');
    });
});
