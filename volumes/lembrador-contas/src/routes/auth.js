import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import googleAuth from '../util/googleAuth.js';

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

if (!process.env.APP_PASSWORD) {
    logger.warn('WARNING: APP_PASSWORD env var is not set. Authentication is disabled — all routes are publicly accessible.');
}

router.get('/login', function (req, res) {
    if (!process.env.APP_PASSWORD || req.session.authenticated) {
        return res.redirect('/')
    }
    res.render('auth/login', { title: 'Login', error: null, template })
})

router.post('/login', loginLimiter, asyncHandler(async function (req, res) {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
        return res.redirect('/')
    }

    const { email, password } = req.body

    const user = await db.User.findOne({ email }).lean()
    const passwordBuf = Buffer.from(password || '', 'utf8');
    const expectedBuf = Buffer.from(appPassword, 'utf8');
    const passwordValid = passwordBuf.length === expectedBuf.length && crypto.timingSafeEqual(passwordBuf, expectedBuf);
    if (!user || !passwordValid) {
        return res.render('auth/login', { title: 'Login', error: 'E-mail ou senha inválidos.', template })
    }

    const rawReturnTo = req.session.returnTo;
    const redirectTo = (typeof rawReturnTo === 'string' && /^\/(?!\/)/.test(rawReturnTo)) ? rawReturnTo : '/';

    // Clear any previous Cloudflare authentication
    req.session.regenerate(function (err) {
        if (err) return res.redirect('/')
        
        req.session.authenticated = true
        req.session.email = email
        req.session.loginMethod = 'explicit' // Mark as explicit login, not Cloudflare
        req.session.save(function (err) {
            if (err) return res.redirect('/')
            res.redirect(redirectTo)
        })
    })
}))

router.post('/logout', function (req, res) {
    req.session.authenticated = false;
    delete req.session.email;
    delete req.session.loginMethod;
    req.session.save(() => res.redirect('/login'));
})

router.get('/oauth2/callback', requireAdmin, asyncHandler(async function (req, res) {
    const code = req.query.code;
    if (!code || typeof code !== 'string') {
        return res.status(400).send('Código de autorização OAuth ausente.');
    }
    await googleAuth.handleOAuthCallback(code);
    res.status(200).send('Autenticação Google OAuth concluída com sucesso! Você pode fechar esta aba.');
}));

export default router;
