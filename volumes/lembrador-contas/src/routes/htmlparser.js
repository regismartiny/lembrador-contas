import express from 'express';
import { parseHTML } from '../parser/cpflEmailParser.js';

const router = express.Router();


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

export default router;