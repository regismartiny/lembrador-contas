import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../app.js';
import { mockData, resetMockData } from './setup.js';
import { extractPaymentCodesFromPDF } from '../parser/corsanEmailParser.js';
import { extractPaymentCodesFromHTML } from '../parser/cpflEmailParser.js';

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

describe('Household Wallet API v1 & SPA', () => {
    beforeEach(() => {
        resetMockData();
    });

    test('GET /carteira serves the built React 19 Household Wallet SPA shell', async () => {
        const res = await fetch(`${baseUrl}/carteira`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('Lembrador de Contas');
    });

    test('GET /api/session returns session status and CSRF token', async () => {
        const res = await fetch(`${baseUrl}/api/session`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.authenticated).toBe(true);
        expect(json.isAdmin).toBe(true);
        expect(typeof json.csrfToken).toBe('string');
    });

    test('GET /api/bootstrap hydrates active bills, prevValue delta, and residents', async () => {
        const userId = '507f1f77bcf86cd799439001';
        mockData.users.push({
            _id: userId,
            name: 'Regis',
            email: 'regis@example.com',
            admin: true,
            status: 'ACTIVE',
        });
        mockData.activeBills.push(
            {
                _id: '507f1f77bcf86cd799439010',
                name: 'Energia Elétrica',
                value: 200,
                status: 'PAID',
                paymentType: 'PIX',
                referencePeriod: '10/2026',
                users: [userId],
            },
            {
                _id: '507f1f77bcf86cd799439011',
                name: 'Energia Elétrica',
                value: 240,
                status: 'UNPAID',
                paymentType: 'PIX',
                referencePeriod: '11/2026',
                pixCode: '00020126580014BR.GOV.BCB.PIX0136chave-teste',
                users: [userId],
            }
        );

        const res = await fetch(`${baseUrl}/api/bootstrap`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.users).toHaveLength(1);
        expect(body.activeBills).toHaveLength(2);
        const novBill = body.activeBills.find(b => b.referencePeriod === '11/2026');
        expect(novBill.prevValue).toBe(200);
        expect(novBill.pixCode).toContain('000201');
    });

    test('POST /api/active-bills/:id/toggle-paid records paidAt and paidBy, and clears on unpay', async () => {
        const billId = '507f1f77bcf86cd799439021';
        mockData.activeBills.push({
            _id: billId,
            name: 'Água CORSAN',
            value: 115.5,
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '11/2026',
            users: [],
        });

        const payRes = await fetch(`${baseUrl}/api/active-bills/${billId}/toggle-paid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paid: true }),
        });
        expect(payRes.status).toBe(200);
        const paidJson = await payRes.json();
        expect(paidJson.activeBill.status).toBe('PAID');
        expect(paidJson.activeBill.paidAt).toBeTruthy();
        expect(paidJson.activeBill.paidBy).toBeTruthy();

        const unpayRes = await fetch(`${baseUrl}/api/active-bills/${billId}/toggle-paid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paid: false }),
        });
        expect(unpayRes.status).toBe(200);
        const unpaidJson = await unpayRes.json();
        expect(unpaidJson.activeBill.status).toBe('UNPAID');
        expect(unpaidJson.activeBill.paidAt).toBeNull();
        expect(unpaidJson.activeBill.paidBy).toBe('');
    });

    test('POST /api/active-bills/pay-batch marks multiple bills as PAID with history', async () => {
        const id1 = '507f1f77bcf86cd799439031';
        const id2 = '507f1f77bcf86cd799439032';
        mockData.activeBills.push(
            { _id: id1, name: 'Conta 1', value: 50, status: 'UNPAID', referencePeriod: '11/2026' },
            { _id: id2, name: 'Conta 2', value: 80, status: 'UNPAID', referencePeriod: '11/2026' }
        );

        const res = await fetch(`${baseUrl}/api/active-bills/pay-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id1, id2] }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.updatedCount).toBe(2);
        expect(mockData.activeBills.find(b => b._id === id1).status).toBe('PAID');
        expect(mockData.activeBills.find(b => b._id === id2).paidAt).toBeInstanceOf(Date);
    });

    test('GET /api/active-bills/:id/pdf streams valid attached PDF inline and blocks path traversal', async () => {
        const downloadsDir = path.resolve(process.cwd(), 'downloads');
        fs.mkdirSync(downloadsDir, { recursive: true });
        const tempPdfName = `test_invoice_${Date.now()}.pdf`;
        const tempPdfPath = path.join(downloadsDir, tempPdfName);
        fs.writeFileSync(tempPdfPath, Buffer.from('%PDF-1.4\n%Test Invoice PDF\n%%EOF'));

        try {
            const validBillId = '507f1f77bcf86cd799439041';
            const traversalBillId = '507f1f77bcf86cd799439042';
            mockData.activeBills.push(
                {
                    _id: validBillId,
                    name: 'Fatura Água',
                    referencePeriod: '11/2026',
                    attachmentFilename: tempPdfName,
                },
                {
                    _id: traversalBillId,
                    name: 'Fatura Maliciosa',
                    referencePeriod: '11/2026',
                    attachmentFilename: '../package.json',
                }
            );

            const okRes = await fetch(`${baseUrl}/api/active-bills/${validBillId}/pdf`);
            expect(okRes.status).toBe(200);
            expect(okRes.headers.get('content-type')).toContain('application/pdf');
            const pdfBytes = Buffer.from(await okRes.arrayBuffer());
            expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

            const blockedRes = await fetch(`${baseUrl}/api/active-bills/${traversalBillId}/pdf`);
            expect(blockedRes.status).toBe(404);
        } finally {
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        }
    });

    test('GET /api/sync/stream streams SSE progress events', async () => {
        mockData.tables.push({
            _id: 'table-sse',
            name: 'Internet',
            data: [{ period: { month: 11, year: 2026 }, value: 149.9 }],
        });
        mockData.bills.push({
            _id: '507f1f77bcf86cd799439051',
            name: 'Vivo Fibra',
            company: 'Vivo',
            dueDay: 10,
            type: 'RECURRENT_SERVICE',
            valueSourceType: 'TABLE',
            valueSourceId: 'table-sse',
            paymentType: 'PIX',
            status: 'ACTIVE',
            users: [],
        });

        const res = await fetch(`${baseUrl}/api/sync/stream?periods=${encodeURIComponent(JSON.stringify([{ month: 10, year: 2026 }]))}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        const text = await res.text();
        expect(text).toContain('"stage":"started"');
        expect(text).toContain('"stage":"completed"');
    });

    test('PIX & barcode extractors detect EMVCo PIX payloads in PDF and HTML', () => {
        const samplePix = '00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR';
        const pdfData = {
            Pages: [{
                Texts: [{ x: 1, y: 1, R: [{ T: encodeURIComponent(`Pague via PIX: ${samplePix}`) }] }],
            }],
        };
        expect(extractPaymentCodesFromPDF(pdfData).pixCode).toBe(samplePix);
        expect(extractPaymentCodesFromHTML(`<div>${samplePix}</div>`).pixCode).toBe(samplePix);
    });
});
