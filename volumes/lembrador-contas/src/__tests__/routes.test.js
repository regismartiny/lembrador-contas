import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import { mockData } from './setup.js';

// db.js and logger.js are mocked globally via src/__tests__/setup.js (bunfig.toml preload).
// APP_PASSWORD is unset so requireAuth calls next() immediately.

import app from '../app.js';

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

// ---------------------------------------------------------------------------
// POST /bills/add — validation
// ---------------------------------------------------------------------------

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

    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'TABLE',
            table: 'some-table-id',
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
            table: 'some-table-id',
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
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when dueDay is 32', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '32',
            valueSourceType: 'TABLE',
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 for an invalid valueSourceType', async () => {
        const body = new URLSearchParams({
            name: 'Internet',
            company: 'ISP Corp',
            dueDay: '10',
            valueSourceType: 'INVALID',
            table: 'some-table-id',
        });
        const res = await fetch(`${baseUrl}/bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// GET /dashboard/active-bills/edit/:id
// ---------------------------------------------------------------------------

describe('GET /dashboard/active-bills/edit/:id', () => {
    test('renders the active bill editor for an existing record', async () => {
        mockData.activeBills = [{
            _id: '507f1f77bcf86cd799439011',
            users: [{ _id: '1', name: 'Admin User' }],
            name: 'Internet',
            dueDate: new Date('2026-08-10T00:00:00Z'),
            value: 125.5,
            icon: 'fa-wifi',
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '08/2026'
        }];
        mockData.users = [{ _id: '1', name: 'Admin User', email: 'admin@example.com', status: 'ACTIVE' }];

        const res = await fetch(`${baseUrl}/dashboard/active-bills/edit/507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Edição de conta');
        expect(html).toContain('Internet');
    });
});

// ---------------------------------------------------------------------------
// POST /dashboard/active-bills/update
// ---------------------------------------------------------------------------

describe('POST /dashboard/active-bills/update', () => {
    test('redirects back to the dashboard after updating an active bill', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Internet',
            dueDate: '2026-08-10',
            value: '125.50',
            status: 'PAID',
            paymentType: 'PIX',
            referencePeriod: '08/2026',
        });

        const res = await fetch(`${baseUrl}/dashboard/active-bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// GET /dashboard/active-bills/new
// ---------------------------------------------------------------------------

describe('GET /dashboard/active-bills/new', () => {
    test('renders a form to create a new active bill', async () => {
        const res = await fetch(`${baseUrl}/dashboard/active-bills/new`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Nova linha de conta ativa');
    });
});

// ---------------------------------------------------------------------------
// POST /dashboard/active-bills/add
// ---------------------------------------------------------------------------

describe('POST /dashboard/active-bills/add', () => {
    test('creates a new active bill and redirects to the dashboard', async () => {
        const body = new URLSearchParams({
            name: 'Energia',
            dueDate: '2026-08-15',
            value: '89.90',
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '08/2026',
        });

        const res = await fetch(`${baseUrl}/dashboard/active-bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            redirect: 'manual',
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// POST /dashboard/active-bills/remove/:id
// ---------------------------------------------------------------------------

describe('POST /dashboard/active-bills/remove/:id', () => {
    test('deletes an active bill and redirects to the dashboard', async () => {
        const res = await fetch(`${baseUrl}/dashboard/active-bills/remove/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// GET /dashboard/user-bill-list — admin-only actions
// ---------------------------------------------------------------------------

describe('GET /dashboard/user-bill-list', () => {
    test('hides edit controls for non-admin users', async () => {
        const validUserId = '507f1f77bcf86cd799439012';
        mockData.activeBills = [{
            _id: '507f1f77bcf86cd799439011',
            users: [{ _id: validUserId, name: 'Admin User' }],
            name: 'Internet',
            dueDate: new Date('2026-08-10T00:00:00Z'),
            value: 125.5,
            icon: 'fa-wifi',
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '08/2026'
        }];
        mockData.users = [{ _id: validUserId, name: 'Admin User', email: 'user@example.com', status: 'ACTIVE' }];

        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=${validUserId}&periodFilter=CURRENT_AND_FUTURE`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).not.toContain('Adicionar linha');
        expect(html).not.toContain('Editar');
    });

    test('returns an empty list for invalid user ids instead of crashing', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=invalid-value&periodFilter=CURRENT_AND_FUTURE`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Nenhuma conta encontrada');
    });
});

// ---------------------------------------------------------------------------
// POST /dashboard/processBills
// ---------------------------------------------------------------------------

describe('POST /dashboard/processBills', () => {
    test('returns JSON success response', async () => {
        const res = await fetch(`${baseUrl}/dashboard/processBills`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// POST /dashboard/paybill/:id
// ---------------------------------------------------------------------------

describe('POST /dashboard/paybill/:id', () => {
    test('redirects to /dashboard after marking bill as paid', async () => {
        // Any ObjectId-shaped string; ActiveBill.findOneAndUpdate is mocked
        const fakeId = '507f1f77bcf86cd799439011';
        const res = await fetch(`${baseUrl}/dashboard/paybill/${fakeId}`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

// ---------------------------------------------------------------------------
// GET /health — sanity check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
    test('returns { status: "ok" }', async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ status: 'ok' });
    });
});
