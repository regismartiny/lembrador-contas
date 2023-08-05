const express = require('express');
const router = express.Router();
const gmail = require('../util/gmail.js');
var template = require('./template');

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', { template })
});

/* GET home page. */
router.get('/login', function (req, res) {
    res.redirect("/dashboard");
});

router.get('/oauthcallback', function (req, res) {
    console.log("oauthcallback called")
    console.log(req.query.code)
    const authCode = req.query.code
    gmail.authenticate(authCode);
    res.redirect("/");
});

module.exports = router;
