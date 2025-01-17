var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

/* GET BillList page. */
router.get('/list', function (req, res) {
    db.Bill.find({}).lean().exec(
        function (e, bills) {
            const billList = bills.sort((a,b)=>a.name.localeCompare(b.name))
            res.render('bill/billList', { template, title: 'Contas', billList, valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum });
        });
});

/* GET New Bill page. */
router.get('/new', async function (req, res) {
    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean().exec()
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum, activeUsers });
});

/* POST to Add Bill */
router.post('/add', function (req, res) {
    let users = req.body.users;
    let name = req.body.name;
    let company = req.body.company;
    let dueDay = req.body.dueDay;
    let icon = req.body.icon;
    let valueSourceType = req.body.valueSourceType;
    let valueSourceId = valueSourceType === 'EMAIL' ? req.body.email : req.body.table;

    let bill = new db.Bill({ users, name, company, dueDay, icon, valueSourceType, valueSourceId });
    bill.save(function (err) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Bill saved");
            res.redirect("/bills/list");
        }
    });
});

/* GET Edit Bill page. */
router.get('/edit/:id', async function (req, res) {
    let billId = req.params.id;

    const activeUsers = await db.User.find({ status: 'ACTIVE' }).lean().exec()

    db.Bill.findById(billId, function (err, bill) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('bill/editBill', { template, title: 'Edição de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, bill, activeUsers });
        }
    });
});

/* POST to Update Bill */
router.post('/update', function (req, res) {

    let users = req.body.users;
    let billId = req.body.id;
    let name = req.body.name;
    let company = req.body.company;
    let dueDay = req.body.dueDay;
    let icon = req.body.icon;
    let valueSourceType = req.body.valueSourceType;
    let valueSourceId = valueSourceType == 'EMAIL' ? req.body.email : req.body.table;
    let status = req.body.status;

    db.Bill.findOneAndUpdate({ _id: billId }, { $set: { users, name, company, dueDay, icon, valueSourceType, valueSourceId, status } }, { new: true }, function (err, bill) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Bill updated");
            res.redirect("/bills/list");
        }
    });
});

/* GET Remove Bill */
router.get('/remove/:id', function (req, res) {
    let billId = req.params.id;

    db.Bill.findOneAndRemove({ _id: billId }, function (err, bill) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.redirect("/bills/list");
        }
    });
});

function handleError(error) {
    console.log("Error! " + error.message);
}


module.exports = router;