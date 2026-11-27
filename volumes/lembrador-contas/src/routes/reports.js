import express from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import logger from '../util/logger.js';
import {
    buildBillReport,
    generateReportCsv,
    formatCurrencyBR,
} from '../util/reportService.js';

const router = express.Router();

async function loadReportContext(query) {
    const [activeBills, allUsers] = await Promise.all([
        db.ActiveBill.find().lean(),
        db.User.find({}).lean(),
    ]);

    const billUserIds = new Set(
        activeBills
            .flatMap(bill => bill.users || [])
            .filter(Boolean)
            .map(user => (user._id || user).toString())
    );

    const users = allUsers
        .filter(user => !user.status || user.status === 'ACTIVE' || billUserIds.has(user._id.toString()))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const rawUserId = query.userId ? String(query.userId).trim() : 'ALL';
    const isAllUsers = !rawUserId || rawUserId === 'ALL';
    const userId = isAllUsers
        ? 'ALL'
        : (mongoose.Types.ObjectId.isValid(rawUserId) || users.some(u => String(u._id) === rawUserId) ? rawUserId : '__invalid__');

    const report = buildBillReport({
        activeBills,
        users: allUsers,
        filters: {
            userId,
            startPeriod: query.startPeriod || '',
            endPeriod: query.endPeriod || '',
        },
        statusEnum: db.ActiveBillStatusEnum,
        paymentEnum: db.PaymentTypeEnum,
    });

    if (userId === '__invalid__') {
        report.filters.userId = rawUserId;
        report.filters.userName = 'Usuário inválido';
    }

    return { users, report };
}

function buildCsvFilename(filters) {
    const slug = filters.userId === 'ALL'
        ? 'consolidado'
        : String(filters.userName || 'usuario')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'usuario';

    const rangeParts = [];
    if (filters.startPeriod) rangeParts.push(filters.startPeriod);
    if (filters.endPeriod) rangeParts.push(filters.endPeriod);
    const rangeSuffix = rangeParts.length > 0 ? `-${rangeParts.join('-a-')}` : '';

    return `relatorio-contas-${slug}${rangeSuffix}.csv`;
}

/* GET Reports page. */
router.get('/', asyncHandler(async function (req, res) {
    const { users, report } = await loadReportContext(req.query);
    logger.debug({
        userId: report.filters.userId,
        startPeriod: report.filters.startPeriod,
        endPeriod: report.filters.endPeriod,
        totalBills: report.summary.totalBills,
    }, 'Rendered bill report');

    const exportParams = new URLSearchParams();
    if (req.query.userId) exportParams.set('userId', String(req.query.userId));
    if (report.filters.startPeriod) exportParams.set('startPeriod', report.filters.startPeriod);
    if (report.filters.endPeriod) exportParams.set('endPeriod', report.filters.endPeriod);
    const exportQueryString = exportParams.toString();

    res.render('report/index', {
        template,
        title: 'Relatório de Contas',
        users,
        report,
        formatCurrencyBR,
        generatedAt: new Date(),
        exportUrl: `/reports/export.csv${exportQueryString ? `?${exportQueryString}` : ''}`,
    });
}));

/* GET Export CSV report. */
router.get('/export.csv', asyncHandler(async function (req, res) {
    const { report } = await loadReportContext(req.query);
    const csvContent = generateReportCsv(report);
    const filename = buildCsvFilename(report.filters);

    logger.info({
        userId: report.filters.userId,
        totalBills: report.summary.totalBills,
        filename,
    }, 'Exported bill report CSV');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
}));

export default router;
