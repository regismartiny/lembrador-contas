import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import http from 'http';
import app from '../app.js';
import { mockData } from './setup.js';

let server;
let baseUrl;

afterEach(() => {
    mockData.bills.length = 0;
});

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

describe('GET /bills/list', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/bills/list`);
        expect(res.status).toBe(200);
    });
});

describe('GET /bills/new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/bills/new`);
        expect(res.status).toBe(200);
    });
});

describe('POST /bills/add', () => {
    test('redirects to /bills/list on valid input', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
            table: 'some-table-id',
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

    test('redirects to /bills/list on valid API bill with type', async () => {
        const body = new URLSearchParams({
            name: 'API Bill',
            company: 'API Corp',
            dueDay: '15',
            type: 'PURCHASE',
            valueSourceType: 'API',
            api: 'some-api-id',
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
        const saved = mockData.bills.find(b => b.name === 'API Bill');
        expect(saved).toBeDefined();
        expect(saved.valueSourceType).toBe('API');
        expect(saved.valueSourceId).toBe('some-api-id');
        expect(saved.type).toBe('PURCHASE');
    });

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when company is missing', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            dueDay: '10',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when dueDay is out of range', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '0',
            valueSourceType: 'TABLE',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /bills/edit/:id', () => {
    test('returns 404 for valid ObjectId when bill not found', async () => {
        const res = await fetch(`${baseUrl}/bills/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(404);
    });

    test('renders API options in editBill for an existing API bill', async () => {
        mockData.bills.push({
            _id: '507f1f77bcf86cd799439011',
            name: 'API Bill',
            company: 'API Corp',
            dueDay: 15,
            type: 'PURCHASE',
            valueSourceType: 'API',
            valueSourceId: 'api-123',
            paymentType: 'PIX',
            status: 'ACTIVE',
            users: [],
        });
        const res = await fetch(`${baseUrl}/bills/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('id="apiGroup"');
        expect(html).toContain('id="apiOptions"');
        expect(html).toContain('/apis/listJSON');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/edit/invalid-id`);
        expect(res.status).toBe(400);
    });
});

describe('POST /bills/update', () => {
    test('redirects to /bills/list on valid input and updates API valueSourceId', async () => {
        mockData.bills.push({
            _id: '507f1f77bcf86cd799439011',
            name: 'Old Bill',
            company: 'Old Corp',
            dueDay: 10,
            valueSourceType: 'TABLE',
            valueSourceId: 'old-table',
        });
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Internet Updated',
            company: 'ISP Corp',
            dueDay: '15',
            valueSourceType: 'API',
            api: 'new-api-id',
        });
        const res = await fetch(`${baseUrl}/bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
        expect(mockData.bills[0].valueSourceType).toBe('API');
        expect(mockData.bills[0].valueSourceId).toBe('new-api-id');
    });

    test('returns 400 when id is missing', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
        });
        const res = await fetch(`${baseUrl}/bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /bills/remove/:id', () => {
    test('redirects to /bills/list for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/bills/list');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/bills/remove/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
