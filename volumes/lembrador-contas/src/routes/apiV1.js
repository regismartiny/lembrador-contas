import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import db from '../db.js';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import billProcessing from '../util/billProcessing.js';
import emailUtils from '../util/emailUtils.js';
import { validateExternalApiUrl } from '../util/urlValidator.js';
import { buildBillReport } from '../util/reportService.js';
import { getDatabaseStats } from '../util/backupService.js';
import { parseMultipartRequest, MultipartUploadError } from '../util/multipartParser.js';
import { generateToken } from '../middleware/csrf.js';
import {
    PeriodFilterEnum,
    StatusEnum,
    HttpMethodEnum,
    ValueSourceTypeEnum,
    BillTypeEnum,
    PaymentTypeEnum,
    ActiveBillStatusEnum,
    DataParserEnum,
} from '../enums.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const apiLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

function getCandidateDownloadDirs() {
    const cwdDownloads = path.resolve(process.cwd(), 'downloads');
    const appDownloads = path.resolve(__dirname, '../../downloads');
    const repoDownloads = path.resolve(__dirname, '../../../../downloads');
    return Array.from(new Set([cwdDownloads, appDownloads, repoDownloads]));
}

function findPdfFilePath(filename) {
    if (!filename || typeof filename !== 'string') return null;
    const safeName = path.basename(filename.trim());
    if (!safeName || !safeName.toLowerCase().endsWith('.pdf') || safeName !== filename.trim()) {
        return null;
    }
    for (const dir of getCandidateDownloadDirs()) {
        const candidate = path.join(dir, safeName);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch {
            // ignore inaccessible candidate dir
        }
    }
    return null;
}

