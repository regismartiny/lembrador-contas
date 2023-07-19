var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

/* GET BillList page. */
router.get('/list', function (req, res) {
    db.Bill.find({}).lean().exec(
        function (e, bills) {
            res.render('bill/billList', { template, title: 'Contas', billList: bills });
        });
});

/* GET New Bill page. */
router.get('/new', function (req, res) {
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum });
});

/* POST to Add Bill */
router.post('/add', function (req, res) {
    let company = req.body.company;
    let dueDay = req.body.dueDay;
    let valueSourceType = req.body.valueSourceType;
    let valueSourceId = valueSourceType === 'EMAIL' ? req.body.email : req.body.table;
    let status = req.body.status;

    let bill = new db.Bill({ company, dueDay, valueSourceType, valueSourceId, status });
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
router.get('/edit/:id', function (req, res) {
    let billId = req.params.id;

    db.Bill.findById(billId, function (err, bill) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('bill/editBill', { template, title: 'Edição de Conta', valueSourceTypeEnum: db.ValueSourceTypeEnum, statusEnum: db.StatusEnum, bill });
        }
    });
});

/* POST to Update Bill */
router.post('/update', function (req, res) {

    let billId = req.body.id;
    let company = req.body.company;
    let dueDay = req.body.dueDay;
    let valueSourceType = req.body.valueSourceType;
    let valueSourceId = valueSourceType == 'EMAIL' ? req.body.email : req.body.table;
    let status = req.body.status;

    db.Bill.findOneAndUpdate({ _id: billId }, { $set: { company, dueDay, valueSourceType, valueSourceId, status } }, { new: true }, function (err, bill) {
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