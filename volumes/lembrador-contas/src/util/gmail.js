var fs = require('fs');
var readline = require('readline');
var {google} = require('googleapis');
//var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/gmail-nodejs-quickstart.json
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
//const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
//process.env.USERPROFILE) + '/.credentials/';
const CREDENTIALS_DIR = '.credentials/';
const CREDENTIALS_PATH = CREDENTIALS_DIR + 'credentials.json';
const TOKEN_PATH = CREDENTIALS_DIR + 'token.json';

var _message = null;

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
function authenticate(codeFromOauthRedirect) {
    return new Promise(function (resolve, reject) {
        // If modifying these scopes, delete token.json.
        // Load client secrets from a local file.
        fs.readFile(CREDENTIALS_PATH, (err, content) => {
            console.log(content);
            if (err) {
                let msg = 'Error loading client secret file: ' + err;
                console.log(msg);
                reject(msg);
            }
            // Authorize a client with credentials, then call the Gmail API.
            authorize(parseJSON(content), codeFromOauthRedirect)
                .then(response => resolve(response))
                .catch(err => {
                    let msg = 'Error authorizing: ' + err;
                    console.log(msg);
                    reject(msg);
                })
        });
    })
}

function parseJSON(content) {
    try {
       return JSON.parse(content)
    } catch(e) {
        let msg = 'Error parsing JSON: ' + err
        console.log(msg)
    }
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {} codeFromOauthRedirect
 */
function authorize(credentials, codeFromOauthRedirect) {
    return new Promise(function (resolve, reject) {
        const {client_secret, client_id, redirect_uris} = credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        // Check if we have previously stored a token.
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) {
                getNewToken(oAuth2Client, codeFromOauthRedirect)
                    .then((oAuth2Client) => resolve(oAuth2Client))
                    .catch((err) => reject(err));
            } else {
                oAuth2Client.setCredentials(JSON.parse(token));
                resolve(oAuth2Client);
            }
        });
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {} codeFromOauthRedirect
 *     client.
 */
function getNewToken(oAuth2Client, codeFromOauthRedirect) {
    return new Promise(function (resolve, reject) {
        var authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES
        });
        console.log('Authorize this app by visiting this url: ', authUrl);
        var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        if (codeFromOauthRedirect == null) {
        //     rl.question('Enter the code from that page here: ', function (code) {
                rl.close();
                reject("Authorization in process");
        //         saveToken(oAuth2Client, code)
        //             .then((response) => resolve(response))
        //     });
        } else {
            saveToken(oAuth2Client, codeFromOauthRedirect)
                .then((response) => resolve(response))
                .catch((err) => reject(err))
        }
    });
}  

function saveToken(oAuth2Client, code) {
    return new Promise(function (resolve, reject) {
        oAuth2Client.getToken(code, function (err, token) {
            if (err) {
                let msg = 'Error while trying to retrieve access token', err;
                console.log(msg);
                reject(msg);
            }
            oAuth2Client.credentials = token;
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            resolve(oAuth2Client);
        });
    });
}

function listMessages(auth) {
    return new Promise(function (resolve, reject) {

        console.log('query', _query);
        const gmail = google.gmail({version: 'v1', auth});
        gmail.users.messages.list(_query, function (err, res) {
            if (err) {
                let msg = 'The API returned an error: ' + err;
                console.log(msg);
                reject(msg);
            }
            if (res && res.data && res.data.messages && res.data.messages.length > 0) {
                resolve(res.data.messages);                
            } else {
                console.log('listMessages: No message found.');
                resolve([]);
            }
        });
    });
}

function getMessage(auth) {
    return new Promise(function (resolve, reject) {
        const gmail = google.gmail({version: 'v1', auth});
        gmail.users.messages.get(_query, function (err, res) {
            if (err) {
                let msg = 'The API returned an error: ' + err;
                console.log(msg);
                reject(msg);
            }
            if (res && res.data) {
                resolve(res.data);
            } else {
                let msg = 'getMessage: No message found.'
                console.log(msg);
                resolve(false);
            }
        });
    });
}

/**
 * Get Attachments from a given Message.
 *
 * @param  {String} userId User's email address. The special value 'me'
 * can be used to indicate the authenticated user.
 * @param  {String} messageId ID of Message with attachments.
 * @param  {Function} callback Function to call when the request is complete.
 */
function getAttachmentsSync(auth) {
    return new Promise(function (resolve, reject) {
        var message = _message;
        const gmail = google.gmail({version: 'v1', auth});
        var parts = message.payload.parts;
        var attachments = [];
        if (parts.length === 0) {
            let msg = 'Message has no attachment';
            console.log(msg);
            reject(msg);
        }
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
                var attachId = part.body.attachmentId;
                var request = gmail.users.messages.attachments.get({
                    'id': attachId,
                    'messageId': message.id,
                    'userId': _query.userId,
                    'auth': auth
                }, function (err, res) {
                    if (err) {
                        let msg = 'Error getting attachments: ' + err;
                        console.log(msg);
                        reject(false);
                    }
                    var att = { filename: part.filename, mimeType: part.mimeType, attachment: res.data };
                    attachments.push(att);
                    if (i == parts.length) { //only last attachment
                        resolve(attachments);
                    }
                });
            }
        }
    });
}




var _query = {
    userId: 'me'
}

module.exports = {
    listUnreadMessages: async function () {
        try {
            _query.q = 'is:unread';
            let auth = await authenticate();
            return await listMessages(auth);
        } catch(e) {
            console.log(e);
        }
    },
    getMessage: async function (id, headers) {
        try {
            _query.id = id;
            if (headers) {
                _query.format = 'metadata';
                _query.metadataHeaders = headers;
            }
            let auth = await authenticate();
            return await getMessage(auth);
        } catch(e) {
            console.log(e);
        }
    },
    findMessages: async function (q) {
        try {
            _query.q = q;
            let auth = await authenticate(); 
            return await listMessages(auth);
        } catch(e) {
            console.log(e);
        }
    },
    listMessagesFrom: async function (sender) {
        try {
            _query.q = 'from:' + sender;
            let auth = await authenticate();
            return await listMessages(auth);
        } catch(e) {
            console.log(e);
        }
    },
    getAttachments: async function (message) {
        try {
            _message = message;
            let auth = await authenticate();
            return await getAttachmentsSync(auth);
        } catch(e) {
            console.log(e);
        }
    },
    authenticate
}