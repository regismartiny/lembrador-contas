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
    res.render('table/editTable', { template, title: 'Cadastro de Tabela' });
});

/* POST to Add Table */
router.post('/add', function (req, res) {
    let name = req.body.name;
    let data = parseData(req.body);

    let table = new Tables({ name, data });
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
    let name = req.body.name;
    let data = parseData(req.body);

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

function parseData(body) {
    let data = body;
    let newData = [];
    let length = (typeof body.period === 'Array') ? body.period.length : 1;
    for(let i=0; i < data.length; i++) {
        let line = length > 1 ? data[i].period : data.period;
        console.log('line:', line);
        let period = { month:  Number(line.substr(5,7)), year: Number(line.substr(0,4)) };
        let value = length > 1 ? data[i].value : data.value;
        newData.push({period, value});
    }
    return newData;
}


module.exports = router;