function getWritableDownloadsDir() {
    const dir = path.resolve(process.cwd(), 'downloads');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function listAvailablePdfFiles() {
    const found = new Map();
    for (const dir of getCandidateDownloadDirs()) {
        try {
            if (!fs.existsSync(dir)) continue;
            for (const file of fs.readdirSync(dir)) {
                if (!file.toLowerCase().endsWith('.pdf')) continue;
                const full = path.join(dir, file);
                const stat = fs.statSync(full);
                if (stat.isFile() && !found.has(file)) {
                    found.set(file, {
                        filename: file,
                        sizeBytes: stat.size,
                        updatedAt: stat.mtime.toISOString(),
                    });
                }
            }
        } catch {
            // ignore
        }
    }
    return Array.from(found.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function parseNumberInput(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { valid: true, value: undefined };
    }
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? { valid: true, value: raw } : { valid: false, value: undefined };
    }
    const str = String(raw).trim().replace(/^R\$\s*/i, '');
    const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
    const num = Number(normalized);
    if (!Number.isFinite(num)) {
        return { valid: false, value: undefined };
    }
    return { valid: true, value: num };
}

function isValidObjectId(id) {
    return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && /^[a-fA-F0-9]{24}$/.test(id);
}

async function resolveSessionContext(req) {
    const rawPass = process.env.APP_PASSWORD;
    const authRequired = Boolean(rawPass && rawPass !== 'undefined' && rawPass.trim() !== '');
    const sessionAuth = Boolean(req.session?.authenticated);
    const authenticated = !authRequired || sessionAuth;
    const sessionEmail = req.session?.email || '';

    let user = null;
    if (sessionEmail) {
        user = await db.User.findOne({ email: sessionEmail }).lean();
    }

    const isAdmin = !authRequired ? true : Boolean(user?.admin);
    const actorName = user?.name || sessionEmail || 'Admin Local';

    return {
        authRequired,
        authDisabled: !authRequired,
        authenticated,
        user: user
            ? {
                _id: String(user._id),
                name: user.name,
                email: user.email,
                admin: Boolean(user.admin),
                status: user.status || 'ACTIVE',
            }
            : null,
        isAdmin,
        actorName,
    };
}

const requireApiAuth = asyncHandler(async function (req, res, next) {
    const ctx = await resolveSessionContext(req);
    if (!ctx.authenticated) {
        return res.status(401).json({
            error: 'Autenticação necessária.',
            authRequired: true,
        });
    }
    req.apiContext = ctx;
    next();
});

const requireApiAdmin = asyncHandler(async function (req, res, next) {
    const ctx = req.apiContext || await resolveSessionContext(req);
    if (!ctx.authenticated) {
        return res.status(401).json({ error: 'Autenticação necessária.', authRequired: true });
    }
    if (!ctx.isAdmin) {
        return res.status(403).json({ error: 'Apenas administradores podem realizar esta ação.' });
    }
    req.apiContext = ctx;
    next();
});

function periodToSortKey(refPeriod) {
    if (!refPeriod || typeof refPeriod !== 'string') return 0;
    const parts = refPeriod.split('/');
    if (parts.length !== 2) return 0;
    const month = Number(parts[0]);
    const year = Number(parts[1]);
    if (!month || !year) return 0;
    return year * 12 + (month - 1);
}

function serializeActiveBill(bill, prevValueMap = new Map(), configuredBillsByName = new Map()) {
    const configured = configuredBillsByName.get((bill.name || '').toLowerCase());
    const attachmentFilename = bill.attachmentFilename || '';
    const hasPdf = Boolean(attachmentFilename && findPdfFilePath(attachmentFilename));
    const currentKey = periodToSortKey(bill.referencePeriod);
    const prevKey = `${(bill.name || '').toLowerCase()}::${currentKey - 1}`;
    const prevValue = prevValueMap.has(prevKey) ? prevValueMap.get(prevKey) : null;

    const userIds = (bill.users || [])
        .map(u => (u && typeof u === 'object' && u._id !== undefined ? String(u._id) : String(u || '')))
        .filter(Boolean);

    return {
        _id: String(bill._id || new mongoose.Types.ObjectId()),
        billId: bill.billId ? String(bill.billId) : (configured?._id ? String(configured._id) : null),
        name: bill.name || '',
        company: bill.company || configured?.company || '',
        users: userIds,
        dueDate: bill.dueDate ? new Date(bill.dueDate).toISOString() : null,
        value: bill.value !== undefined && bill.value !== null ? Number(bill.value) : null,
        prevValue,
        icon: bill.icon || configured?.icon || '',
        status: bill.status || 'UNPAID',
        paymentType: bill.paymentType || 'PIX',
        referencePeriod: bill.referencePeriod || '',
        valueSourceType: bill.valueSourceType || configured?.valueSourceType || 'TABLE',
        attachmentFilename,
        hasPdf,
        pdfUrl: hasPdf ? `/api/active-bills/${String(bill._id)}/pdf` : null,
        pixCode: bill.pixCode || configured?.pixKey || '',
        barcode: bill.barcode || '',
        notes: bill.notes || '',
        paidAt: bill.paidAt ? new Date(bill.paidAt).toISOString() : null,
        paidBy: bill.paidBy || '',
        created_at: bill.created_at || null,
        updated_at: bill.updated_at || null,
    };
}

function buildPreviousValueLookup(activeBills) {
    const map = new Map();
    for (const bill of activeBills) {
        if (bill.value === null || bill.value === undefined || Number.isNaN(Number(bill.value))) continue;
        const key = `${(bill.name || '').toLowerCase()}::${periodToSortKey(bill.referencePeriod)}`;
        map.set(key, Number(bill.value));
    }
    return map;
}

// ---------------------------------------------------------------------------
// Public / Session Endpoints
// ---------------------------------------------------------------------------

router.get('/session', asyncHandler(async function (req, res) {
    const ctx = await resolveSessionContext(req);
    const csrfToken = res.locals.csrfToken || generateToken(req, res);
    res.json({
        ...ctx,
        csrfToken,
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    });
}));

router.post('/auth/login', apiLoginLimiter, asyncHandler(async function (req, res) {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
        const ctx = await resolveSessionContext(req);
        return res.json({ ...ctx, csrfToken: res.locals.csrfToken || generateToken(req, res) });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = email ? await db.User.findOne({ email }).lean() : null;
    const passwordBuf = Buffer.from(password, 'utf8');
    const expectedBuf = Buffer.from(appPassword, 'utf8');
    const passwordValid = passwordBuf.length === expectedBuf.length && crypto.timingSafeEqual(passwordBuf, expectedBuf);

    if (!user || !passwordValid) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.authenticated = true;
    req.session.email = user.email;
    req.session.loginMethod = 'explicit';

    await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const csrfToken = generateToken(req, res);
    const ctx = await resolveSessionContext(req);
    res.json({
        ...ctx,
        csrfToken,
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    });
}));

router.post('/auth/logout', function (req, res) {
    if (!req.session) {
        return res.json({ ok: true });
    }
    req.session.authenticated = false;
    delete req.session.email;
    delete req.session.loginMethod;
    req.session.save(() => {
        res.json({ ok: true });
    });
});

// ---------------------------------------------------------------------------
// Authenticated Routes
// ---------------------------------------------------------------------------
router.use(requireApiAuth);

router.get('/bootstrap', asyncHandler(async function (req, res) {
    const [activeBillsRaw, usersRaw, billsRaw, tablesRaw, emailsRaw, apisRaw] = await Promise.all([
        db.ActiveBill.find({}).lean(),
        db.User.find({}).lean(),
        db.Bill.find({}).lean(),
        db.Table.find({}).lean(),
        db.Email.find({}).lean(),
        db.API.find({}).lean(),
    ]);

    const configuredBillsByName = new Map();
    for (const b of billsRaw) {
        if (b?.name) configuredBillsByName.set(b.name.toLowerCase(), b);
    }

    const prevValueMap = buildPreviousValueLookup(activeBillsRaw);
    const activeBills = activeBillsRaw.map(b => serializeActiveBill(b, prevValueMap, configuredBillsByName));

    const assignedUserIds = new Set([
        ...billsRaw.flatMap(b => b.users || []).filter(Boolean).map(u => String(u._id || u)),
        ...activeBillsRaw.flatMap(b => b.users || []).filter(Boolean).map(u => String(u._id || u)),
    ]);

    const users = usersRaw
        .map(u => ({
            _id: String(u._id),
            name: u.name || '',
            email: u.email || '',
            admin: Boolean(u.admin),
            status: u.status || 'ACTIVE',
            hasAssignedBills: assignedUserIds.has(String(u._id)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const bills = billsRaw
        .map(b => ({
            _id: String(b._id),
            name: b.name || '',
            company: b.company || '',
            type: b.type || 'RECURRENT_SERVICE',
            valueSourceType: b.valueSourceType || 'TABLE',
            valueSourceId: b.valueSourceId || '',
            dueDay: b.dueDay || 1,
            icon: b.icon || '',
            pixKey: b.pixKey || '',
            category: b.category || '',
            paymentType: b.paymentType || 'PIX',
            status: b.status || 'ACTIVE',
            users: (b.users || []).map(u => String(u._id || u)).filter(Boolean),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const sortedByUpdated = [...activeBillsRaw].sort(
        (a, b) => (new Date(b.updated_at || 0).getTime()) - (new Date(a.updated_at || 0).getTime())
    );
    const lastUpdate = sortedByUpdated[0]?.updated_at ? new Date(sortedByUpdated[0].updated_at).toISOString() : null;

    res.json({
        session: req.apiContext,
        activeBills,
        users,
        bills,
        sources: {
            tables: tablesRaw.map(t => ({ ...t, _id: String(t._id) })).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
            emails: emailsRaw.map(e => ({ ...e, _id: String(e._id) })).sort((a, b) => (a.address || '').localeCompare(b.address || '')),
            apis: apisRaw.map(a => ({ ...a, _id: String(a._id) })).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
            availablePdfs: req.apiContext.isAdmin ? listAvailablePdfFiles() : [],
        },
        enums: {
            periodFilter: PeriodFilterEnum,
            status: StatusEnum,
            httpMethod: HttpMethodEnum,
            valueSourceType: ValueSourceTypeEnum,
            billType: BillTypeEnum,
            paymentType: PaymentTypeEnum,
            activeBillStatus: ActiveBillStatusEnum,
            dataParser: DataParserEnum,
        },
        lastUpdate,
    });
}));

// ---------------------------------------------------------------------------
// Active Bills (Wallet Monthly Feed, 1-Click Pay, Guided Batch Pay, PDF & PIX)
// ---------------------------------------------------------------------------

router.post('/active-bills', requireApiAdmin, asyncHandler(async function (req, res) {
    const name = String(req.body?.name || '').trim();
    if (!name) {
        return res.status(400).json({ error: 'O nome da fatura é obrigatório.' });
    }
    const parsedValue = parseNumberInput(req.body?.value);
    if (!parsedValue.valid) {
        return res.status(400).json({ error: 'Valor monetário inválido.' });
    }

    const now = new Date();
    const defaultPeriod = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const status = ['PAID', 'UNPAID', 'ERROR'].includes(req.body?.status) ? req.body.status : 'UNPAID';
    const users = Array.isArray(req.body?.users) ? req.body.users : (req.body?.users ? [req.body.users] : []);

    const doc = new db.ActiveBill({
        users,
        name,
        company: String(req.body?.company || '').trim(),
        dueDate: req.body?.dueDate ? new Date(req.body.dueDate) : now,
        value: parsedValue.value,
        icon: String(req.body?.icon || '').trim(),
        status,
        paymentType: ['PIX', 'DINHEIRO'].includes(req.body?.paymentType) ? req.body.paymentType : 'PIX',
        referencePeriod: String(req.body?.referencePeriod || defaultPeriod).trim(),
        pixCode: String(req.body?.pixCode || '').trim(),
        barcode: String(req.body?.barcode || '').trim(),
        notes: String(req.body?.notes || '').trim(),
        attachmentFilename: req.body?.attachmentFilename ? path.basename(String(req.body.attachmentFilename)) : '',
        paidAt: status === 'PAID' ? now : null,
        paidBy: status === 'PAID' ? req.apiContext.actorName : '',
    });

    const saved = await doc.save();
    res.status(201).json({ activeBill: serializeActiveBill(saved) });
}));

router.patch('/active-bills/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    const existing = await db.ActiveBill.findById(id).lean();
    if (!existing) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    const updates = { updated_at: new Date() };

    if (req.body.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ error: 'Nome não pode ficar vazio.' });
        updates.name = name;
    }
    if (req.body.company !== undefined) updates.company = String(req.body.company).trim();
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body.value !== undefined) {
        const parsed = parseNumberInput(req.body.value);
        if (!parsed.valid) return res.status(400).json({ error: 'Valor inválido.' });
        updates.value = parsed.value;
    }
    if (req.body.users !== undefined) {
        updates.users = Array.isArray(req.body.users) ? req.body.users : [req.body.users].filter(Boolean);
    }
    if (req.body.paymentType !== undefined && ['PIX', 'DINHEIRO'].includes(req.body.paymentType)) {
        updates.paymentType = req.body.paymentType;
    }
    if (req.body.referencePeriod !== undefined) {
        updates.referencePeriod = String(req.body.referencePeriod).trim();
    }
    if (req.body.pixCode !== undefined) updates.pixCode = String(req.body.pixCode).trim();
    if (req.body.barcode !== undefined) updates.barcode = String(req.body.barcode).trim();
    if (req.body.notes !== undefined) updates.notes = String(req.body.notes).trim();
    if (req.body.icon !== undefined) updates.icon = String(req.body.icon).trim();
    if (req.body.attachmentFilename !== undefined) {
        updates.attachmentFilename = req.body.attachmentFilename ? path.basename(String(req.body.attachmentFilename)) : '';
    }

    if (req.body.status !== undefined && ['PAID', 'UNPAID', 'ERROR'].includes(req.body.status)) {
        updates.status = req.body.status;
        if (req.body.status === 'PAID' && existing.status !== 'PAID') {
            updates.paidAt = new Date();
            updates.paidBy = req.apiContext.actorName;
        } else if (req.body.status !== 'PAID') {
            updates.paidAt = null;
            updates.paidBy = '';
        }
    }

    const updated = await db.ActiveBill.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ activeBill: serializeActiveBill(updated || { ...existing, ...updates, _id: id }) });
}));

router.post('/active-bills/:id/toggle-paid', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
    }

    const existing = await db.ActiveBill.findById(id).lean();
    if (!existing) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    const targetPaid = typeof req.body?.paid === 'boolean' ? req.body.paid : existing.status !== 'PAID';
    const now = new Date();
    const updates = targetPaid
        ? {
            status: 'PAID',
            paidAt: now,
            paidBy: req.apiContext.actorName,
            updated_at: now,
        }
        : {
            status: 'UNPAID',
            paidAt: null,
            paidBy: '',
            updated_at: now,
        };

    const updated = await db.ActiveBill.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ activeBill: serializeActiveBill(updated || { ...existing, ...updates, _id: id }) });
}));

