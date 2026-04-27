import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import utils from '../util/utils.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';

const router = express.Router();

/* GET TableList page. */
router.get('/list', asyncHandler(async function (req, res) {
    const tables = await db.Table.find({}).lean()
    const tableList = tables.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('table/tableList', { template, title: 'Tabelas', tableList, statusEnum: db.StatusEnum })
}));

/* GET tables JSON */
router.get('/listJSON', asyncHandler(async function (req, res) {
    const tables = await db.Table.find({}).lean()
    res.json(tables)
}));

/* GET New Table page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('table/editTable', { template, title: 'Cadastro de Tabela' });
});

/* POST to Add Table */
router.post('/add', requireAdmin, validateBody({
    name: { required: true, trim: true, message: 'Nome é obrigatório.' }
}), asyncHandler(async function (req, res) {
    const name = req.body.name
    const data = parseData(req.body)

    const table = new db.Table({ name, data })
    await table.save()
    logger.info("Table saved")
    res.redirect("/tables/list")
}));

/* GET Edit Table page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const table = await db.Table.findById(req.params.id)
    res.render('table/editTable', { template, title: 'Edição de Tabela', statusEnum: db.StatusEnum, table })
}));

/* POST to Update Table */
router.post('/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    name: { required: true, trim: true, message: 'Nome é obrigatório.' }
}), asyncHandler(async function (req, res) {
    const tableId = req.body.id
    const name = req.body.name
    const data = parseData(req.body)
    const status = req.body.status

    await db.Table.findOneAndUpdate({ _id: tableId }, { $set: { data, name, status } }, { new: true })
    logger.info("Table updated")
    res.redirect("/tables/list")
}));

/* POST Remove Table */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.Table.findOneAndDelete({ _id: req.params.id })
    res.redirect("/tables/list")
}));

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
