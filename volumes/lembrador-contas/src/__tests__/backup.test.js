import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import http from 'node:http';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { mockData, resetMockData } from './setup.js';
import app from '../app.js';
import db from '../db.js';
import { createZip, extractZip } from '../util/zipArchive.js';
import { parseMultipartBuffer, parseMultipartRequest, MultipartUploadError } from '../util/multipartParser.js';
import {
    BACKUP_APP_ID,
    BACKUP_FORMAT_VERSION,
    createBackupZip,
    getDatabaseStats,
    importBackupZip,
    BackupValidationError,
} from '../util/backupService.js';

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

beforeEach(() => {
    resetMockData();
});

afterEach(() => {
    resetMockData();
});

function buildMultipartPayload(boundary, fields, fileField) {
    const parts = [];
    for (const [key, value] of Object.entries(fields || {})) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
            'utf8'
        ));
    }
    if (fileField) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType || 'application/zip'}\r\n\r\n`,
            'utf8'
        ));
        parts.push(fileField.data);
        parts.push(Buffer.from('\r\n', 'utf8'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    return Buffer.concat(parts);
}

describe('zipArchive utility', () => {
    test('creates and extracts multiple files preserving exact UTF-8 and binary data', () => {
        const binarySample = Buffer.from([0x00, 0xff, 0x50, 0x4b, 0x03, 0x04, 0x10, 0x20, 0x7f, 0x80]);
        const jsonSample = JSON.stringify({ nome: 'Água & Luz — São Paulo', valor: 159.9 }, null, 2);

        const archive = createZip([
            { name: 'manifest.json', data: jsonSample },
            { name: 'collections/empty.json', data: '' },
            { name: 'collections/binary.bin', data: binarySample },
        ]);

        const extracted = extractZip(archive);
        expect(extracted.size).toBe(3);
        expect(extracted.get('manifest.json').toString('utf8')).toBe(jsonSample);
        expect(extracted.get('collections/empty.json').length).toBe(0);
        expect(Buffer.compare(extracted.get('collections/binary.bin'), binarySample)).toBe(0);
    });

    test('rejects invalid or non-ZIP buffers', () => {
        expect(() => extractZip(Buffer.from('not a zip file'))).toThrow(/ZIP inválido/i);
        expect(() => extractZip(Buffer.alloc(0))).toThrow(/ZIP inválido/i);
    });

    test('detects CRC32 corruption inside ZIP payload', () => {
        const archive = createZip([
            { name: 'manifest.json', data: '{"hello":"world-with-enough-bytes-to-test-crc"}' },
        ]);
        const corrupted = Buffer.from(archive);
        // Flip bits in the central directory expected CRC32 (located near end before EOCD)
        const eocdPos = corrupted.length - 22;
        const cdPos = corrupted.readUInt32LE(eocdPos + 16);
        corrupted.writeUInt32LE((corrupted.readUInt32LE(cdPos + 16) ^ 0xffffffff) >>> 0, cdPos + 16);

        expect(() => extractZip(corrupted)).toThrow(/CRC32/i);
    });

    test('rejects unsafe entry names with path traversal', () => {
        expect(() => createZip([{ name: '../etc/passwd', data: 'x' }])).toThrow(/relativo inválido/i);
        expect(() => createZip([{ name: '/absolute/path.json', data: 'x' }])).toThrow(/inseguro/i);
        expect(() => createZip([{ name: 'win\\backslash.json', data: 'x' }])).toThrow(/inseguro/i);
    });

    test('enforces maxEntries and maxTotalUncompressedBytes limits', () => {
        const archive = createZip([
            { name: 'a.json', data: 'x'.repeat(2048) },
            { name: 'b.json', data: 'y'.repeat(2048) },
        ]);

        expect(() => extractZip(archive, { maxEntries: 1 })).toThrow(/excede o limite/i);
        expect(() => extractZip(archive, { maxTotalUncompressedBytes: 1024 })).toThrow(/tamanho máximo/i);
    });
});

describe('multipartParser utility', () => {
    test('parses binary file and text fields without altering binary bytes', () => {
        const boundary = '----BoundaryTest987654';
        const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x0d, 0x0a]);
        const raw = buildMultipartPayload(boundary, { mode: 'merge' }, {
            name: 'backupFile',
            filename: 'backup.zip',
            contentType: 'application/zip',
            data: zipBytes,
        });

        const parsed = parseMultipartBuffer(raw, boundary);
        expect(parsed.fields.mode).toBe('merge');
        expect(parsed.files.backupFile.filename).toBe('backup.zip');
        expect(Buffer.compare(parsed.files.backupFile.data, zipBytes)).toBe(0);
    });

    test('rejects oversized uploads with status 413', async () => {
        const boundary = '----OversizeBoundary';
        const largeBody = buildMultipartPayload(boundary, {}, {
            name: 'backupFile',
            filename: 'huge.zip',
            data: Buffer.alloc(2048, 0x41),
        });

        const fakeReq = Readable.from([largeBody]);
        fakeReq.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };

        let caught = null;
        try {
            await parseMultipartRequest(fakeReq, { maxBytes: 512 });
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(MultipartUploadError);
        expect(caught.status).toBe(413);
    });
});

describe('backupService export & import', () => {
    test('exports all collections and restores exact ObjectIds, Dates, and references in replace mode', async () => {
        const userId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
        const tableId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');
        const billId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439033');
        const activeBillId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439044');
        const dueDate = new Date('2026-11-15T00:00:00.000Z');
        const createdAt = new Date('2026-01-10T08:30:00.000Z');

        mockData.users.push({
            _id: userId,
            name: 'Maria Administradora',
            email: 'maria@example.com',
            status: 'ACTIVE',
            admin: true,
            created_at: createdAt,
            updated_at: createdAt,
        });
        mockData.tables.push({
            _id: tableId,
            name: 'Tabela Internet 2026',
            status: 'ACTIVE',
            data: [{ period: { month: 10, year: 2026 }, value: 129.9 }],
        });
        mockData.bills.push({
            _id: billId,
            users: [userId],
            name: 'Internet Fibra',
            company: 'Provedor X',
            type: 'RECURRENT_SERVICE',
            valueSourceType: 'TABLE',
            valueSourceId: tableId.toString(),
            dueDay: 15,
            paymentType: 'PIX',
            status: 'ACTIVE',
        });
        mockData.activeBills.push({
            _id: activeBillId,
            users: [userId],
            name: 'Internet Fibra',
            dueDate,
            value: 129.9,
            status: 'PAID',
            paymentType: 'PIX',
            referencePeriod: '11/2026',
        });
        mockData.reminders.push({
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439055'),
            title: 'Conta a vencer',
            status: 'CREATED',
            activeBill: activeBillId,
            dueDate,
        });

        const { buffer, filename, manifest } = await createBackupZip();
        expect(filename).toMatch(/^lembrador-contas-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
        expect(manifest.app).toBe(BACKUP_APP_ID);
        expect(manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION);
        expect(manifest.collections.users.count).toBe(1);
        expect(manifest.collections.bills.count).toBe(1);
        expect(manifest.collections.activeBills.count).toBe(1);

        // Mutate and reassign mockData arrays (mirrors routes.test.js behavior across test files)
        resetMockData();
        mockData.users = [{
            _id: new mongoose.Types.ObjectId('607f1f77bcf86cd799439099'),
            name: 'Usuário Temporário',
            email: 'temp@example.com',
            status: 'ACTIVE',
        }];
        mockData.activeBills = [];

        const result = await importBackupZip(buffer, { mode: 'replace' });
        expect(result.mode).toBe('replace');
        expect(result.totalImported).toBe(5);

        expect(mockData.users).toHaveLength(1);
        expect(mockData.users[0].email).toBe('maria@example.com');
        expect(mockData.users[0]._id).toBeInstanceOf(mongoose.Types.ObjectId);
        expect(mockData.users[0]._id.toString()).toBe(userId.toString());
        expect(mockData.users[0].created_at).toBeInstanceOf(Date);
        expect(mockData.users[0].created_at.toISOString()).toBe(createdAt.toISOString());

        expect(mockData.bills).toHaveLength(1);
        expect(mockData.bills[0].users[0]).toBeInstanceOf(mongoose.Types.ObjectId);
        expect(mockData.bills[0].users[0].toString()).toBe(userId.toString());

        expect(mockData.activeBills).toHaveLength(1);
        expect(mockData.activeBills[0].status).toBe('PAID');
        expect(mockData.activeBills[0].dueDate).toBeInstanceOf(Date);
        expect(mockData.activeBills[0].dueDate.toISOString()).toBe(dueDate.toISOString());

        expect(mockData.reminders).toHaveLength(1);
        expect(mockData.reminders[0].activeBill).toBeInstanceOf(mongoose.Types.ObjectId);
        expect(mockData.reminders[0].activeBill.toString()).toBe(activeBillId.toString());
    });

    test('merges backup documents by _id while keeping existing unrelated records in merge mode', async () => {
        const sharedId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
        const newBackupId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
        const localOnlyId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439013');

        mockData.users.push(
            { _id: sharedId, name: 'Nome Atualizado no Backup', email: 'shared@example.com', status: 'ACTIVE' },
            { _id: newBackupId, name: 'Novo no Backup', email: 'novo@example.com', status: 'ACTIVE' },
        );
        const { buffer } = await createBackupZip();

        resetMockData();
        mockData.users.push(
            { _id: sharedId, name: 'Nome Antigo Local', email: 'shared@example.com', status: 'ACTIVE' },
            { _id: localOnlyId, name: 'Somente Local', email: 'local@example.com', status: 'ACTIVE' },
        );

        const result = await importBackupZip(buffer, { mode: 'merge' });
        expect(result.mode).toBe('merge');
        expect(mockData.users).toHaveLength(3);

        const updatedShared = mockData.users.find(u => u._id.toString() === sharedId.toString());
        const keptLocal = mockData.users.find(u => u._id.toString() === localOnlyId.toString());
        const insertedBackup = mockData.users.find(u => u._id.toString() === newBackupId.toString());

        expect(updatedShared.name).toBe('Nome Atualizado no Backup');
        expect(keptLocal.name).toBe('Somente Local');
        expect(insertedBackup.name).toBe('Novo no Backup');
    });

    test('rolls back to pre-import snapshot if a collection write fails mid-restore', async () => {
        const originalId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439088');
        mockData.users.push({ _id: originalId, name: 'Novo Backup User', email: 'backup@example.com', status: 'ACTIVE' });
        mockData.bills.push({
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439089'),
            name: 'Energia',
            company: 'CPFL',
            valueSourceType: 'TABLE',
            valueSourceId: 'tbl-1',
            dueDay: 10,
            paymentType: 'PIX',
            status: 'ACTIVE',
        });
        const { buffer } = await createBackupZip();

        resetMockData();
        const existingUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439077');
        mockData.users.push({
            _id: existingUserId,
            name: 'Usuário Original Preservado',
            email: 'preservado@example.com',
            status: 'ACTIVE',
        });

        const originalInsertMany = db.Bill.collection.insertMany;
        let failedOnce = false;
        db.Bill.collection.insertMany = async (docs) => {
            if (!failedOnce) {
                failedOnce = true;
                throw new Error('Simulated MongoDB write failure');
            }
            return originalInsertMany(docs);
        };

        try {
            await expect(importBackupZip(buffer, { mode: 'replace' })).rejects.toThrow('Simulated MongoDB write failure');
            expect(mockData.users).toHaveLength(1);
            expect(mockData.users[0].name).toBe('Usuário Original Preservado');
            expect(mockData.users[0]._id.toString()).toBe(existingUserId.toString());
        } finally {
            db.Bill.collection.insertMany = originalInsertMany;
        }
    });

    test('rejects invalid manifest or missing required document fields before touching DB', async () => {
        mockData.users.push({
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439001'),
            name: 'Intacto',
            email: 'intacto@example.com',
            status: 'ACTIVE',
        });

        const wrongAppZip = createZip([
            { name: 'manifest.json', data: JSON.stringify({ app: 'other-app', formatVersion: 1 }) },
        ]);
        await expect(importBackupZip(wrongAppZip)).rejects.toBeInstanceOf(BackupValidationError);

        const invalidUserZip = createZip([
            {
                name: 'manifest.json',
                data: JSON.stringify({ app: BACKUP_APP_ID, formatVersion: BACKUP_FORMAT_VERSION, collections: {} }),
            },
            {
                name: 'collections/users.json',
                data: JSON.stringify([{ name: 'Sem Email' }]),
            },
        ]);
        await expect(importBackupZip(invalidUserZip)).rejects.toThrow(/email/i);

        // Database remains untouched
        expect(mockData.users).toHaveLength(1);
        expect(mockData.users[0].name).toBe('Intacto');
    });

    test('getDatabaseStats reports accurate document counts', async () => {
        mockData.users.push({ _id: '1', name: 'Ana', email: 'ana@example.com' });
        mockData.apis.push({ _id: '2', name: 'API Cotação', url: 'https://example.com', value: 'data.v' });

        const stats = await getDatabaseStats();
        expect(stats.totalDocuments).toBe(2);
        expect(stats.collections.find(c => c.key === 'users').count).toBe(1);
        expect(stats.collections.find(c => c.key === 'apis').count).toBe(1);
    });

    test('works reliably even after mockData collection arrays are reassigned by other test suites', async () => {
        const uid = new mongoose.Types.ObjectId('507f1f77bcf86cd799439099');
        mockData.users = [{ _id: uid, name: 'Reassigned Array User', email: 'reassigned@example.com', status: 'ACTIVE' }];
        mockData.activeBills = [{
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439098'),
            users: [uid],
            name: 'Água',
            value: 75.4,
            status: 'UNPAID',
            paymentType: 'PIX',
            referencePeriod: '11/2026',
        }];

        const { buffer } = await createBackupZip();

        mockData.users = [{ _id: new mongoose.Types.ObjectId('607f1f77bcf86cd799439000'), name: 'Outro', email: 'outro@example.com', status: 'ACTIVE' }];
        mockData.activeBills = [];

        await importBackupZip(buffer, { mode: 'replace' });
        expect(mockData.users).toHaveLength(1);
        expect(mockData.users[0].email).toBe('reassigned@example.com');
        expect(mockData.activeBills).toHaveLength(1);
        expect(mockData.activeBills[0].name).toBe('Água');
    });
});

describe('Backup HTTP routes (/backup)', () => {
    test('GET /backup renders management page with download and import controls', async () => {
        mockData.users.push({ _id: '507f1f77bcf86cd799439011', name: 'Admin', email: 'admin@example.com' });

        const res = await fetch(`${baseUrl}/backup`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Backup do Banco de Dados');
        expect(html).toContain('/backup/download');
        expect(html).toContain('/backup/import');
    });

    test('GET /backup/download returns valid ZIP that POST /backup/import restores end-to-end', async () => {
        const uid = new mongoose.Types.ObjectId('507f1f77bcf86cd799439091');
        mockData.users.push({
            _id: uid,
            name: 'Carlos',
            email: 'carlos@example.com',
            status: 'ACTIVE',
            admin: true,
        });
        mockData.emails.push({
            _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439092'),
            address: 'fatura@cpfl.com.br',
            subject: 'Sua conta chegou',
            dataParser: 'CPFL_EMAIL',
            status: 'ACTIVE',
        });

        const downloadRes = await fetch(`${baseUrl}/backup/download`);
        expect(downloadRes.status).toBe(200);
        expect(downloadRes.headers.get('content-type')).toContain('application/zip');
        expect(downloadRes.headers.get('content-disposition')).toMatch(/attachment; filename="lembrador-contas-backup-.*\.zip"/);
        expect(downloadRes.headers.get('cache-control')).toContain('no-store');

        const downloadedZipBuffer = Buffer.from(await downloadRes.arrayBuffer());
        expect(downloadedZipBuffer.length).toBeGreaterThan(50);

        // Clear mock DB and re-import through HTTP multipart upload
        resetMockData();
        expect(mockData.users).toHaveLength(0);

        const boundary = '----E2EBackupBoundary12345';
        const multipartBody = buildMultipartPayload(boundary, { mode: 'replace' }, {
            name: 'backupFile',
            filename: 'lembrador-contas-backup.zip',
            contentType: 'application/zip',
            data: downloadedZipBuffer,
        });

        const importRes = await fetch(`${baseUrl}/backup/import`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: multipartBody,
        });

        expect(importRes.status).toBe(200);
        const body = await importRes.json();
        expect(body.success).toBe(true);
        expect(body.summary.totalImported).toBe(2);
        expect(body.stats.totalDocuments).toBe(2);
        expect(mockData.users).toHaveLength(1);
        expect(mockData.users[0].email).toBe('carlos@example.com');
        expect(mockData.emails).toHaveLength(1);
        expect(mockData.emails[0].address).toBe('fatura@cpfl.com.br');
    });

    test('POST /backup/import returns 400 when no file is provided', async () => {
        const boundary = '----EmptyUploadBoundary';
        const multipartBody = buildMultipartPayload(boundary, { mode: 'replace' }, null);

        const res = await fetch(`${baseUrl}/backup/import`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: multipartBody,
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/arquivo \.zip/i);
    });

    test('POST /backup/import returns 400 when uploaded file is not a valid backup ZIP', async () => {
        const boundary = '----CorruptZipBoundary';
        const multipartBody = buildMultipartPayload(boundary, { mode: 'replace' }, {
            name: 'backupFile',
            filename: 'corrupt.zip',
            contentType: 'application/zip',
            data: Buffer.from('not-a-valid-zip-content'),
        });

        const res = await fetch(`${baseUrl}/backup/import`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: multipartBody,
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/ZIP inválido/i);
    });
});
