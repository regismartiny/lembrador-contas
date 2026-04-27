import { google } from 'googleapis';
import googleAuth from './googleAuth.js';

function listMessages(auth, query) {
    return new Promise(function (resolve, reject) {

        console.log('query', query);
        const gmail = google.gmail({version: 'v1', auth});
        gmail.users.messages.list(query, function (err, res) {
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

function getMessage(auth, query) {
    return new Promise(function (resolve, reject) {
        const gmail = google.gmail({version: 'v1', auth});
        gmail.users.messages.get(query, function (err, res) {
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

function getAttachmentsSync(auth, query, message) {
    return new Promise(function (resolve, reject) {
        const gmail = google.gmail({version: 'v1', auth});
        const parts = message.payload.parts;
        const attachments = [];
        if (parts.length === 0) {
            let msg = 'Message has no attachment';
            console.log(msg);
            reject(msg);
        }
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
                const attachId = part.body.attachmentId;
                const request = gmail.users.messages.attachments.get({
                    'id': attachId,
                    'messageId': message.id,
                    'userId': query.userId,
                    'auth': auth
                }, function (err, res) {
                    if (err) {
                        let msg = 'Error getting attachments: ' + err;
                        console.log(msg);
                        reject(false);
                    }
                    const att = { filename: part.filename, mimeType: part.mimeType, attachment: res.data };
                    attachments.push(att);
                    if (i == parts.length) { //only last attachment
                        resolve(attachments);
                    }
                });
            }
        }
    });
}

export default {
    listUnreadMessages: async function () {
        try {
            const query = {
                userId: 'me',
                q: 'is:unread'
            }
            let auth = await googleAuth.authenticate();
            return await listMessages(auth, query);
        } catch(e) {
            console.log(e);
        }
    },
    getMessage: async function (id, headers) {
        try {
            const query = {
                userId: 'me',
                id
            }
            if (headers) {
                query.format = 'metadata';
                query.metadataHeaders = headers;
            }
            let auth = await googleAuth.authenticate();
            return await getMessage(auth, query);
        } catch(e) {
            console.log(e);
        }
    },
    findMessages: async function (q) {
        try {
            const query = {
                userId: 'me',
                q
            }
            let auth = await googleAuth.authenticate(); 
            return await listMessages(auth, query);
        } catch(e) {
            console.log(e);
        }
    },
    listMessagesFrom: async function (sender) {
        try {
            const query = {
                userId: 'me',
                q: 'from:' + sender
            }
            let auth = await googleAuth.authenticate();
            return await listMessages(auth, query);
        } catch(e) {
            console.log(e);
        }
    },
    getAttachments: async function (message) {
        try {
            const query = {
                userId: 'me'
            }
            let auth = await googleAuth.authenticate();
            return await getAttachmentsSync(auth, query, message);
        } catch(e) {
            console.log(e);
        }
    }
}