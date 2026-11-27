import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import favicon from 'serve-favicon';
import logger from './util/logger.js';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import db from './db.js';
import index from './routes/index.js';
import dashboard from './routes/dashboard.js';
import users from './routes/users.js';
import bills from './routes/bills.js';
import emails from './routes/emails.js';
import tables from './routes/tables.js';
import apis from './routes/apis.js';
import notifications from './routes/notifications.js';
import backup from './routes/backup.js';
import reports from './routes/reports.js';
import auth from './routes/auth.js';
import apiV1 from './routes/apiV1.js';
import { requireAuth } from './middleware/auth.js';
import { cloudflareAuth } from './middleware/cfAccess.js';
import { doubleCsrfProtectionWithSkip as doubleCsrfProtection, generateToken } from './middleware/csrf.js';
import { cspNonceMiddleware } from './middleware/cspNonce.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const spaDistDir = path.resolve(__dirname, '..', 'dist', 'client');
const spaIndexFile = path.join(spaDistDir, 'index.html');

const app = express();

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

// CSP nonce middleware — must run before helmet
app.use(cspNonceMiddleware);

// Security headers with CSP (supports SPA bundles + inline PDF preview iframes)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            'img-src': ["'self'", 'data:', 'blob:'],
            'connect-src': ["'self'"],
            'frame-src': ["'self'", 'blob:'],
            'object-src': ["'self'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'self'"],
        },
    },
}));

// view engine setup (retained for legacy route compatibility)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(function requestLogger(req, res, next) {
    const startTime = process.hrtime.bigint();
    res.on('finish', () => {
        const responseTimeMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        logger.info({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTimeMs: Number(responseTimeMs.toFixed(2)),
        }, 'HTTP request completed');
    });
    next();
});

app.use(limiter);

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Static assets served before auth so SPA bundles, CSS/JS, manifest & SW are always reachable
app.use(express.static(spaDistDir, { index: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/jquery', express.static(__dirname + './../node_modules/jquery/dist/'));
app.use('/jquery-mask', express.static(__dirname + './../node_modules/jquery-mask-plugin/dist/'));
app.use('/popperjs', express.static(__dirname + './../node_modules/popper.js/dist/umd/'));
app.use('/bootstrap', express.static(__dirname + './../node_modules/bootstrap/dist/'));

// Session — must come after static assets but before any authenticated routes
const sessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
};

if (process.env.NODE_ENV !== 'test' && typeof db.Mongoose?.connection?.asPromise === 'function' && process.env.MONGODB_IP) {
    sessionOptions.store = MongoStore.create({
        clientPromise: db.Mongoose.connection.asPromise().then(conn => conn.getClient()),
    });
}

app.use(session(sessionOptions));

// Health check — public, used by Docker and load balancers
app.get('/health', function (req, res) {
    if (db.Mongoose?.connection?.readyState !== 1) {
        return res.status(503).json({ status: 'error', db: 'disconnected' });
    }
    return res.status(200).json({ status: 'ok' });
});

// Cloudflare Access — verify JWT and auto-authenticate if present
app.use(cloudflareAuth);

// CSRF protection
app.use(doubleCsrfProtection);

// Expose session email and CSRF token
app.use(function (req, res, next) {
    res.locals.currentUserEmail = req.session.email || '';
    res.locals.csrfToken = generateToken(req, res);
    next();
});

// Modern JSON + SSE API (manages its own JSON 401/403 auth & public /api/session)
app.use('/api', apiV1);

// Auth routes (login/logout) are public
app.use('/', auth);

// All routes below require a valid session
app.use(requireAuth);

// Dedicated SPA routes for the React 19 Household Wallet UI
const serveSpa = function (_req, res, next) {
    if (fs.existsSync(spaIndexFile)) {
        return res.sendFile(spaIndexFile);
    }
    next();
};

app.get(['/carteira', '/rateio', '/catalogo', '/fontes', '/relatorios', '/ajustes', '/app', '/app/*'], serveSpa);

app.use('/', index);
app.use('/dashboard', dashboard);
app.use('/users', users);
app.use('/bills', bills);
app.use('/emails', emails);
app.use('/tables', tables);
app.use('/apis', apis);
app.use('/notifications', notifications);
app.use('/backup', backup);
app.use('/reports', reports);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || 500;
    const log = statusCode >= 500 ? logger.error : logger.warn;
    log.call(logger, {
        err: { type: err.name, message: err.message, stack: err.stack },
        method: req.method,
        path: req.path,
        statusCode,
    }, 'HTTP request failed');

    if (req.path.startsWith('/api/')) {
        return res.status(statusCode).json({ error: err.message || 'Erro interno no servidor.' });
    }

    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    res.status(statusCode);
    res.render('error');
});

export default app;