router.post('/active-bills/pay-batch', requireApiAdmin, asyncHandler(async function (req, res) {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isValidObjectId) : [];
    if (ids.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma fatura válida.' });
    }

    const now = new Date();
    const updatedBills = [];
    for (const id of ids) {
        const updated = await db.ActiveBill.findOneAndUpdate(
            { _id: id },
            {
                $set: {
                    status: 'PAID',
                    paidAt: now,
                    paidBy: req.apiContext.actorName,
                    updated_at: now,
                },
            },
            { new: true }
        );
        if (updated) updatedBills.push(serializeActiveBill(updated));
    }

    res.json({ updatedCount: updatedBills.length, activeBills: updatedBills });
}));

router.delete('/active-bills/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    await db.ActiveBill.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

router.get('/active-bills/:id/pdf', asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    const bill = await db.ActiveBill.findById(id).lean();
    if (!bill || !bill.attachmentFilename) {
        return res.status(404).json({ error: 'Nenhum PDF anexado a esta fatura.' });
    }

    const filePath = findPdfFilePath(bill.attachmentFilename);
    if (!filePath) {
        return res.status(404).json({ error: 'Arquivo PDF não encontrado no servidor.' });
    }

    const safeName = path.basename(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    fs.createReadStream(filePath).pipe(res);
}));

