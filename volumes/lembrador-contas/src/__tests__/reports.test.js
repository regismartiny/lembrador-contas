import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import http from 'http';
import { mockData, resetMockData } from './setup.js';
import app from '../app.js';
import {
    parsePeriodInput,
    formatReferencePeriod,
    formatCurrencyBR,
    formatDateBR,
    buildBillReport,
    generateReportCsv,
} from '../util/reportService.js';

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

const USER_ANA = { _id: '507f1f77bcf86cd799439021', name: 'Ana', email: 'ana@example.com', status: 'ACTIVE' };
const USER_CARLOS = { _id: '507f1f77bcf86cd799439022', name: 'Carlos', email: 'carlos@example.com', status: 'ACTIVE' };

describe('reportService unit tests', () => {
    test('parsePeriodInput handles YYYY-MM, MM/YYYY, and invalid inputs', () => {
        expect(parsePeriodInput('2026-11')).toEqual({
            month: 11,
            year: 2026,
            key: 2026 * 12 + 10,
            inputValue: '2026-11',
            referencePeriod: '11/2026',
            formatted: 'Nov/2026',
        });

        expect(parsePeriodInput('3/2026')).toEqual({
            month: 3,
            year: 2026,
            key: 2026 * 12 + 2,
            inputValue: '2026-03',
            referencePeriod: '03/2026',
            formatted: 'Mar/2026',
        });

        expect(parsePeriodInput('')).toBeNull();
        expect(parsePeriodInput('13/2026')).toBeNull();
        expect(parsePeriodInput('invalid')).toBeNull();
    });

    test('formatters format dates, periods, and currency safely', () => {
        expect(formatReferencePeriod('01/2026')).toBe('Jan/2026');
        expect(formatReferencePeriod('custom')).toBe('custom');
        expect(formatCurrencyBR(1234.5)).toBe('1.234,50');
        expect(formatCurrencyBR(0)).toBe('0,00');
        expect(formatCurrencyBR(null)).toBe('—');
        expect(formatDateBR(new Date('2026-11-15T00:00:00.000Z'))).toBe('15/11/2026');
        expect(formatDateBR(null)).toBe('—');
    });

    test('buildBillReport computes consolidated totals and per-user split accurately', () => {
        const users = [USER_ANA, USER_CARLOS];
        const activeBills = [
            {
                _id: 'b1',
                name: 'Energia',
                dueDate: new Date('2026-10-10T00:00:00.000Z'),
                value: 200,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '10/2026',
                users: [USER_ANA._id, USER_CARLOS._id],
            },
            {
                _id: 'b2',
                name: 'Internet',
                dueDate: new Date('2026-11-15T00:00:00.000Z'),
                value: 120,
                status: 'UNPAID',
                paymentType: 'DINHEIRO',
                referencePeriod: '11/2026',
                users: [USER_ANA._id],
            },
            {
                _id: 'b3',
                name: 'Taxa Extra',
                dueDate: new Date('2026-11-20T00:00:00.000Z'),
                value: 50,
                status: 'ERROR',
                paymentType: 'PIX',
                referencePeriod: '11/2026',
                users: [],
            },
        ];

        const report = buildBillReport({ activeBills, users, filters: { userId: 'ALL' } });

        expect(report.summary.totalBills).toBe(3);
        expect(report.summary.monthsCount).toBe(2);
        expect(report.summary.totalValue).toBe(370);
        expect(report.summary.paidValue).toBe(200);
        expect(report.summary.paidCount).toBe(1);
        expect(report.summary.unpaidValue).toBe(170);
        expect(report.summary.unpaidCount).toBe(1);
        expect(report.summary.errorCount).toBe(1);

        const anaShare = report.userBreakdown.find(u => u.userName === 'Ana');
        const carlosShare = report.userBreakdown.find(u => u.userName === 'Carlos');
        const unassignedShare = report.userBreakdown.find(u => u.userName === 'Sem usuário vinculado');

        expect(anaShare).toMatchObject({
            billCount: 2,
            sharedBillCount: 1,
            totalShare: 220,
            paidShare: 100,
            unpaidShare: 120,
        });
        expect(carlosShare).toMatchObject({
            billCount: 1,
            sharedBillCount: 1,
            totalShare: 100,
            paidShare: 100,
            unpaidShare: 0,
        });
        expect(unassignedShare).toMatchObject({
            billCount: 1,
            totalShare: 50,
        });
    });

    test('buildBillReport filters by specific user and period range (including swapped bounds)', () => {
        const users = [USER_ANA, USER_CARLOS];
        const activeBills = [
            {
                _id: 'b1',
                name: 'Setembro Energia',
                value: 180,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '09/2026',
                users: [USER_ANA._id, USER_CARLOS._id],
            },
            {
                _id: 'b2',
                name: 'Outubro Energia',
                value: 200,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '10/2026',
                users: [USER_ANA._id, USER_CARLOS._id],
            },
            {
                _id: 'b3',
                name: 'Novembro Carlos Exclusiva',
                value: 90,
                status: 'UNPAID',
                paymentType: 'PIX',
                referencePeriod: '11/2026',
                users: [USER_CARLOS._id],
            },
        ];

        // Intentionally pass startPeriod > endPeriod to verify automatic normalization
        const report = buildBillReport({
            activeBills,
            users,
            filters: {
                userId: USER_ANA._id,
                startPeriod: '2026-11',
                endPeriod: '2026-10',
            },
        });

        expect(report.filters.startPeriod).toBe('2026-10');
        expect(report.filters.endPeriod).toBe('2026-11');
        expect(report.summary.totalBills).toBe(1);
        expect(report.summary.totalValue).toBe(100); // 200 / 2 share
        expect(report.months[0].bills[0].fullValue).toBe(200);
        expect(report.months[0].bills[0].effectiveValue).toBe(100);
    });

    test('generateReportCsv produces UTF-8 BOM semicolon CSV with escaped cells', () => {
        const report = buildBillReport({
            activeBills: [
                {
                    _id: 'b1',
                    name: 'Conta "Especial"; Teste',
                    dueDate: new Date('2026-11-10T00:00:00.000Z'),
                    value: 150.75,
                    status: 'PAID',
                    paymentType: 'PIX',
                    referencePeriod: '11/2026',
                    users: [USER_ANA._id, USER_CARLOS._id],
                },
            ],
            users: [USER_ANA, USER_CARLOS],
            filters: { userId: 'ALL' },
        });

        const csv = generateReportCsv(report);
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv).toContain('Período;Conta;Vencimento;Forma de Pagamento;Situação;Usuários;Qtd. Usuários;Valor Integral (R$);Valor Considerado / Rateio (R$)');
        expect(csv).toContain('11/2026;"Conta ""Especial""; Teste";10/11/2026;PIX;Pago;Ana, Carlos;2;150,75;150,75');
        expect(csv).toContain('Resumo de Rateio por Usuário');
        expect(csv).toContain('Ana;1;1;75,38;0,00;75,38');
        expect(csv).toContain('Total Geral;1 conta(s);1 mês(es);150,75;0,00;150,75');
    });
});

