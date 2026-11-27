import express from 'express';
import asyncHandler from '../util/asyncHandler.js';
import logger from '../util/logger.js';
import template from './template.js';
import { requireAdmin } from '../middleware/auth.js';
import {
    createBackupZip,
    getDatabaseStats,
    importBackupZip,
    BackupValidationError,
} from '../util/backupService.js';
import {
    parseMultipartRequest,
    MultipartUploadError,
} from '../util/multipartParser.js';

const router = express.Router();

function wantsJsonResponse(req) {
    const accept = String(req.headers?.accept || '');
    if (accept.includes('application/json')) return true;
    if (req.xhr) return true;
    if (typeof req.accepts === 'function') {
        return req.accepts(['html', 'json']) === 'json';
    }
    return true;
}

/* GET Backup management page (admin only). */
router.get('/', requireAdmin, asyncHandler(async function (req, res) {
    const stats = await getDatabaseStats();
    res.render('backup/index', {
        template,
        title: 'Backup do Banco de Dados',
        stats,
        successMessage: null,
        errorMessage: null,
        importSummary: null,
    });
}));

/* GET Download database backup as .zip (admin only). */
router.get('/download', requireAdmin, asyncHandler(async function (req, res) {
    const { buffer, filename, manifest } = await createBackupZip();

    logger.info({
        filename,
        sizeBytes: buffer.length,
        adminEmail: req.session?.email || 'dev-mode',
        collections: Object.fromEntries(
            Object.entries(manifest.collections).map(([k, v]) => [k, v.count])
        ),
    }, 'Database backup downloaded');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).send(buffer);
}));

/* POST Import database backup from .zip (admin only). */
router.post('/import', requireAdmin, asyncHandler(async function (req, res) {
    let parsedUpload;
    try {
        parsedUpload = await parseMultipartRequest(req);
    } catch (err) {
        if (err instanceof MultipartUploadError) {
            if (wantsJsonResponse(req)) {
                return res.status(err.status).json({ error: err.message });
            }
            const stats = await getDatabaseStats();
            return res.status(err.status).render('backup/index', {
                template,
                title: 'Backup do Banco de Dados',
                stats,
                successMessage: null,
                errorMessage: err.message,
                importSummary: null,
            });
        }
        throw err;
    }

    const uploadedFile = parsedUpload.files?.backupFile || Object.values(parsedUpload.files || {})[0];
    if (!uploadedFile || !uploadedFile.data || uploadedFile.data.length === 0) {
        const message = 'Selecione um arquivo .zip de backup para importar.';
        if (wantsJsonResponse(req)) {
            return res.status(400).json({ error: message });
        }
        const stats = await getDatabaseStats();
        return res.status(400).render('backup/index', {
            template,
            title: 'Backup do Banco de Dados',
            stats,
            successMessage: null,
            errorMessage: message,
            importSummary: null,
        });
    }

    const mode = String(parsedUpload.fields?.mode || req.query?.mode || 'replace').trim();

    let summary;
    try {
        summary = await importBackupZip(uploadedFile.data, { mode });
    } catch (err) {
        if (err instanceof BackupValidationError) {
            logger.warn({ errMessage: err.message, mode }, 'Rejected invalid backup archive');
            if (wantsJsonResponse(req)) {
                return res.status(err.status).json({ error: err.message });
            }
            const stats = await getDatabaseStats();
            return res.status(err.status).render('backup/index', {
                template,
                title: 'Backup do Banco de Dados',
                stats,
                successMessage: null,
                errorMessage: err.message,
                importSummary: null,
            });
        }
        throw err;
    }

    const stats = await getDatabaseStats();
    const modeLabel = summary.mode === 'replace' ? 'substituição completa' : 'mesclagem';
    const successMessage = `Backup importado com sucesso (${modeLabel}: ${summary.totalImported} registro(s) processado(s)).`;

    logger.info({
        mode: summary.mode,
        totalImported: summary.totalImported,
        backupCreatedAt: summary.backupCreatedAt,
        adminEmail: req.session?.email || 'dev-mode',
    }, 'Database backup imported');

    if (wantsJsonResponse(req)) {
        return res.status(200).json({
            success: true,
            message: successMessage,
            summary,
            stats,
        });
    }

    return res.status(200).render('backup/index', {
        template,
        title: 'Backup do Banco de Dados',
        stats,
        successMessage,
        errorMessage: null,
        importSummary: summary,
    });
}));

export default router;
