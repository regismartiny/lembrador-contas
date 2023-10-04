var express = require('express')
var router = express.Router()
var template = require('./template')
var db = require("../db")

/* GET BillList page. */
router.get('/list', async function (req, res) {
    let bills = await db.Bill.find({}).lean().exec()
    const billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('bill/billList', { template, title: 'Contas', billList, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum })
})

/* GET New Bill page. */
router.get('/new', function (req, res) {
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum })
})

/* POST to Add Bill */
router.post('/add', async function (req, res) {
    let name = req.body.name
    let company = req.body.company
    let dueDay = req.body.dueDay
    let valueSourceType = req.body.valueSourceType
    let valueSourceId = valueSourceType === 'EMAIL' ? req.body.email : req.body.table

    let bill = new db.Bill({ name, company, dueDay, valueSourceType, valueSourceId })
    try {
        await bill.save()
        console.log("Bill saved")
        res.redirect("/bills/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Edit Bill page. */
router.get('/edit/:id', async function (req, res) {
    let billId = req.params.id

    try {
        await db.Bill.findById(billId)
        res.render('bill/editBill', { template, title: 'Edição de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, bill })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* POST to Update Bill */
router.post('/update', async function (req, res) {

    let billId = req.body.id
    let name = req.body.name
    let company = req.body.company
    let dueDay = req.body.dueDay
    let valueSourceType = req.body.valueSourceType
    let valueSourceId = valueSourceType == 'EMAIL' ? req.body.email : req.body.table
    let status = req.body.status

    try {
        await db.Bill.findOneAndUpdate({ _id: billId }, { $set: { name, company, dueDay, valueSourceType, valueSourceId, status } }, { new: true })
        console.log("Bill updated")
        res.redirect("/bills/list")
    } catch(err) {
        handleError(err)
        return err
    }
})

/* GET Remove Bill */
router.get('/remove/:id', async function (req, res) {
    let billId = req.params.id

    try {
        await db.Bill.findOneAndRemove({ _id: billId })
        res.redirect("/bills/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

function handleError(error, res) {
    console.log("Error! " + error.message)
    res.render('error', { message: '', error: error})
}


module.exports = router