router.post('/active-bills/:id/pdf', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: 'ID inválido.' });
    }
    const bill = await db.ActiveBill.findById(id).lean();
    if (!bill) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
    }

    let parsedUpload;
    try {
        parsedUpload = await parseMultipartRequest(req);
    } catch (err) {
        if (err instanceof MultipartUploadError) {
            return res.status(err.status).json({ error: err.message });
        }
        throw err;
    }

    const uploaded = parsedUpload.files?.pdfFile || Object.values(parsedUpload.files || {})[0];
    if (!uploaded || !uploaded.data || uploaded.data.length < 5) {
        return res.status(400).json({ error: 'Envie um arquivo PDF válido.' });
    }

    if (!uploaded.data.subarray(0, 5).toString('ascii').startsWith('%PDF')) {
        return res.status(400).json({ error: 'O arquivo enviado não é um PDF válido.' });
    }

    const slug = String(bill.name || 'fatura')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'fatura';
    const filename = `${slug}_${Date.now()}.pdf`;
    const targetDir = getWritableDownloadsDir();
    fs.writeFileSync(path.join(targetDir, filename), uploaded.data);

    const updated = await db.ActiveBill.findOneAndUpdate(
        { _id: id },
        { $set: { attachmentFilename: filename, updated_at: new Date() } },
        { new: true }
    );

    res.status(201).json({
        activeBill: serializeActiveBill(updated || { ...bill, attachmentFilename: filename }),
        filename,
    });
}));

