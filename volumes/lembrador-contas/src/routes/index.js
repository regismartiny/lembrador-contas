import express from 'express';

const router = express.Router();

/* GET home page — opens the Household Wallet SPA. */
router.get('/', function (_req, res) {
    res.redirect('/carteira');
});

router.get('/login', function (_req, res) {
    res.redirect('/carteira');
});

export default router;
