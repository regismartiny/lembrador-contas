import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import logger from './logger.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_DIR = '.credentials/';
const CREDENTIALS_PATH = CREDENTIALS_DIR + 'oauth2.keys.json';
const TOKEN_PATH = CREDENTIALS_DIR + 'token.json';
const DEFAULT_REDIRECT_URL = 'http://localhost:9090/oauth2/callback';

let _pendingAuth = null;

function getRedirectUrl(keys) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URL || keys?.web?.redirect_uris?.[0] || DEFAULT_REDIRECT_URL;
}

function createOAuthClient(keys) {
    return new OAuth2Client(
        keys.web.client_id,
        keys.web.client_secret,
        getRedirectUrl(keys)
    );
}

/**
 * Start by acquiring a pre-authenticated OAuth2 client.
 */
async function authenticate() {
    const keys = await getKeysFile();
    const oAuth2Client = await getAuthenticatedClient(keys);

    oAuth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            storeTokens(tokens).catch(e => logger.error({ err: e }, 'Failed to store refreshed tokens'));
        }
        logger.info('Google OAuth tokens updated');
    });

    return oAuth2Client;
}

/**
 * Create a new OAuth2Client and load stored tokens or await Express OAuth2 callback.
 */
function getAuthenticatedClient(keys) {
    return new Promise((resolve, reject) => {
        const oAuth2Client = createOAuthClient(keys);

        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) {
                logger.info('No stored Google OAuth token found; starting authorization');
                const authorizeUrl = oAuth2Client.generateAuthUrl({
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: SCOPES,
                });
                _pendingAuth = { oAuth2Client, resolve, reject };
                logger.info({ authorizationUrl: authorizeUrl }, 'Open this URL to authorize Google account');
            } else {
                oAuth2Client.setCredentials(JSON.parse(token));
                resolve(oAuth2Client);
            }
        });
    });
}

/**
 * Handle the OAuth2 callback received by the Express route (/oauth2/callback).
 */
async function handleOAuthCallback(code) {
    if (!code) {
        throw new Error('Código de autorização OAuth ausente.');
    }

    const pending = _pendingAuth;
    let oAuth2Client = pending?.oAuth2Client;
    if (!oAuth2Client) {
        const keys = await getKeysFile();
        oAuth2Client = createOAuthClient(keys);
    }

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        await storeTokens(tokens);
        logger.info('Google OAuth authorization completed');

        if (pending) {
            _pendingAuth = null;
            pending.resolve(oAuth2Client);
        }

        return oAuth2Client;
    } catch (err) {
        if (pending) {
            _pendingAuth = null;
            pending.reject(err);
        }
        throw err;
    }
}

async function getKeysFile() {
    const keys = await fs.promises.readFile(CREDENTIALS_PATH);
    if (!keys) {
        logger.error({ credentialsPath: CREDENTIALS_PATH }, 'Google OAuth credentials file is empty');
    }
    return JSON.parse(keys);
}

function storeTokens(tokens) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
        fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
            if (err) {
                logger.error({ err, tokenPath: TOKEN_PATH }, 'Failed to store Google OAuth token');
                reject(err);
            } else {
                logger.info({ tokenPath: TOKEN_PATH }, 'Google OAuth token stored');
                resolve();
            }
        });
    });
}

export { authenticate, handleOAuthCallback, getRedirectUrl };

export default {
    authenticate: () => authenticate(),
    handleOAuthCallback: (code) => handleOAuthCallback(code),
    getRedirectUrl,
};
