var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");


/* GET TableList page. */
router.get('/list', function (req, res) {
    db.Table.find({}).lean().exec(
        function (e, tables) {
            res.render('table/tableList', { template, title: 'Lista de Tabelas', tableList: tables });
        });
});

/* GET tables JSON */
router.get('/listJSON', function (req, res) {
    db.Table.find({}).lean().exec(
        function (e, tables) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(tables));
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
    let status = req.body.status;

    let table = new db.Table({ name, data, status });
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

    db.Table.findById(tableId, function (err, table) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('table/editTable', { template, title: 'Edição de Tabela', statusEnum: db.StatusEnum, table });
        }
    });
});

/* POST to Update Table */
router.post('/update', function (req, res) {

    let tableId = req.body.id;
    let name = req.body.name;
    let data = parseData(req.body);
    let status = req.body.status;

    db.Table.findOneAndUpdate({ _id: tableId }, { $set: { data, name, status }}, { new: true }, function (err, table) {
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

    db.Table.findOneAndRemove({ _id: tableId }, function (err, table) {
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
    let newData = [];
    body.value = toArray(body.value);
    body.period = toArray(body.period);
    let length = body.period.length;
    for(let i=0; i < length; i++) {
        let value = body.value[i];
        let period = parsePeriod(body.period[i]);
        newData.push({period, value});
    }
    return newData;
}

function toArray(obj) {
    return Array.isArray(obj) ? obj : [].concat(obj);
}

function parsePeriod(periodStr) {
    return { month:  Number(periodStr.substr(5,7)), year: Number(periodStr.substr(0,4)) };
}


module.exports = router;