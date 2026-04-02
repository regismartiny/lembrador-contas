import express from 'express';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';

const router = express.Router();


/* GET BillList page. */
router.get('/list', async function (req, res, next) {
    try {
        const bills = await db.Bill.find({}).lean()
        const billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
        res.render('bill/billList', { template, title: 'Contas', billList, billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum });
    } catch (err) {
        next(err)
    }
});

/* GET New Bill page. */
router.get('/new', async function (req, res, next) {
    try {
        const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean()
        res.render('bill/newBill', { template, title: 'Cadastro de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, paymentTypeEnum: db.PaymentTypeEnum, activeUsers });
    } catch (err) {
        next(err)
    }
});

/* POST to Add Bill */
router.post('/add', async function (req, res, next) {
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

    try {
        const bill = new db.Bill({ users, name, company, dueDay, icon, valueSourceType, valueSourceId, paymentType });
        await bill.save();
        logger.info("Bill saved")
        res.redirect("/bills/list")
    } catch (err) {
        next(err)
    }
});

/* GET Edit Bill page. */
router.get('/edit/:id', async function (req, res, next) {
    try {
        const [bill, activeUsers] = await Promise.all([
            db.Bill.findById(req.params.id),
            db.User.find({ status: 'ACTIVE' }).lean()
        ])
        res.render('bill/editBill', { template, title: 'Edição de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, paymentTypeEnum: db.PaymentTypeEnum, bill, activeUsers });
    } catch (err) {
        next(err)
    }
});

/* POST to Update Bill */
router.post('/update', async function (req, res, next) {
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

    try {
        await db.Bill.findOneAndUpdate({ _id: billId }, { $set: { users, name, company, dueDay, icon, type, valueSourceType, valueSourceId, status, paymentType } }, { new: true })
        logger.info("Bill updated")
        res.redirect("/bills/list")
    } catch (err) {
        next(err)
    }
})

/* GET Remove Bill */
router.get('/remove/:id', async function (req, res, next) {
    try {
        await db.Bill.findOneAndDelete({ _id: req.params.id })
        res.redirect("/bills/list");
    } catch (err) {
        next(err)
    }
})


export default router;