describe('Reports HTTP routes', () => {
    beforeEach(() => {
        resetMockData();
        mockData.users.push(USER_ANA, USER_CARLOS);
        mockData.activeBills.push(
            {
                _id: '507f1f77bcf86cd799439031',
                name: 'CPFL Energia',
                dueDate: new Date('2026-10-12T00:00:00.000Z'),
                value: 240,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '10/2026',
                users: [USER_ANA._id, USER_CARLOS._id],
                updated_at: new Date('2026-10-12T00:00:00.000Z'),
            },
            {
                _id: '507f1f77bcf86cd799439032',
                name: 'Corsan Água',
                dueDate: new Date('2026-11-15T00:00:00.000Z'),
                value: 85.5,
                status: 'UNPAID',
                paymentType: 'DINHEIRO',
                referencePeriod: '11/2026',
                users: [USER_ANA._id],
                updated_at: new Date('2026-11-15T00:00:00.000Z'),
            }
        );
    });

    afterEach(() => {
        resetMockData();
    });

    test('GET /reports renders consolidated report with KPIs, user split, and monthly tables', async () => {
        const res = await fetch(`${baseUrl}/reports`);
        expect(res.status).toBe(200);
        const html = await res.text();

        expect(html).toContain('Relatório de Contas');
        expect(html).toContain('Imprimir / Salvar PDF');
        expect(html).toContain('Exportar CSV');
        expect(html).toContain('Resumo de Rateio por Usuário');
        expect(html).toContain('CPFL Energia');
        expect(html).toContain('Corsan Água');
        expect(html).toContain('325,50');
        expect(html).toContain('205,50'); // Ana's share: 120 + 85.50
        expect(html).toContain('120,00'); // Carlos's share: 120
    });

    test('GET /reports filters by userId and period', async () => {
        const res = await fetch(`${baseUrl}/reports?userId=${USER_CARLOS._id}&startPeriod=2026-10&endPeriod=2026-10`);
        expect(res.status).toBe(200);
        const html = await res.text();

        expect(html).toContain('CPFL Energia');
        expect(html).not.toContain('Corsan Água');
        expect(html).toContain('Sua Cota');
        expect(html).toContain('120,00');
    });

    test('GET /reports renders empty state when no bills match or userId is invalid', async () => {
        const res = await fetch(`${baseUrl}/reports?userId=invalid-id`);
        expect(res.status).toBe(200);
        const html = await res.text();

        expect(html).toContain('Nenhuma fatura encontrada para este relatório');
    });

    test('GET /reports/export.csv downloads CSV with proper headers and filtered data', async () => {
        const res = await fetch(`${baseUrl}/reports/export.csv?userId=${USER_ANA._id}&startPeriod=2026-10&endPeriod=2026-11`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/csv');
        expect(res.headers.get('content-disposition')).toContain('attachment; filename="relatorio-contas-ana-2026-10-a-2026-11.csv"');

        const csv = await res.text();
        expect(csv).toContain('CPFL Energia');
        expect(csv).toContain('Corsan Água');
        expect(csv).toContain('240,00;120,00');
        expect(csv).toContain('85,50;85,50');
    });

    test('Navbar places Relatórios to the right of Fontes de Dados and before Opções', async () => {
        const res = await fetch(`${baseUrl}/dashboard/`);
        expect(res.status).toBe(200);
        const html = await res.text();

        const fontesIdx = html.indexOf('Fontes de Dados');
        const relatoriosIdx = html.indexOf('href="/reports"');
        const opcoesIdx = html.indexOf('id="dropdown-options"');

        expect(fontesIdx).toBeGreaterThan(-1);
        expect(relatoriosIdx).toBeGreaterThan(fontesIdx);
        expect(opcoesIdx).toBeGreaterThan(relatoriosIdx);
    });
});
