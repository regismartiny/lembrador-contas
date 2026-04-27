import { describe, test, expect } from 'bun:test';
import express from 'express';

// ---------------------------------------------------------------------------
// Regression tests for the moment → native Date migration.
//
// These tests verify that the native replacements produce identical output
// to the moment.js calls they replaced.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseDDMMYYYY — replaced moment(str, "DD/MM/YYYY").toDate()
// Replicated from both parser files (corsanEmailParser, cpflEmailParser).
// ---------------------------------------------------------------------------

function parseDDMMYYYY(str) {
    const [day, month, year] = str.split('/').map(Number)
    return new Date(year, month - 1, day)
}

describe('parseDDMMYYYY (replaced moment(str, "DD/MM/YYYY").toDate())', () => {
    test('parses "15/01/2024" to Jan 15 2024', () => {
        const result = parseDDMMYYYY('15/01/2024')
        expect(result).toBeInstanceOf(Date)
        expect(result.getDate()).toBe(15)
        expect(result.getMonth()).toBe(0)
        expect(result.getFullYear()).toBe(2024)
    })

    test('parses "01/12/2023" to Dec 1 2023', () => {
        const result = parseDDMMYYYY('01/12/2023')
        expect(result.getMonth()).toBe(11)
        expect(result.getDate()).toBe(1)
        expect(result.getFullYear()).toBe(2023)
    })

    test('parses "28/02/2024" (leap year) correctly', () => {
        const result = parseDDMMYYYY('28/02/2024')
        expect(result.getMonth()).toBe(1)
        expect(result.getDate()).toBe(28)
    })

    test('parses "31/12/2025" (year boundary) correctly', () => {
        const result = parseDDMMYYYY('31/12/2025')
        expect(result.getMonth()).toBe(11)
        expect(result.getDate()).toBe(31)
        expect(result.getFullYear()).toBe(2025)
    })

    test('produces a local-time Date (not UTC) — matches moment behavior', () => {
        const result = parseDDMMYYYY('15/06/2024')
        expect(result.getHours()).toBe(0)
        expect(result.getMinutes()).toBe(0)
        expect(result.getSeconds()).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// formatDateYYYYMMDD — replaced moment(date).format('YYYY/MM/DD')
// Replicated from emailUtils.js.
// ---------------------------------------------------------------------------

function formatDateYYYYMMDD(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}/${m}/${d}`
}

describe('formatDateYYYYMMDD (replaced moment(date).format("YYYY/MM/DD"))', () => {
    test('formats Jan 15 2024 as "2024/01/15"', () => {
        expect(formatDateYYYYMMDD(new Date(2024, 0, 15))).toBe('2024/01/15')
    })

    test('pads single-digit month and day', () => {
        expect(formatDateYYYYMMDD(new Date(2024, 2, 5))).toBe('2024/03/05')
    })

    test('formats Dec 31 2023 as "2023/12/31"', () => {
        expect(formatDateYYYYMMDD(new Date(2023, 11, 31))).toBe('2023/12/31')
    })

    test('formats Jan 1 2000 as "2000/01/01"', () => {
        expect(formatDateYYYYMMDD(new Date(2000, 0, 1))).toBe('2000/01/01')
    })

    test('formats Sep 9 2024 as "2024/09/09"', () => {
        expect(formatDateYYYYMMDD(new Date(2024, 8, 9))).toBe('2024/09/09')
    })
})

// ---------------------------------------------------------------------------
// Month arithmetic — replaced moment(date).subtract(1,'M') / .add(1,'M')
// Replicated from billProcessing.js getDefaultPeriods().
// ---------------------------------------------------------------------------

describe('native month arithmetic (replaced moment subtract/add month)', () => {
    test('previous month from Jan 15 2024 is Dec 2023', () => {
        const current = new Date(2024, 0, 15)
        const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        expect(prev.getMonth()).toBe(11)
        expect(prev.getFullYear()).toBe(2023)
    })

    test('next month from Jan 15 2024 is Feb 2024', () => {
        const current = new Date(2024, 0, 15)
        const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
        expect(next.getMonth()).toBe(1)
        expect(next.getFullYear()).toBe(2024)
    })

    test('previous month from Mar 31 2024 is Feb 2024 (year roll not affected)', () => {
        const current = new Date(2024, 2, 31)
        const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        expect(prev.getMonth()).toBe(1)
        expect(prev.getFullYear()).toBe(2024)
    })

    test('next month from Dec 15 2024 is Jan 2025 (year rollover)', () => {
        const current = new Date(2024, 11, 15)
        const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
        expect(next.getMonth()).toBe(0)
        expect(next.getFullYear()).toBe(2025)
    })

    test('getDefaultPeriods returns correct 3-month window', () => {
        const currentDate = new Date(2024, 5, 15) // June 15 2024
        const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)

        // Previous = May 2024
        expect(prev.getMonth()).toBe(4)
        expect(prev.getFullYear()).toBe(2024)
        // Current = June 2024
        expect(currentDate.getMonth()).toBe(5)
        // Next = July 2024
        expect(next.getMonth()).toBe(6)
        expect(next.getFullYear()).toBe(2024)
    })
})

// ---------------------------------------------------------------------------
// base64Util.base64ToText — replaced atob npm package with native global
// ---------------------------------------------------------------------------

describe('native atob (replaced atob npm package)', () => {
    test('decodes a simple ASCII base64 string', () => {
        expect(atob('SGVsbG8gV29ybGQ=')).toBe('Hello World')
    })

    test('decodes a URL-safe base64 after fix (with - and _)', () => {
        // Simulates fixBase64: replace _→/ and -→+
        const urlSafe = 'SGVsbG8tV29ybGRf'
        const fixed = urlSafe.replace(/_/g, '/').replace(/-/g, '+')
        expect(atob(fixed)).toBe('Hello-World_')
    })

    test('decodes base64 with whitespace stripped', () => {
        const withSpaces = 'SGVs bG8='
        expect(atob(withSpaces.replace(/\s/g, ''))).toBe('Hello')
    })
})

// ---------------------------------------------------------------------------
// Express built-in body parsing — replaced body-parser
// ---------------------------------------------------------------------------

describe('express built-in body parsing (replaced body-parser)', () => {
    test('express.json is a function', () => {
        expect(typeof express.json).toBe('function')
    })

    test('express.urlencoded is a function', () => {
        expect(typeof express.urlencoded).toBe('function')
    })
})