// ---------------------------------------------------------------------------
// Live Sync (POST + SSE Stream)
// ---------------------------------------------------------------------------

router.post('/sync', requireApiAdmin, asyncHandler(async function (req, res) {
    const bills = await db.Bill.find({ status: { $ne: 'INACTIVE' } });
    const activeBillsToRun = Array.isArray(bills) ? bills.filter(b => !b.status || b.status === 'ACTIVE') : [];
    const periodsParam = req.body?.periods ? JSON.stringify(req.body.periods) : req.query.periods;
    const result = await billProcessing.processBills(activeBillsToRun, periodsParam);
    if (result?.skipped) {
        return res.status(409).json({ error: 'Sincronização já está em andamento.' });
    }
    res.json({ success: true, processedCount: result.processedCount || 0 });
}));

router.get('/sync/stream', requireApiAdmin, asyncHandler(async function (req, res) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
    };

    try {
        const allBills = await db.Bill.find({});
        const activeBillsToRun = (Array.isArray(allBills) ? allBills : []).filter(b => !b.status || b.status === 'ACTIVE');
        const result = await billProcessing.processBills(activeBillsToRun, req.query.periods, (event) => {
            sendEvent(event);
        });
        if (result?.skipped) {
            sendEvent({ stage: 'error', message: 'Sincronização já está em andamento.' });
        }
    } catch (err) {
        logger.error({ err }, 'SSE bill sync failed');
        sendEvent({ stage: 'error', message: err.message || 'Falha durante a sincronização.' });
    } finally {
        if (!res.writableEnded) {
            res.end();
        }
    }
}));

