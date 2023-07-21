var {google} = require('googleapis');
const googleAuth = require('./googleAuth')

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
            let auth = await googleAuth.authenticate();
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
            let auth = await googleAuth.authenticate();
            return await getMessage(auth);
        } catch(e) {
            console.log(e);
        }
    },
    findMessages: async function (q) {
        try {
            _query.q = q;
            let auth = await googleAuth.authenticate(); 
            return await listMessages(auth);
        } catch(e) {
            console.log(e);
        }
    },
    listMessagesFrom: async function (sender) {
        try {
            _query.q = 'from:' + sender;
            let auth = await googleAuth.authenticate();
            return await listMessages(auth);
        } catch(e) {
            console.log(e);
        }
    },
    getAttachments: async function (message) {
        try {
            _message = message;
            let auth = await googleAuth.authenticate();
            return await getAttachmentsSync(auth);
        } catch(e) {
            console.log(e);
        }
    }
}