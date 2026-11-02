import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../app.js';

const dashboardViewsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../views/dashboard');

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

describe('GET /dashboard/', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/dashboard/`);
        expect(res.status).toBe(200);
    });

    test('shows the additional period filter options', async () => {
        const res = await fetch(`${baseUrl}/dashboard/`);
        const html = await res.text();

        expect(html).toContain('Últimos 3 meses');
        expect(html).toContain('Últimos 6 meses');
        expect(html).toContain('Este ano');
    });
});

describe('Dashboard bill values', () => {
    test('renders zero-valued bills as 0.00', async () => {
        const html = await ejs.renderFile(path.join(dashboardViewsPath, 'user-bill-list.ejs'), {
            isAdmin: false,
            userBillsData: {
                billListPerMonth: [{
                    month: '11/2026',
                    totalValue: 0,
                    paymentTypeSummaries: [],
                    billList: [{ name: 'Conta zerada', value: 0 }],
                }],
            },
            currentMonth: 11,
            currentYear: 2026,
            csrfToken: '',
        });

        expect(html).toContain('Conta zerada');
        expect(html).toContain('<span class="money">0.00</span>');
    });

    test('renders zero-valued bills in the alternate dashboard and leaves missing values blank', async () => {
        const html = await ejs.renderFile(path.join(dashboardViewsPath, 'dashboard-new.ejs'), {
            title: 'Demonstrativo mensal',
            template: { head: '', navbar: '', scripts: '' },
            currentUserEmail: '',
            csrfToken: '',
            lastUpdate: null,
            activeBillData: [{
                month: 'Novembro/2026',
                totalValue: 0,
                paymentTypeSummaries: [],
                billList: [
                    { name: 'Conta zerada', icon: '', value: 0 },
                    { name: 'Conta sem valor nulo', icon: '', value: null },
                    { name: 'Conta sem valor ausente', icon: '' },
                ],
            }],
        });

        expect(html).toContain('<p class="money">0.00</p>');
        expect(html.match(/<p class="money"><\/p>/g)).toHaveLength(2);
    });
});

describe('GET /dashboard/dashboard-new', () => {
    test('returns 200', async () => {
        const res = await fetch(`${baseUrl}/dashboard/dashboard-new`);
        expect(res.status).toBe(200);
    });
});

describe('GET /dashboard/user-bill-list', () => {
    test('returns 200 when no userId is provided', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with userId parameter', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=507f1f77bcf86cd799439011`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with periodFilter=ALL', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=507f1f77bcf86cd799439011&periodFilter=ALL`);
        expect(res.status).toBe(200);
    });

    test('returns 200 with null userId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=null`);
        expect(res.status).toBe(200);
    });
});

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

describe('POST /dashboard/deleteProcessed', () => {
    test('redirects to /dashboard after deleting', async () => {
        const res = await fetch(`${baseUrl}/dashboard/deleteProcessed`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });
});

describe('POST /dashboard/paybill/:id', () => {
    test('redirects to /dashboard for valid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/paybill/507f1f77bcf86cd799439011`, {
            method: 'POST',
            redirect: 'manual',
        });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/dashboard');
    });

    test('returns 400 for invalid ObjectId', async () => {
        const res = await fetch(`${baseUrl}/dashboard/paybill/invalid-id`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});
