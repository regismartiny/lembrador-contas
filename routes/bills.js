var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

var Bills = db.Mongoose.model('billcollection', db.BillSchema, 'billcollection');


/* GET BillList page. */
router.get('/list', function (req, res) {
    Bills.find({}).lean().exec(
        function (e, bills) {
            res.render('bill/billList', { template, title: 'Lista de Contas', billList: bills });
        });
});

/* GET New Bill page. */
router.get('/new', function (req, res) {
    res.render('bill/newBill', { template, title: 'Cadastro de Conta', valueSourceType: db.ValueSourceType });
});

/* POST to Add Bill */
router.post('/add', function (req, res) {
    let billCompany = req.body.company;
    let billValueSourceType = req.body.valueSourceType;
    let billValueSourceId = billValueSourceType === 'EMAIL' ? req.body.email : req.body.table;

    let bill = new Bills({ company: billCompany, valueSourceType: billValueSourceType, valueSourceId: billValueSourceId });
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

    Bills.findById(billId, function (err, bill) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('bill/editBill', { template, title: 'Edição de Conta', valueSourceType: db.ValueSourceType, bill });
        }
    });
});

/* POST to Update Bill */
router.post('/update', function (req, res) {

    let billId = req.body.id;
    let billCompany = req.body.company;
    let billValueSourceType = req.body.valueSourceType;
    let billValueSourceId = billValueSourceType == 'EMAIL' ? req.body.email : req.body.table;

    Bills.findOneAndUpdate({ _id: billId }, { $set: { company: billCompany, valueSourceType: billValueSourceType, valueSourceId: billValueSourceId } }, { new: true }, function (err, bill) {
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

    Bills.findOneAndRemove({ _id: billId }, function (err, bill) {
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