import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import app from '../app.js';
import { mockData, resetMockData } from './setup.js';

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

describe('E2E: Full bill management flow', () => {
    test('1. Dashboard loads with 200', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/dashboard`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('dashboard');
    });

    test('2. User list loads', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/users/list`);
        expect(res.status).toBe(200);
    });

    test('3. Bill list loads', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/bills/list`);
        expect(res.status).toBe(200);
    });

    test('4. Table list loads', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/tables/list`);
        expect(res.status).toBe(200);
    });

    test('5. Email source list loads', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/emails/list`);
        expect(res.status).toBe(200);
    });

    test('6. API source list loads', async () => {
        resetMockData();
        const res = await fetch(`${baseUrl}/apis/list`);
        expect(res.status).toBe(200);
    });

    test('7. Create user via POST', async () => {
        resetMockData();
        const body = new URLSearchParams({
            name: 'Test User',
            email: 'test@example.com',
        });
        const res = await fetch(`${baseUrl}/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/users/list');
    });

    test('8. Create bill via POST', async () => {
        resetMockData();
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
            table: 'table-1',
            paymentType: 'PIX',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
    });

    test('9. Process bills endpoint responds', async () => {
        resetMockData();
        // Add a table bill to the mock data
        mockData.bills.push({
            _id: 'bill-1',
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: 10,
            valueSourceType: 'TABLE',
            valueSourceId: 'table-1',
            paymentType: 'PIX',
            status: 'ACTIVE',
            users: ['user-1'],
        });
        mockData.tables.push({
            _id: 'table-1',
            name: 'ISP Table',
            data: [{ period: { month: 12, year: 2026 }, value: 100 }],
        });

        const res = await fetch(`${baseUrl}/dashboard/processBills`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
    });

    test('10. Dashboard loads with active bills in mock data', async () => {
        resetMockData();
        mockData.activeBills.push({
            _id: 'active-1',
            name: 'Internet',
            dueDate: new Date('2026-11-10'),
            value: 100,
            icon: 'wifi',
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '11/2026',
            users: [{ _id: 'user-1' }],
            updated_at: new Date(),
        });
        mockData.users.push({
            _id: 'user-1',
            name: 'Test User',
            email: 'test@example.com',
        });

        const res = await fetch(`${baseUrl}/dashboard`);
        expect(res.status).toBe(200);
        const html = await res.text();
        // Dashboard renders with title and filters
        expect(html).toContain('Demonstrativo mensal');
    });

    test('11. Pay bill endpoint works', async () => {
        resetMockData();
        const validId = '507f1f77bcf86cd799439011';
        mockData.activeBills.push({
            _id: validId,
            name: 'Internet',
            dueDate: new Date('2026-11-10'),
            value: 100,
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '11/2026',
            users: [{ _id: 'user-1' }],
        });

        const res = await fetch(`${baseUrl}/dashboard/paybill/${validId}`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });

    test('12. Health check works', async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('ok');
    });

    test('13. 404 for unknown routes', async () => {
        const res = await fetch(`${baseUrl}/nonexistent`);
        expect(res.status).toBe(404);
    });
});
