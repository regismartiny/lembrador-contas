import express from 'express';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';
import utils from '../util/utils.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();

/* GET TableList page. */
router.get('/list', async function (req, res, next) {
    try {
        const tables = await db.Table.find({}).lean()
        const tableList = tables.sort((a,b)=>a.name.localeCompare(b.name))
        res.render('table/tableList', { template, title: 'Tabelas', tableList, statusEnum: db.StatusEnum })
    } catch (err) {
        next(err)
    }
})

/* GET tables JSON */
router.get('/listJSON', async function (req, res, next) {
    try {
        const tables = await db.Table.find({}).lean()
        res.setHeader('Content-Type', 'application/json')
        res.send(JSON.stringify(tables))
    } catch (err) {
        next(err)
    }
})

/* GET New Table page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('table/editTable', { template, title: 'Cadastro de Tabela' });
});

/* POST to Add Table */
router.post('/add', requireAdmin, async function (req, res, next) {
    let name = (req.body.name || '').trim()
    let data = parseData(req.body)

    if (!name) {
        return res.status(400).send('Nome é obrigatório.')
    }

    try {
        const table = new db.Table({ name, data })
        await table.save()
        logger.info("Table saved")
        res.redirect("/tables/list")
    } catch (err) {
        next(err)
    }
})

/* GET Edit Table page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), async function (req, res, next) {
    try {
        const table = await db.Table.findById(req.params.id)
        res.render('table/editTable', { template, title: 'Edição de Tabela', statusEnum: db.StatusEnum, table })
    } catch (err) {
        next(err)
    }
})

/* POST to Update Table */
router.post('/update', requireAdmin, async function (req, res, next) {
    let tableId = req.body.id
    let name = (req.body.name || '').trim()
    let data = parseData(req.body)
    let status = req.body.status

    if (!tableId || !name) {
        return res.status(400).send('Dados inválidos.')
    }

    try {
        await db.Table.findOneAndUpdate({ _id: tableId }, { $set: { data, name, status } }, { new: true })
        logger.info("Table updated")
        res.redirect("/tables/list")
    } catch (err) {
        next(err)
    }
})

/* POST Remove Table */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), async function (req, res, next) {
    try {
        await db.Table.findOneAndDelete({ _id: req.params.id })
        res.redirect("/tables/list")
    } catch (err) {
        next(err)
    }
})

function parseData(body) {
    let newData = [];
    body.value = utils.toArray(body.value);
    body.period = utils.toArray(body.period);
    let length = body.period.length;
    for (let i = 0; i < length; i++) {
        let value = body.value[i];
        let period = parsePeriod(body.period[i]);
        newData.push({period, value});
    }
    return newData;
}

function parsePeriod(periodStr) {
    if (periodStr && typeof periodStr == 'string') {
        return { month: Number(periodStr.substring(5,7)), year: Number(periodStr.substring(0,4)) };
    }
    return {}
}

export default router;
