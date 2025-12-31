import express from 'express';

const router = express.Router();


/* GET home page. */
router.get('/', function (req, res) {
    // res.render('index', { template })
    res.redirect("/dashboard");
});

/* GET home page. */
router.get('/login', function (req, res) {
    res.redirect("/dashboard");
});

export default router;
