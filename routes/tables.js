var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

var Tables = db.Mongoose.model('tablecollection', db.TableSchema, 'tablecollection');


/* GET TableList page. */
router.get('/list', function (req, res) {
    Tables.find({}).lean().exec(
        function (e, tables) {
            res.render('table/tableList', { template, title: 'Lista de Tabelas', tableList: tables });
        });
});

/* GET New Table page. */
router.get('/new', function (req, res) {
    res.render('table/newTable', { template, title: 'Cadastro de Tabela' });
});

/* POST to Add Table */
router.post('/add', function (req, res) {
    let tableName = req.body.name;
    let tableData = [ { period: { month: req.body.month, year: req.body.year }, value: req.body.value }];

    let table = new Tables({ name: tableName, data: tableData });
    table.save(function (err) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Table saved");
            res.redirect("/tables/list");
        }
    });
});

/* GET Edit Table page. */
router.get('/edit/:id', function (req, res) {
    let tableId = req.params.id;

    Tables.findById(tableId, function (err, table) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('table/editTable', { template, title: 'Edição de Tabela', table });
        }
    });
});

/* POST to Update Table */
router.post('/update', function (req, res) {

    let tableId = req.body.id;
    let data = req.body.data;

    Tables.findOneAndUpdate({ _id: tableId }, { $set: { data, name }}, { new: true }, function (err, table) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Table updated");
            res.redirect("/tables/list");
        }
    });
});

/* GET Remove Table */
router.get('/remove/:id', function (req, res) {
    let tableId = req.params.id;

    Tables.findOneAndRemove({ _id: tableId }, function (err, table) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.redirect("/tables/list");
        }
    });
});

function handleError(error) {
    console.log("Error! " + error.message);
}


module.exports = router;