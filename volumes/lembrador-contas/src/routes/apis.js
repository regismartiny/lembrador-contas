import express from 'express';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();


/* GET APIList page. */
router.get('/list', async function (req, res, next) {
    try {
        const apis = await db.API.find({}).lean()
        const apiList = apis.sort((a,b)=>a.name.localeCompare(b.name))
        res.render('api/apiList', { template, title: 'APIs', apiList, statusEnum: db.StatusEnum });
    } catch (err) {
        next(err)
    }
});

/* GET apis JSON */
router.get('/listJSON', async function (req, res, next) {
    try {
        const apis = await db.API.find({}).lean()
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(apis));
    } catch (err) {
        next(err)
    }
});

/* GET New API page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('api/editApi', { template, title: 'Cadastro de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum });
});

/* POST to Add API */
router.post('/add', requireAdmin, async function (req, res, next) {
    let name = req.body.name
    let url = req.body.url
    let method = req.body.method
    let body = req.body.body
    let value = req.body.value

    try {
        const api = new db.API({ name, url, method, body, value })
        await api.save()
        logger.info("API saved");
        res.redirect("/apis/list");
    } catch (err) {
        next(err)
    }
})

/* GET Edit API page. */
router.get('/edit/:id', requireAdmin, async function (req, res, next) {
    try {
        const api = await db.API.findById(req.params.id)
        res.render('api/editApi', { template, title: 'Edição de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum, api })
    } catch (err) {
        next(err)
    }
})

/* POST to Update API */
router.post('/update', requireAdmin, async function (req, res, next) {
    let apiId = req.body.id;
    let name = req.body.name;
    let url = req.body.url;
    let method = req.body.method;
    let body = req.body.body;
    let value = req.body.value;
    let status = req.body.status;

    try {
        await db.API.findOneAndUpdate({ _id: apiId }, { $set: { name, url, method, body, value, status } }, { new: true })
        logger.info("API updated")
        res.redirect("/apis/list")
    } catch (err) {
        next(err)
    }
})

/* GET Remove API */
router.get('/remove/:id', requireAdmin, async function (req, res, next) {
    try {
        await db.API.findOneAndDelete({ _id: req.params.id })
        res.redirect("/apis/list");
    } catch (err) {
        next(err)
    }
});

export default router;
