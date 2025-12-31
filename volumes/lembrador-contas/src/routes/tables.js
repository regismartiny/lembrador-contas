import express from 'express';
import template from './template.js';
import db from '../db.js';
import utils from '../util/utils.js';

const router = express.Router();

/* GET TableList page. */
router.get('/list', function (req, res) {
    db.Table.find({}).lean().then(
        function (tables) {
            const tableList = tables.sort((a,b)=>a.name.localeCompare(b.name))
            res.render('table/tableList', { template, title: 'Tabelas', tableList, statusEnum: db.StatusEnum })
        }
    )
})

/* GET tables JSON */
router.get('/listJSON', function (req, res) {
    db.Table.find({}).lean().then(
        function (tables) {
            res.setHeader('Content-Type', 'application/json')
            res.send(JSON.stringify(tables))
        }
    )
})

/* GET New Table page. */
router.get('/new', function (req, res) {
    res.render('table/editTable', { template, title: 'Cadastro de Tabela' });
});

/* POST to Add Table */
router.post('/add', function (req, res) {
    let name = req.body.name
    let data = parseData(req.body)

    let table = new db.Table({ name, data })
    table.save().then(function () {
        console.log("Table saved")
        res.redirect("/tables/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Edit Table page. */
router.get('/edit/:id', function (req, res) {
    let tableId = req.params.id

    db.Table.findById(tableId).then(function (table) {
        res.render('table/editTable', { template, title: 'Edição de Tabela', statusEnum: db.StatusEnum, table })
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* POST to Update Table */
router.post('/update', function (req, res) {

    let tableId = req.body.id
    let name = req.body.name
    let data = parseData(req.body)
    let status = req.body.status

    db.Table.findOneAndUpdate({ _id: tableId }, { $set: { data, name, status }}, { new: true }).then(function (table) {
        console.log("Table updated")
        res.redirect("/tables/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Remove Table */
router.get('/remove/:id', function (req, res) {
    let tableId = req.params.id

    db.Table.findOneAndDelete({ _id: tableId }).then(function (table) {
        res.redirect("/tables/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

function handleError(error) {
    console.log("Error! " + error.message);
}

function parseData(body) {
    let newData = [];
    body.value = utils.toArray(body.value);
    body.period = utils.toArray(body.period);
    let length = body.period.length;
    for(let i=0; i < length; i++) {
        let value = body.value[i];
        let period = parsePeriod(body.period[i]);
        newData.push({period, value});
    }
    return newData;
}

function parsePeriod(periodStr) {
    if (periodStr && typeof periodStr == 'string') {
        return { month:  Number(periodStr.substring(5,7)), year: Number(periodStr.substring(0,4)) };
    }
    return {}
}

export default router;