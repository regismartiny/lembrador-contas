import express from 'express';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';

const router = express.Router();

const APP_PASSWORD = process.env.APP_PASSWORD;

if (!APP_PASSWORD) {
    logger.warn('WARNING: APP_PASSWORD env var is not set. Authentication is disabled — all routes are publicly accessible.');
}

router.get('/login', function (req, res) {
    if (!APP_PASSWORD || req.session.authenticated) {
        return res.redirect('/')
    }
    res.render('auth/login', { title: 'Login', error: null, template })
})

router.post('/login', async function (req, res) {
    const { email, password } = req.body

    const user = await db.User.findOne({ email }).lean()
    if (!user) {
        return res.render('auth/login', { title: 'Login', error: 'E-mail não encontrado.', template })
    }

    if (password !== APP_PASSWORD) {
        return res.render('auth/login', { title: 'Login', error: 'Senha incorreta.', template })
    }

    req.session.authenticated = true
    req.session.email = email
    delete req.session.skipCfAuth;
    const redirectTo = req.session.returnTo || '/'
    delete req.session.returnTo
    req.session.save(function (err) {
        if (err) return res.redirect('/')
        res.redirect(redirectTo)
    })
})

router.get('/logout', function (req, res) {
    req.session.authenticated = false;
    req.session.skipCfAuth = true;
    delete req.session.email;
    req.session.save(() => res.redirect('/login'));
})

export default router;
