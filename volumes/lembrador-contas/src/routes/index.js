const express = require('express');
const router = express.Router();
const template = require('./template');
const gmail = require('../util/gmail.js');

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', { template, title: 'Lembrador de Contas' });
});
router.get('/auth', function (req, res) {
    console.log("auth called")
    console.log(req.query.code)
    const authCode = req.query.code
    gmail.authenticate(authCode);
    res.redirect("/");
});

module.exports = router;
