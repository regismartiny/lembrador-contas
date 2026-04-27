import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import logger from '../util/logger.js';
import template from './template.js';
import db from '../db.js';

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

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

router.post('/login', loginLimiter, async function (req, res) {
    const { email, password } = req.body

    const user = await db.User.findOne({ email }).lean()
    if (!user) {
        return res.render('auth/login', { title: 'Login', error: 'E-mail não encontrado.', template })
    }

    const passwordBuf = Buffer.from(password || '', 'utf8');
    const expectedBuf = Buffer.from(APP_PASSWORD, 'utf8');
    if (passwordBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(passwordBuf, expectedBuf)) {
        return res.render('auth/login', { title: 'Login', error: 'Senha incorreta.', template })
    }

    // Clear any previous Cloudflare authentication
    req.session.regenerate(function (err) {
        if (err) return res.redirect('/')
        
        req.session.authenticated = true
        req.session.email = email
        req.session.loginMethod = 'explicit' // Mark as explicit login, not Cloudflare
        const redirectTo = req.session.returnTo || '/'
        delete req.session.returnTo
        req.session.save(function (err) {
            if (err) return res.redirect('/')
            res.redirect(redirectTo)
        })
    })
})

router.get('/logout', function (req, res) {
    req.session.authenticated = false;
    delete req.session.email;
    delete req.session.loginMethod;
    req.session.save(() => res.redirect('/login'));
})

export default router;
