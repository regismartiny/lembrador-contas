import express from 'express';
import template from './template.js';
import db from '../db.js';

const router = express.Router();


/* GET BillList page. */
router.get('/list', async function (req, res) {
    var bills = await db.Bill.find({}).lean()
    const billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('bill/billList', { template, title: 'Contas', billList, billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum });
});

/* GET New Bill page. */
router.get('/new', async function (req, res) {
    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean()
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, paymentTypeEnum: db.PaymentTypeEnum, activeUsers });
});

/* POST to Add Bill */
router.post('/add', function (req, res) {
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

    let bill = new db.Bill({ users, name, company, dueDay, icon, valueSourceType, valueSourceId, paymentType });
    bill.save().then(function () {
        console.log("Bill saved")
        res.redirect("/bills/list")
    }).catch(err => {
        handleError(err)
        return err
    })
});

/* GET Edit Bill page. */
router.get('/edit/:id', async function (req, res) {
    let billId = req.params.id;

    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean()

    db.Bill.findById(billId).then(function (bill) {
        res.render('bill/editBill', { template, title: 'Edição de Conta', billTypeEnum: db.BillTypeEnum, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, paymentTypeEnum: db.PaymentTypeEnum, bill, activeUsers });
    }).catch(err => {
        handleError(err);
        return err;
    });
});

/* POST to Update Bill */
router.post('/update', function (req, res) {

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

    db.Bill.findOneAndUpdate({ _id: billId }, { $set: { users, name, company, dueDay, icon, type, valueSourceType, valueSourceId, status, paymentType } }, { new: true }).then(function (bill) {
        console.log("Bill updated")
        res.redirect("/bills/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Remove Bill */
router.get('/remove/:id', function (req, res) {
    let billId = req.params.id

    db.Bill.findOneAndDelete({ _id: billId }).then(function (bill) {
        res.redirect("/bills/list");
    }).catch(err => {
        handleError(err)
        return err
    })
})

function handleError(error) {
    console.log("Error! " + error.message);
}


export default router;