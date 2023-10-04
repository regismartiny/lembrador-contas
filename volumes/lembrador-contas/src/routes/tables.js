const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const utils = require("../util/utils")


/* GET TableList page. */
router.get('/list', async function (req, res) {
    try {
        let tables = await db.Table.find({}).lean().exec()
        const tableList = tables.sort((a,b)=>a.name.localeCompare(b.name))
        res.render('table/tableList', { template, title: 'Tabelas', tableList, statusEnum: db.StatusEnum })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET tables JSON */
router.get('/listJSON', async function (req, res) {
    try {
        let tables = db.Table.find({}).lean().exec()
        res.setHeader('Content-Type', 'application/json')
        res.send(JSON.stringify(tables))
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET New Table page. */
router.get('/new', function (req, res) {
    res.render('table/editTable', { template, title: 'Cadastro de Tabela' })
})

/* POST to Add Table */
router.post('/add', async function (req, res) {
    let name = req.body.name
    let data = parseData(req.body)

    let table = new db.Table({ name, data })
    try {
        await table.save()
        console.log("Table saved")
        res.redirect("/tables/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Edit Table page. */
router.get('/edit/:id', async function (req, res) {
    let tableId = req.params.id

    try {
        let table = await db.Table.findById(tableId)
        res.render('table/editTable', { template, title: 'Edição de Tabela', statusEnum: db.StatusEnum, table })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* POST to Update Table */
router.post('/update', async function (req, res) {

    let tableId = req.body.id
    let name = req.body.name
    let data = parseData(req.body)
    let status = req.body.status

    try {
        await db.Table.findOneAndUpdate({ _id: tableId }, { $set: { data, name, status }}, { new: true })
        console.log("Table updated")
        res.redirect("/tables/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Remove Table */
router.get('/remove/:id', async function (req, res) {
    let tableId = req.params.id

    try {
        await db.Table.findOneAndRemove({ _id: tableId })
        res.redirect("/tables/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

function handleError(error, res) {
    console.log("Error! " + error.message)
    res.render('error', { message: '', error: error})
  }

function parseData(body) {
    let newData = []
    body.value = utils.toArray(body.value)
    body.period = utils.toArray(body.period)
    let length = body.period.length
    for(let i=0; i < length; i++) {
        let value = body.value[i]
        let period = parsePeriod(body.period[i])
        newData.push({period, value})
    }
    return newData
}

function parsePeriod(periodStr) {
    if (periodStr && typeof periodStr == 'string') {
        return { month:  Number(periodStr.substring(5,7)), year: Number(periodStr.substring(0,4)) }
    }
    return {}
}

module.exports = router