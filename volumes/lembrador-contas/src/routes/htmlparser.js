const express = require('express');
const router = express.Router();
const { parseHTML } = require('../parser/cpflEmailParser');

router.get('/', (req, res) => {
    res.render('htmlparser/input', { result: null, html: '' });
});

router.post('/', (req, res) => {
    const html = req.body.html || '';
    let result = null;
    try {
        result = parseHTML(html);
    } catch (e) {
        result = { error: e.message };
    }
    res.render('htmlparser/input', { result, html });
});

module.exports = router;