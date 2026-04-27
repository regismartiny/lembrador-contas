import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

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
router.post('/add', requireAdmin, asyncHandler(async function (req, res) {
    let users = req.body.users;
    let name = (req.body.name || '').trim();
    let company = (req.body.company || '').trim();
    let dueDay = parseInt(req.body.dueDay, 10);
    let icon = req.body.icon;
    let valueSourceType = req.body.valueSourceType;
    let valueSourceId = valueSourceType === 'EMAIL' ? req.body.email : req.body.table;
    let paymentType = req.body.paymentType;

    if (!name || !company || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
        return res.status(400).send('Nome, empresa e dia de vencimento (1-31) são obrigatórios.')
    }
    if (!['TABLE', 'EMAIL', 'API'].includes(valueSourceType)) {
        return res.status(400).send('Tipo de fonte de dados inválido.')
    }

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
router.post('/update', requireAdmin, asyncHandler(async function (req, res) {
    let users = req.body.users
    let billId = req.body.id
    let name = (req.body.name || '').trim()
    let company = (req.body.company || '').trim()
    let dueDay = parseInt(req.body.dueDay, 10)
    let icon = req.body.icon
    let type = req.body.type
    let valueSourceType = req.body.valueSourceType
    let valueSourceId = valueSourceType == 'EMAIL' ? req.body.email : req.body.table
    let status = req.body.status
    let paymentType = req.body.paymentType

    if (!billId || !name || !company || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
        return res.status(400).send('Dados inválidos.')
    }

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
