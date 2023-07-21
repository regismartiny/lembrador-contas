const {OAuth2Client} = require('google-auth-library');
const fs = require('fs')
const http = require('http');
const url = require('url');
const open = require('open');
const destroyer = require('server-destroy');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_DIR = '.credentials/';
const CREDENTIALS_PATH = CREDENTIALS_DIR + 'oauth2.keys.json';
const TOKEN_PATH = CREDENTIALS_DIR + 'token.json';

/**
* Start by acquiring a pre-authenticated oAuth2 client.
*/
async function authenticate() {
    let keys = await fs.promises.readFile(CREDENTIALS_PATH)
    if (!keys) {
        console.error("Error loading credentials file")
    }

    const oAuth2Client = await getAuthenticatedClient(JSON.parse(keys));
    
    oAuth2Client.on('tokens', (tokens) => {
        console.log('tokens event')
        if (tokens.refresh_token) {
            // store the refresh_token in my database!
            console.log(tokens.refresh_token);
            storeTokens(tokens)
        }
        console.log(tokens.access_token);
    });
    
    // Make a simple request to the People API using our pre-authenticated client. The `request()` method
    // takes an GaxiosOptions object.  Visit https://github.com/JustinBeckwith/gaxios.
    const url = 'https://people.googleapis.com/v1/people/me?personFields=names';
    const res = await oAuth2Client.request({url});
    console.log(res.data);

    // After acquiring an access_token, you may want to check on the audience, expiration,
    // or original scopes requested.  You can do that with the `getTokenInfo` method.
    const tokenInfo = await oAuth2Client.getTokenInfo(
        oAuth2Client.credentials.access_token
    );
    console.log(tokenInfo);
}

/**
* Create a new OAuth2Client, and go through the OAuth2 content
* workflow.  Return the full client to the callback.
*/
function getAuthenticatedClient(keys) {
  return new Promise((resolve, reject) => {
    // create an oAuth client to authorize the API call.  Secrets are kept in a `keys.json` file,
    // which should be downloaded from the Google Developers Console.
    const oAuth2Client = new OAuth2Client(
      keys.web.client_id,
      keys.web.client_secret,
      keys.web.redirect_uris[0]
    );

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
            getNewToken(oAuth2Client)
                .then((oAuth2Client) => resolve(oAuth2Client))
                .catch((err) => reject(err));
        } else {
            oAuth2Client.setCredentials(JSON.parse(token));
            resolve(oAuth2Client);
        }
    });
  });
}

function getNewToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        // Generate the url that will be used for the consent dialog.
        const authorizeUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
    
        // Open an http server to accept the oauth callback. In this simple example, the
        // only request to our webserver is to /oauth2callback?code=<code>
        const server = http
            .createServer(async (req, res) => {
            try {
                if (req.url.indexOf('/oauth2callback') > -1) {
                // acquire the code from the querystring, and close the web server.
                const qs = new url.URL(req.url, 'http://localhost:3000')
                    .searchParams;
                const code = qs.get('code');
                console.log(`Code is ${code}`);
                res.end('Authentication successful! Please return to the console.');
                server.destroy();
    
                // Now that we have the code, use that to acquire tokens.
                const r = await oAuth2Client.getToken(code);
                // Make sure to set the credentials on the OAuth2 client.
                oAuth2Client.setCredentials(r.tokens);
                // Store the token to disk for later program executions
                storeTokens(r.tokens)
                console.info('Tokens acquired.');
                resolve(oAuth2Client);
                }
            } catch (e) {
                reject(e);
            }
            })
            .listen(3000, () => {
                console.log(authorizeUrl)
                //TODO: Reativar. Antivirus está bloqueando
                // open the browser to the authorize url to start the workflow
                // open(authorizeUrl, {wait: false}).then(cp => cp.unref());
            });
        destroyer(server);
    })
}

function storeTokens(tokens) {
    fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
    });
}

module.exports = { authenticate: () => authenticate().catch(console.error) }