// ---------------------------------------------------------------------------
// Configured Bills Catalog CRUD
// ---------------------------------------------------------------------------

router.post('/bills', requireApiAdmin, asyncHandler(async function (req, res) {
    const name = String(req.body?.name || '').trim();
    const company = String(req.body?.company || '').trim();
    const dueDay = parseInt(req.body?.dueDay, 10);
    const valueSourceType = req.body?.valueSourceType;
    const valueSourceId = String(req.body?.valueSourceId || '').trim();

    if (!name || !company) {
        return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        return res.status(400).json({ error: 'Dia de vencimento deve estar entre 1 e 31.' });
    }
    if (!['TABLE', 'EMAIL', 'API'].includes(valueSourceType) || !valueSourceId) {
        return res.status(400).json({ error: 'Selecione uma fonte de dados válida.' });
    }

    const users = Array.isArray(req.body?.users) ? req.body.users : (req.body?.users ? [req.body.users] : []);
    const bill = new db.Bill({
        users,
        name,
        company,
        dueDay,
        type: ['RECURRENT_SERVICE', 'PURCHASE'].includes(req.body?.type) ? req.body.type : 'RECURRENT_SERVICE',
        valueSourceType,
        valueSourceId,
        paymentType: ['PIX', 'DINHEIRO'].includes(req.body?.paymentType) ? req.body.paymentType : 'PIX',
        icon: String(req.body?.icon || '').trim(),
        pixKey: String(req.body?.pixKey || '').trim(),
        category: String(req.body?.category || '').trim(),
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
    });

    const saved = await bill.save();
    res.status(201).json({ bill: saved });
}));

router.put('/bills/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });

    const name = String(req.body?.name || '').trim();
    const company = String(req.body?.company || '').trim();
    const dueDay = parseInt(req.body?.dueDay, 10);
    if (!name || !company || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        return res.status(400).json({ error: 'Preencha nome, empresa e dia de vencimento (1–31).' });
    }

    const updates = {
        users: Array.isArray(req.body?.users) ? req.body.users : [],
        name,
        company,
        dueDay,
        type: ['RECURRENT_SERVICE', 'PURCHASE'].includes(req.body?.type) ? req.body.type : 'RECURRENT_SERVICE',
        valueSourceType: ['TABLE', 'EMAIL', 'API'].includes(req.body?.valueSourceType) ? req.body.valueSourceType : 'TABLE',
        valueSourceId: String(req.body?.valueSourceId || '').trim(),
        paymentType: ['PIX', 'DINHEIRO'].includes(req.body?.paymentType) ? req.body.paymentType : 'PIX',
        icon: String(req.body?.icon || '').trim(),
        pixKey: String(req.body?.pixKey || '').trim(),
        category: String(req.body?.category || '').trim(),
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
        updated_at: new Date(),
    };

    const updated = await db.Bill.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ bill: updated || { _id: id, ...updates } });
}));

router.delete('/bills/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.Bill.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

// ---------------------------------------------------------------------------
// Residents / Users CRUD
// ---------------------------------------------------------------------------

router.post('/users', requireApiAdmin, asyncHandler(async function (req, res) {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Informe nome e um e-mail válido.' });
    }
    const admin = Boolean(req.body?.admin === true || req.body?.admin === 'true');
    const user = new db.User({ name, email, admin, status: 'ACTIVE' });
    const saved = await user.save();
    res.status(201).json({ user: saved });
}));

router.put('/users/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Informe nome e um e-mail válido.' });
    }

    const updates = {
        name,
        email,
        admin: Boolean(req.body?.admin === true || req.body?.admin === 'true'),
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
        updated_at: new Date(),
    };
    const updated = await db.User.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true, runValidators: true });
    res.json({ user: updated || { _id: id, ...updates } });
}));

