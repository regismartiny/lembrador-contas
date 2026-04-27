import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = express.Router();


/* GET APIList page. */
router.get('/list', asyncHandler(async function (req, res) {
    const apis = await db.API.find({}).lean()
    const apiList = apis.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('api/apiList', { template, title: 'APIs', apiList, statusEnum: db.StatusEnum });
}));

/* GET apis JSON */
router.get('/listJSON', asyncHandler(async function (req, res) {
    const apis = await db.API.find({}).lean()
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(apis));
}));

/* GET New API page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('api/editApi', { template, title: 'Cadastro de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum });
});

/* POST to Add API */
router.post('/add', requireAdmin, asyncHandler(async function (req, res) {
    let name = (req.body.name || '').trim()
    let url = (req.body.url || '').trim()
    let method = req.body.method
    let body = req.body.body
    let value = req.body.value

    if (!name || !url) {
        return res.status(400).send('Nome e URL são obrigatórios.')
    }
    if (method && !Object.keys(db.HttpMethodEnum).includes(method)) {
        return res.status(400).send('Método HTTP inválido.')
    }

    const api = new db.API({ name, url, method, body, value })
    await api.save()
    logger.info("API saved");
    res.redirect("/apis/list");
}));

/* GET Edit API page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const api = await db.API.findById(req.params.id)
    res.render('api/editApi', { template, title: 'Edição de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum, api })
}));

/* POST to Update API */
router.post('/update', requireAdmin, asyncHandler(async function (req, res) {
    let apiId = req.body.id;
    let name = (req.body.name || '').trim();
    let url = (req.body.url || '').trim();
    let method = req.body.method;
    let body = req.body.body;
    let value = req.body.value;
    let status = req.body.status;

    if (!apiId || !name || !url) {
        return res.status(400).send('Dados inválidos.')
    }

    await db.API.findOneAndUpdate({ _id: apiId }, { $set: { name, url, method, body, value, status } }, { new: true })
    logger.info("API updated")
    res.redirect("/apis/list")
}));

/* POST Remove API */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.API.findOneAndDelete({ _id: req.params.id })
    res.redirect("/apis/list");
}));

export default router;
