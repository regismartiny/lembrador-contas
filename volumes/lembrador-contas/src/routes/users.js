import express from 'express';
import mongoose from 'mongoose';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

function hasUserId(usersField, userId) {
    return (usersField || []).some(u => (u?._id || u)?.toString() === userId);
}

async function loadSortedUsersWithBillFlag() {
    const [users, bills, activeBills] = await Promise.all([
        db.User.find({}).lean(),
        db.Bill.find({}).lean(),
        db.ActiveBill.find({}).lean(),
    ]);
    const assignedUserIds = new Set([
        ...bills.flatMap(b => b.users || []).filter(Boolean).map(u => (u._id || u).toString()),
        ...activeBills.flatMap(b => b.users || []).filter(Boolean).map(u => (u._id || u).toString()),
    ]);
    return users
        .map(u => ({ ...u, hasAssignedBills: assignedUserIds.has(u._id.toString()) }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function buildUserDeletionBlockedMessage(userName, assignedBills, assignedActiveBills) {
    const targetLabel = userName ? `o usuário "${userName}"` : 'este usuário';
    const reasons = [];

    if (assignedBills.length > 0) {
        const previewNames = assignedBills
            .map(b => b.name)
            .filter(Boolean)
            .slice(0, 3);
        const suffix = assignedBills.length > 3 ? ', ...' : '';
        const namesDetail = previewNames.length > 0 ? ` (${previewNames.join(', ')}${suffix})` : '';
        reasons.push(`${assignedBills.length} conta(s) cadastrada(s)${namesDetail}`);
    }

    if (assignedActiveBills.length > 0) {
        reasons.push(`${assignedActiveBills.length} lançamento(s) no demonstrativo mensal`);
    }

    return `Não é possível excluir ${targetLabel} pois há ${reasons.join(' e ')} atribuídos a ele. Remova o vínculo nas contas antes de excluir ou altere a situação para Inativo.`;
}

/* GET UserList page. */
router.get('/list', asyncHandler(async function (req, res) {
    const userList = await loadSortedUsersWithBillFlag();
    res.render('user/userList', { template, title: 'Usuários', userList, statusEnum: db.StatusEnum, errorMessage: null });
}));

/* GET New User page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('user/newUser', { template, title: 'Cadastro de Usuário' });
});

/* POST to Add User Service */
router.post('/add', requireAdmin, validateBody({
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    email: { required: true, trim: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Email inválido.' }
}), asyncHandler(async function (req, res) {
    const name = req.body.name;
    const email = req.body.email.toLowerCase();
    const admin = req.body.admin === 'true';

    const user = new db.User({ name, email, admin });
    await user.save();
    logger.info("User saved");
    res.redirect("/users/list");
}));

/* GET Edit User page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const user = await db.User.findById(req.params.id)
    if (!user) {
        return res.status(404).render('error', { message: 'Usuário não encontrado.', error: { status: 404 } });
    }
    res.render('user/editUser', { template, title: 'Edição de Usuário', statusEnum: db.StatusEnum, user })
}));

/* POST to Update User */
router.post('/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    email: { required: true, trim: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Email inválido.' }
}), asyncHandler(async function (req, res) {
    const userId = req.body.id
    const name = req.body.name
    const email = req.body.email.toLowerCase()
    const status = req.body.status
    const admin = req.body.admin === 'true';
    logger.info({ admin }, 'Updating user role')

    await db.User.findOneAndUpdate(
        { _id: userId },
        { $set: { name, email, status, admin, updated_at: new Date() } },
        { new: true, runValidators: true }
    )
    logger.info("User updated")
    res.redirect("/users/list")
}));

/* POST Remove User */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const userId = req.params.id
    const mongoUserId = new mongoose.Types.ObjectId(userId)

    const [bills, activeBills] = await Promise.all([
        db.Bill.find({ users: mongoUserId }).lean(),
        db.ActiveBill.find({ users: mongoUserId }).lean(),
    ])

    const assignedBills = bills.filter(bill => hasUserId(bill.users, userId))
    const assignedActiveBills = activeBills.filter(bill => hasUserId(bill.users, userId))

    if (assignedBills.length > 0 || assignedActiveBills.length > 0) {
        const userList = await loadSortedUsersWithBillFlag()
        const targetUser = userList.find(u => u._id?.toString() === userId)
        const errorMessage = buildUserDeletionBlockedMessage(targetUser?.name, assignedBills, assignedActiveBills)

        logger.warn({
            assignedBillCount: assignedBills.length,
            assignedActiveBillCount: assignedActiveBills.length,
        }, 'Blocked user deletion due to assigned bills')

        const wantsHtml = typeof req.accepts === 'function' &&
            !req.xhr &&
            typeof req.headers?.accept === 'string' &&
            req.headers.accept.includes('text/html') &&
            req.accepts(['html', 'json']) === 'html'

        if (wantsHtml) {
            return res.status(409).render('user/userList', {
                template,
                title: 'Usuários',
                userList,
                statusEnum: db.StatusEnum,
                errorMessage,
            })
        }

        return res.status(409).json({ error: errorMessage })
    }

    await db.User.findOneAndDelete({ _id: userId })
    logger.info("User removed")
    res.redirect("/users/list")
}));


export default router;