router.delete('/users/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });

    const mongoUserId = new mongoose.Types.ObjectId(id);
    const [bills, activeBills] = await Promise.all([
        db.Bill.find({ users: mongoUserId }).lean(),
        db.ActiveBill.find({ users: mongoUserId }).lean(),
    ]);

    const hasUser = (arr) => (arr || []).some(u => String(u?._id || u) === id);
    const assignedBills = bills.filter(b => hasUser(b.users));
    const assignedActive = activeBills.filter(b => hasUser(b.users));

    if (assignedBills.length > 0 || assignedActive.length > 0) {
        return res.status(409).json({
            error: `Este morador possui ${assignedBills.length} conta(s) no catálogo e ${assignedActive.length} fatura(s) mensais vinculadas. Desative o morador ou remova os vínculos primeiro.`,
        });
    }

    await db.User.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

// ---------------------------------------------------------------------------
// Data Sources CRUD: Tables, Emails, APIs + Connector Testers
// ---------------------------------------------------------------------------

function normalizeTableEntries(rawEntries) {
    if (!Array.isArray(rawEntries)) return [];
    const normalized = [];
    for (const item of rawEntries) {
        const month = Number(item?.period?.month ?? item?.month);
        const year = Number(item?.period?.year ?? item?.year);
        const parsedVal = parseNumberInput(item?.value);
        if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100 && parsedVal.valid && parsedVal.value !== undefined) {
            normalized.push({
                period: { month, year },
                value: parsedVal.value,
            });
        }
    }
    return normalized.sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month);
}

router.post('/tables', requireApiAdmin, asyncHandler(async function (req, res) {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'O nome da tabela é obrigatório.' });
    const data = normalizeTableEntries(req.body?.data);
    const table = new db.Table({ name, data, status: 'ACTIVE' });
    const saved = await table.save();
    res.status(201).json({ table: saved });
}));

router.put('/tables/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'O nome da tabela é obrigatório.' });
    const updates = {
        name,
        data: normalizeTableEntries(req.body?.data),
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
    };
    const updated = await db.Table.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ table: updated || { _id: id, ...updates } });
}));

router.delete('/tables/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.Table.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

router.post('/emails', requireApiAdmin, asyncHandler(async function (req, res) {
    const address = String(req.body?.address || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const dataParser = req.body?.dataParser;
    if (!address || !subject || !Object.keys(DataParserEnum).includes(dataParser)) {
        return res.status(400).json({ error: 'Informe remetente, assunto e um parser válido.' });
    }
    const email = new db.Email({ address, subject, dataParser, status: 'ACTIVE' });
    const saved = await email.save();
    res.status(201).json({ email: saved });
}));

router.put('/emails/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    const address = String(req.body?.address || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const dataParser = req.body?.dataParser;
    if (!address || !subject || !Object.keys(DataParserEnum).includes(dataParser)) {
        return res.status(400).json({ error: 'Informe remetente, assunto e um parser válido.' });
    }
    const updates = {
        address,
        subject,
        dataParser,
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
    };
    const updated = await db.Email.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ email: updated || { _id: id, ...updates } });
}));

router.delete('/emails/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.Email.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

router.post('/emails/:id/test', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    const email = await db.Email.findById(id).lean();
    if (!email) return res.status(404).json({ error: 'Conector de e-mail não encontrado.' });

    try {
        const parserName = DataParserEnum[email.dataParser];
        const message = await emailUtils.getLastMessage(email.address, email.subject);
        if (!message) {
            return res.json({ success: false, message: 'Nenhuma mensagem correspondente encontrada na caixa de entrada.' });
        }
        const parser = await import(`../parser/${parserName}.js`);
        const parsed = await parser.parseEmailData(message);
        res.json({ success: Boolean(parsed), parsed });
    } catch (err) {
        res.status(502).json({ success: false, error: err.message || 'Falha ao testar leitura do Gmail.' });
    }
}));

