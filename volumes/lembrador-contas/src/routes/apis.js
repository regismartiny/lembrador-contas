var express = require('express')
var router = express.Router()
var template = require('./template')
var db = require("../db")

/* GET APIList page. */
router.get('/list', async function (req, res) {
    let apis = await db.API.find({}).lean().exec()
    const apiList = apis.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('api/apiList', { template, title: 'APIs', apiList, statusEnum: db.StatusEnum })
})

/* GET apis JSON */
router.get('/listJSON', async function (req, res) {
    let apis = await db.API.find({}).lean().exec()
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(apis))
})

/* GET New API page. */
router.get('/new', function (req, res) {
    res.render('api/editApi', { template, title: 'Cadastro de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum })
})

/* POST to Add API */
router.post('/add', async function (req, res) {
    let name = req.body.name
    let url = req.body.url
    let method = req.body.method
    let body = req.body.body
    let value = req.body.value

    let api = new db.API({ name, url, method, body, value })
    try {
        await api.save()
        console.log("API saved")
        res.redirect("/apis/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Edit API page. */
router.get('/edit/:id', async function (req, res) {
    let apiId = req.params.id
    try {
        let api = await db.API.findById(apiId)
        res.render('api/editApi', { template, title: 'Edição de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum, api })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* POST to Update API */
router.post('/update', async function (req, res) {
    let apiId = req.body.id
    let name = req.body.name
    let url = req.body.url
    let method = req.body.method
    let body = req.body.body
    let value = req.body.value
    let status = req.body.status

    try {
        await db.API.findOneAndUpdate({ _id: apiId }, { $set: { name,  url, method, body, value, status} }, { new: true })
        console.log("API updated")
        res.redirect("/apis/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
});

/* GET Remove API */
router.get('/remove/:id', async function (req, res) {
    let apiId = req.params.id

    try {
        await db.API.findOneAndRemove({ _id: apiId })
        res.redirect("/apis/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

function handleError(error, res) {
    console.log("Error! " + error.message)
    res.render('error', { message: '', error: error})
}


module.exports = router