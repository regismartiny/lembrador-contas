var express = require('express');
var router = express.Router();
var template = require('./template');

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', { template, title: 'Lembrador de Contas' });
});

module.exports = router;
