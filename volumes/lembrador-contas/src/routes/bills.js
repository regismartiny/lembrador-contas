import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();


/* GET BillList page. */
router.get('/list', asyncHandler(async function (req, res) {
    const bills = await db.Bill.find({}).lean()
    const billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('bill/billList', { template, title: 'Contas', billList, billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum });
}));

/* GET New Bill page. */
router.get('/new', requireAdmin, asyncHandler(async function (req, res) {
    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean()
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, paymentTypeEnum: db.PaymentTypeEnum, activeUsers });
}));

/* POST to Add Bill */
router.post('/add', requireAdmin, validateBody({
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    company: { required: true, trim: true, message: 'Empresa é obrigatória.' },
    dueDay: { required: true, isInt: true, min: 1, max: 31, message: 'Dia de vencimento (1-31) é obrigatório.' },
    valueSourceType: { required: true, enum: ['TABLE', 'EMAIL', 'API'], enumMessage: 'Tipo de fonte de dados inválido.' }
}), asyncHandler(async function (req, res) {
    const users = req.body.users;
    const name = req.body.name;
    const company = req.body.company;
    const dueDay = parseInt(req.body.dueDay, 10);
    const icon = req.body.icon;
    const valueSourceType = req.body.valueSourceType;
    const valueSourceId = valueSourceType === 'EMAIL' ? req.body.email : req.body.table;
    const paymentType = req.body.paymentType;

    const bill = new db.Bill({ users, name, company, dueDay, icon, valueSourceType, valueSourceId, paymentType });
    await bill.save();
    logger.info("Bill saved")
    res.redirect("/bills/list")
}));

/* GET Edit Bill page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const [bill, activeUsers] = await Promise.all([
        db.Bill.findById(req.params.id),
        db.User.find({ status: 'ACTIVE' }).lean()
    ])
    res.render('bill/editBill', { template, title: 'Edição de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, paymentTypeEnum: db.PaymentTypeEnum, bill, activeUsers });
}));

/* POST to Update Bill */
router.post('/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    name: { required: true, trim: true, message: 'Nome é obrigatório.' },
    company: { required: true, trim: true, message: 'Empresa é obrigatória.' },
    dueDay: { required: true, isInt: true, min: 1, max: 31, message: 'Dia de vencimento (1-31) é obrigatório.' }
}), asyncHandler(async function (req, res) {
    const users = req.body.users
    const billId = req.body.id
    const name = req.body.name
    const company = req.body.company
    const dueDay = parseInt(req.body.dueDay, 10)
    const icon = req.body.icon
    const type = req.body.type
    const valueSourceType = req.body.valueSourceType
    const valueSourceId = valueSourceType == 'EMAIL' ? req.body.email : req.body.table
    const status = req.body.status
    const paymentType = req.body.paymentType

    await db.Bill.findOneAndUpdate({ _id: billId }, { $set: { users, name, company, dueDay, icon, type, valueSourceType, valueSourceId, status, paymentType } }, { new: true })
    logger.info("Bill updated")
    res.redirect("/bills/list")
}));

/* POST Remove Bill */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.Bill.findOneAndDelete({ _id: req.params.id })
    res.redirect("/bills/list");
}));


export default router;