router.post('/apis', requireApiAdmin, asyncHandler(async function (req, res) {
    const name = String(req.body?.name || '').trim();
    const url = String(req.body?.url || '').trim();
    const method = req.body?.method || 'GET';
    const value = String(req.body?.value || '').trim();
    const body = String(req.body?.body || '');

    if (!name || !url || !value) {
        return res.status(400).json({ error: 'Nome, URL e caminho JSON são obrigatórios.' });
    }
    const urlCheck = validateExternalApiUrl(url);
    if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.error });
    }
    if (!Object.keys(HttpMethodEnum).includes(method)) {
        return res.status(400).json({ error: 'Método HTTP inválido.' });
    }

    const api = new db.API({ name, url, method, body, value, status: 'ACTIVE' });
    const saved = await api.save();
    res.status(201).json({ api: saved });
}));

router.put('/apis/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });

    const name = String(req.body?.name || '').trim();
    const url = String(req.body?.url || '').trim();
    const method = req.body?.method || 'GET';
    const value = String(req.body?.value || '').trim();
    const body = String(req.body?.body || '');

    if (!name || !url || !value) {
        return res.status(400).json({ error: 'Nome, URL e caminho JSON são obrigatórios.' });
    }
    const urlCheck = validateExternalApiUrl(url);
    if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.error });
    }

    const updates = {
        name,
        url,
        method,
        body,
        value,
        status: ['ACTIVE', 'INACTIVE'].includes(req.body?.status) ? req.body.status : 'ACTIVE',
    };
    const updated = await db.API.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true });
    res.json({ api: updated || { _id: id, ...updates } });
}));

router.delete('/apis/:id', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.API.findOneAndDelete({ _id: id });
    res.json({ deleted: true, id });
}));

router.post('/apis/:id/test', requireApiAdmin, asyncHandler(async function (req, res) {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'ID inválido.' });
    const api = await db.API.findById(id).lean();
    if (!api) return res.status(404).json({ error: 'Conector de API não encontrado.' });

    const urlCheck = validateExternalApiUrl(api.url);
    if (!urlCheck.valid) {
        return res.status(400).json({ success: false, error: urlCheck.error });
    }

    try {
        const fetchOptions = {
            method: api.method || 'GET',
            signal: AbortSignal.timeout(10000),
        };
        if (api.body && ['POST', 'PUT'].includes(api.method)) {
            fetchOptions.body = api.body;
            fetchOptions.headers = { 'Content-Type': 'application/json' };
        }
        const response = await fetch(api.url, fetchOptions);
        if (!response.ok) {
            return res.status(502).json({ success: false, error: `HTTP ${response.status} retornado pelo endpoint.` });
        }
        const payload = await response.json();
        const extracted = billProcessing.resolveJsonPath(payload, api.value);
        res.json({
            success: extracted !== undefined,
            extractedValue: extracted,
            numericValue: parseFloat(extracted),
        });
    } catch (err) {
        res.status(502).json({ success: false, error: err.message || 'Falha ao consultar API externa.' });
    }
}));

// ---------------------------------------------------------------------------
// Reports & Database Stats
// ---------------------------------------------------------------------------

router.get('/reports', asyncHandler(async function (req, res) {
    const [activeBills, allUsers] = await Promise.all([
        db.ActiveBill.find({}).lean(),
        db.User.find({}).lean(),
    ]);

    const rawUserId = req.query.userId ? String(req.query.userId).trim() : 'ALL';
    const userId = !rawUserId || rawUserId === 'ALL' ? 'ALL' : rawUserId;

    const report = buildBillReport({
        activeBills,
        users: allUsers,
        filters: {
            userId,
            startPeriod: req.query.startPeriod ? String(req.query.startPeriod) : '',
            endPeriod: req.query.endPeriod ? String(req.query.endPeriod) : '',
        },
        statusEnum: ActiveBillStatusEnum,
        paymentEnum: PaymentTypeEnum,
    });

    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (report.filters.startPeriod) params.set('startPeriod', report.filters.startPeriod);
    if (report.filters.endPeriod) params.set('endPeriod', report.filters.endPeriod);
    const qs = params.toString();

    res.json({
        report,
        generatedAt: new Date().toISOString(),
        exportCsvUrl: `/reports/export.csv${qs ? `?${qs}` : ''}`,
    });
}));

router.get('/backup/stats', requireApiAdmin, asyncHandler(async function (_req, res) {
    const stats = await getDatabaseStats();
    res.json({ stats });
}));

export default router;
