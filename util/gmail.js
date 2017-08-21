var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/gmail-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'gmail-nodejs-quickstart.json';

var _callback = null;
var _message = null;

function doIt(callback) {
    // Load client secrets from a local file.
    fs.readFile('client_secret.json', function processClientSecrets(err, content) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return;
        }
        // Authorize a client with the loaded credentials, then call the
        // Gmail API.
        authorize(JSON.parse(content), callback);
    });
}



/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function (err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function (code) {
        rl.close();
        oauth2Client.getToken(code, function (err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

function listMessages(auth) {
    var gmail = google.gmail('v1');
    var q = _query;
    q.auth = auth;
    gmail.users.messages.list(q, function (err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var messages = response.messages;
        if (messages.length == 0) {
            console.log('No messages found.');
        } else {
            _callback(messages);
        }
    });
}

function getMessage(auth) {
    var gmail = google.gmail('v1');
    var q = _query;
    q.auth = auth;
    gmail.users.messages.get(q, function (err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var message = response;
        if (!message) {
            console.log('No message found.');
        } else {
            _callback(message);
        }
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
    var message = _message;
    var callback = _callback;
    var gmail = google.gmail('v1');
    var parts = message.payload.parts;
    var attachments = [];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
            var attachId = part.body.attachmentId;
            console.log('attachId: ', attachId);
            var request = gmail.users.messages.attachments.get({
                'id': attachId,
                'messageId': message.id,
                'userId': _query.userId,
                'auth': auth
            }, function (err, response) {
                var att = { filename: part.filename, mimeType: part.mimeType, attachment: response };
                attachments.push(att);
                if (i == parts.length) {
                    callback(attachments);
                }
            });
        }
    }
}




var _query = {
    userId: 'me'
}

module.exports = {
    listUnreadMessages: function (callback) {
        _callback = callback;
        _query.q = 'is:unread';
        doIt(listMessages);
    },
    getMessage: function (id, headers, callback) {
        _callback = callback;
        _query.id = id;
        if (headers) {
            _query.format = 'metadata';
            _query.metadataHeaders = headers;
        }
        doIt(getMessage);
    },
    listMessagesFrom: function (sender, callback) {
        _query.q = 'from:' + sender;
        _callback = callback;
        doIt(listMessages);
    },
    getAttachments: function (message, callback) {
        _message = message;
        _callback = callback;
        doIt(getAttachmentsSync);
    }
}