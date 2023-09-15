const express = require('express');
const router = express.Router();
//var template = require('./template');

/* GET home page. */
router.get('/', function (req, res) {
    // res.render('index', { template })
    res.redirect("/dashboard");
});

/* GET home page. */
router.get('/login', function (req, res) {
    res.redirect("/dashboard");
});

module.exports = router;
