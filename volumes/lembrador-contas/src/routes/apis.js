var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");

/* GET APIList page. */
router.get('/list', function (req, res) {
    db.API.find({}).lean().exec(
        function (e, apis) {
            const apiList = apis.sort((a,b)=>a.name.localeCompare(b.name))
            res.render('api/apiList', { template, title: 'APIs', apiList, statusEnum: db.StatusEnum });
        });
});

/* GET apis JSON */
router.get('/listJSON', function (req, res) {
    db.API.find({}).lean().exec(
        function (e, apis) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(apis));
        });
});

/* GET New API page. */
router.get('/new', function (req, res) {
    res.render('api/editApi', { template, title: 'Cadastro de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum });
});

/* POST to Add API */
router.post('/add', function (req, res) {
    let name = req.body.name;
    let url = req.body.url;
    let method = req.body.method;
    let body = req.body.body;
    let value = req.body.value;

    let api = new db.API({ name, url, method, body, value });
    api.save(function (err) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("API saved");
            res.redirect("/apis/list");
        }
    });
});

/* GET Edit API page. */
router.get('/edit/:id', function (req, res) {
    let apiId = req.params.id;

    db.API.findById(apiId, function (err, api) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('api/editApi', { template, title: 'Edição de API', httpMethodEnum: db.HttpMethodEnum, statusEnum: db.StatusEnum, api });
        }
    });
});

/* POST to Update API */
router.post('/update', function (req, res) {
    let apiId = req.body.id;
    let name = req.body.name;
    let url = req.body.url;
    let method = req.body.method;
    let body = req.body.body;
    let value = req.body.value;
    let status = req.body.status;

    db.API.findOneAndUpdate({ _id: apiId }, { $set: { name,  url, method, body, value, status} }, { new: true }, function (err, api) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("API updated");
            res.redirect("/apis/list");
        }
    });
});

/* GET Remove API */
router.get('/remove/:id', function (req, res) {
    let apiId = req.params.id;

    db.API.findOneAndRemove({ _id: apiId }, function (err, api) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.redirect("/apis/list");
        }
    });
});

function handleError(error) {
    console.log("Error! " + error.message);
}


module.exports = router;