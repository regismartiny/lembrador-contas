import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import http from 'http';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mockData, resetMockData } from './setup.js';
import app from '../app.js';
import db from '../db.js';

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

    describe('user selector and status feedback', () => {
        let prevAppPassword;

        beforeEach(() => {
            resetMockData();
            prevAppPassword = process.env.APP_PASSWORD;
            delete process.env.APP_PASSWORD;
        });

        afterEach(() => {
            resetMockData();
            if (prevAppPassword === undefined) {
                delete process.env.APP_PASSWORD;
            } else {
                process.env.APP_PASSWORD = prevAppPassword;
            }
        });

        test('shows disabled placeholder, local mode badge, and Nunca processado when empty', async () => {
            const res = await fetch(`${baseUrl}/dashboard/`);
            expect(res.status).toBe(200);
            const html = await res.text();

            expect(html).toContain('Nenhum usuário cadastrado');
            expect(html).toContain('Nunca processado');
            expect(html).toContain('Modo local (sem login)');
        });

        test('lists active users even when ActiveBill is empty', async () => {
            mockData.users.push(
                { _id: '507f1f77bcf86cd799439021', name: 'Carlos', email: 'carlos@example.com', status: 'ACTIVE' },
                { _id: '507f1f77bcf86cd799439022', name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' },
                { _id: '507f1f77bcf86cd799439023', name: 'Inativo Sem Conta', email: 'inativo@example.com', status: 'INACTIVE' },
            );

            const res = await fetch(`${baseUrl}/dashboard/`);
            expect(res.status).toBe(200);
            const html = await res.text();

            expect(html).toContain('Ana');
            expect(html).toContain('Carlos');
            expect(html).not.toContain('Inativo Sem Conta');
        });
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
            cspNonce: 'test-nonce',
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

    describe('actionable empty states', () => {
        const userId = '507f1f77bcf86cd799439011';

        beforeEach(() => {
            resetMockData();
        });

        afterEach(() => {
            resetMockData();
        });

        test('prompts to create a user when no active users exist', async () => {
            const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=null`);
            const html = await res.text();

            expect(html).toContain('Nenhum usuário cadastrado');
            expect(html).toContain('/users/new');
        });

        test('prompts to create bills when no bills are configured', async () => {
            mockData.users.push({ _id: userId, name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' });

            const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=${userId}&periodFilter=ALL`);
            const html = await res.text();

            expect(html).toContain('Ainda não há contas cadastradas no sistema');
            expect(html).toContain('/bills/new');
        });

        test('prompts to link user when bills exist without this user', async () => {
            mockData.users.push({ _id: userId, name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' });
            mockData.bills.push({
                _id: '507f1f77bcf86cd799439099',
                name: 'Energia',
                status: 'ACTIVE',
                users: ['507f1f77bcf86cd799439088'],
            });

            const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=${userId}&periodFilter=ALL`);
            const html = await res.text();

            expect(html).toContain('Nenhuma conta encontrada para este usuário');
            expect(html).toContain('Vincular em Contas');
        });

        test('prompts to process bills when user has configured bills awaiting processing', async () => {
            mockData.users.push({ _id: userId, name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' });
            mockData.bills.push({
                _id: '507f1f77bcf86cd799439099',
                name: 'Internet',
                status: 'ACTIVE',
                users: [userId],
            });

            const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=${userId}&periodFilter=ALL`);
            const html = await res.text();

            expect(html).toContain('aguardando processamento');
            expect(html).toContain('data-action="process-bills"');
        });

        test('offers to show all periods when bills exist outside current period filter', async () => {
            mockData.users.push({ _id: userId, name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' });
            mockData.activeBills.push({
                _id: '507f1f77bcf86cd799439077',
                users: [{ _id: userId, name: 'Ana' }],
                name: 'Conta Antiga',
                dueDate: new Date('2020-01-10T00:00:00Z'),
                value: 90,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '01/2020',
            });

            const res = await fetch(`${baseUrl}/dashboard/user-bill-list?userId=${userId}&periodFilter=CURRENT_YEAR`);
            const html = await res.text();

            expect(html).toContain('Exibir todos os períodos');
            expect(html).toContain('data-action="show-all-periods"');
        });
    });
});

describe('GET /dashboard/active-bills/new', () => {
    test('renders default referencePeriod in MM/YYYY format', async () => {
        const res = await fetch(`${baseUrl}/dashboard/active-bills/new`);
        expect(res.status).toBe(200);
        const html = await res.text();
        const now = new Date();
        const expected = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        expect(html).toContain(`value="${expected}"`);
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

    test('returns 409 when a concurrent processing run is already in progress', async () => {
        const { default: billProcessing } = await import('../util/billProcessing.js');
        const originalProcessBills = billProcessing.processBills;
        billProcessing.processBills = async () => ({ skipped: true });
        try {
            const res = await fetch(`${baseUrl}/dashboard/processBills`, {
                method: 'POST',
            });
            expect(res.status).toBe(409);
            const json = await res.json();
            expect(json.error).toContain('andamento');
        } finally {
            billProcessing.processBills = originalProcessBills;
        }
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

    test('returns 400 when periods query param is invalid JSON', async () => {
        const res = await fetch(`${baseUrl}/dashboard/deleteProcessed?periods=not-json`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when periods query param is not an array', async () => {
        const res = await fetch(`${baseUrl}/dashboard/deleteProcessed?periods=%7B%7D`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /dashboard/active-bills/add validation', () => {
    test('returns 400 when name is missing', async () => {
        const body = new URLSearchParams({ value: '100,50' });
        const res = await fetch(`${baseUrl}/dashboard/active-bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when value is NaN', async () => {
        const body = new URLSearchParams({ name: 'Conta', value: 'abc' });
        const res = await fetch(`${baseUrl}/dashboard/active-bills/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('accepts Brazilian decimal comma in value', async () => {
        const body = new URLSearchParams({ name: 'Conta BR', value: '1.234,56' });
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

describe('POST /dashboard/active-bills/update validation', () => {
    test('returns 400 for invalid ObjectId', async () => {
        const body = new URLSearchParams({ id: 'invalid-id', name: 'Conta', value: '10' });
        const res = await fetch(`${baseUrl}/dashboard/active-bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
    });

    test('returns 400 when value is NaN', async () => {
        const body = new URLSearchParams({
            id: '507f1f77bcf86cd799439011',
            name: 'Conta',
            value: 'nao-numero',
        });
        const res = await fetch(`${baseUrl}/dashboard/active-bills/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        expect(res.status).toBe(400);
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

describe('GET /health', () => {
    test('returns 503 when MongoDB connection is disconnected', async () => {
        const originalState = db.Mongoose.connection.readyState;
        db.Mongoose.connection.readyState = 0;
        try {
            const res = await fetch(`${baseUrl}/health`);
            expect(res.status).toBe(503);
            const body = await res.json();
            expect(body.status).toBe('error');
        } finally {
            db.Mongoose.connection.readyState = originalState;
        }
    });
});
