var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

/* GET APIList page. */
router.get('/list', async function (req, res) {
    var apis = await db.API.find({}).lean()
    const apiList = apis.sort((a,b)=>a.name.localeCompare(b.name))
    res.render('api/apiList', { template, title: 'APIs', apiList, statusEnum: db.StatusEnum });
});

/* GET apis JSON */
router.get('/listJSON', async function (req, res) {
    var apis = await db.API.find({}).lean()
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(apis));
});

/* GET New API page. */
router.get('/new', function (req, res) {
    res.render('api/editApi', { template, title: 'Cadastro de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum });
});

/* POST to Add API */
router.post('/add', function (req, res) {
    let name = req.body.name
    let url = req.body.url
    let method = req.body.method
    let body = req.body.body
    let value = req.body.value

    let api = new db.API({ name, url, method, body, value })
    api.save().then(function () {
        console.log("API saved");
        res.redirect("/apis/list");
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Edit API page. */
router.get('/edit/:id', function (req, res) {
    let apiId = req.params.id

    db.API.findById(apiId).then(function (api) {
        res.render('api/editApi', { template, title: 'Edição de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum, api })
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* POST to Update API */
router.post('/update', function (req, res) {
    let apiId = req.body.id;
    let name = req.body.name;
    let url = req.body.url;
    let method = req.body.method;
    let body = req.body.body;
    let value = req.body.value;
    let status = req.body.status;

    db.API.findOneAndUpdate({ _id: apiId }, { $set: { name,  url, method, body, value, status} }, { new: true }).then(function (api) {
        console.log("API updated")
        res.redirect("/apis/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Remove API */
router.get('/remove/:id', function (req, res) {
    let apiId = req.params.id;

    db.API.findOneAndRemove({ _id: apiId }).then(function (api) {
        res.redirect("/apis/list");
    }).catch(err => {
        handleError(err);
        return err;
    })
});

function handleError(error) {
    console.log("Error! " + error.message);
}


module.exports = router;