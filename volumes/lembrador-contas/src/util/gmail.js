import { google } from 'googleapis';
import googleAuth from './googleAuth.js';
import logger from './logger.js';

function listMessages(auth, query) {
    return new Promise(function (resolve, reject) {

        const gmail = google.gmail({version: 'v1', auth});
        gmail.users.messages.list(query, function (err, res) {
            if (err) {
                return reject(err);
            }
            if (res && res.data && res.data.messages && res.data.messages.length > 0) {
                resolve(res.data.messages);                
            } else {
                logger.debug('Gmail message search returned no results');
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
                return reject(err);
            }
            if (res && res.data) {
                resolve(res.data);
            } else {
                logger.debug('Gmail message lookup returned no result');
                resolve(false);
            }
        });
    });
}

function getAttachmentsSync(auth, query, message) {
    const gmail = google.gmail({ version: 'v1', auth });
    const parts = message?.payload?.parts || [];
    const attachmentParts = parts.filter(
        part => part.filename && part.filename.length > 0 && part.body?.attachmentId
    );
    if (attachmentParts.length === 0) {
        const msg = 'Message has no attachment';
        logger.warn({ operation: 'getAttachments' }, msg);
        return Promise.reject(new Error(msg));
    }
    return Promise.all(attachmentParts.map(part => new Promise((resolve, reject) => {
        gmail.users.messages.attachments.get({
            id: part.body.attachmentId,
            messageId: message.id,
            userId: query.userId,
            auth,
        }, function (err, res) {
            if (err) {
                return reject(err);
            }
            resolve({ filename: part.filename, mimeType: part.mimeType, attachment: res.data });
        });
    })));
}

export default {
    listUnreadMessages: async function () {
        const query = {
            userId: 'me',
            q: 'is:unread'
        }
        let auth = await googleAuth.authenticate();
        return await listMessages(auth, query);
    },
    getMessage: async function (id, headers) {
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
    },
    findMessages: async function (q) {
        const query = {
            userId: 'me',
            q
        }
        let auth = await googleAuth.authenticate(); 
        return await listMessages(auth, query);
    },
    listMessagesFrom: async function (sender) {
        const query = {
            userId: 'me',
            q: 'from:' + sender
        }
        let auth = await googleAuth.authenticate();
        return await listMessages(auth, query);
    },
    getAttachments: async function (message) {
        const query = {
            userId: 'me'
        }
        let auth = await googleAuth.authenticate();
        return await getAttachmentsSync(auth, query, message);
    }
}