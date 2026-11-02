import base64Util from './base64Util.js';
import logger from './logger.js';
import PDFParser from 'pdf2json';

async function loadGmail() {
    return (await import('./gmail.js')).default;
}

async function getMessagesByDateInterval(sender, subject, startDate, endDate) {
    startDate = formatDateYYYYMMDD(startDate)
    endDate = formatDateYYYYMMDD(endDate)
    let query = `from:${sender} subject:"${subject}" after:${startDate} before:${endDate}`
    const gmail = await loadGmail();
    let messages = await gmail.findMessages(query)
    
    if (!messages || messages.length == 0) return false
    logger.debug({ messageCount: messages.length }, 'Gmail messages matched date interval');

    let fullMessages = []

    for (const message of messages) {
        let fullMessage = await gmail.getMessage(message.id, null)

        if (!fullMessage) return

        fullMessages.push(fullMessage)
    }
    logger.debug({ messageCount: fullMessages.length }, 'Gmail messages loaded');

    return fullMessages
}

async function getMessages(sender, subject) {
    const gmail = await loadGmail();
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`)
    
    if (!messages || messages.length == 0) return false
    logger.debug({ messageCount: messages.length }, 'Gmail messages matched query');

    let fullMessages = []

    for (const message of messages) {
        let fullMessage = await gmail.getMessage(message.id, null)

        if (!fullMessage) return

        fullMessages.push(fullMessage)
    }

    logger.debug({ messageCount: fullMessages.length }, 'Gmail messages loaded');

    return fullMessages
}

async function getLastMessage(sender, subject) {
    const gmail = await loadGmail();
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`)

    if (!messages || messages.length == 0) return false

    return await gmail.getMessage(messages[0].id, null)
}

async function getAttachmentFromMessage(message) {
    const headers = message.payload.headers;
    
    //escape double quotes
    for (let i = 0; i < headers.length; i++) {
        if (headers[i].name === 'To') {
            headers[i].value = headers[i].value.replace(/"/g, '\\"');
        }
    }

    message.payload.headers = headers;

    const gmail = await loadGmail();
    let attachments = await gmail.getAttachments(message);

    if (!attachments) return;

    logger.debug({ attachmentCount: attachments.length }, 'Gmail attachments found');
    const att = attachments[0];
    att.attachment.data = base64Util.fixBase64(att.attachment.data);
    return att;
}

async function getPDFFromAttachment(attData) {
    const binArray = base64Util.base64ToBin(attData);

    const savedWorker = globalThis.Worker;
    globalThis.Worker = undefined;
    try {
        let pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataError", errData => logger.error({ err: errData.parserError }, 'Failed to parse email PDF'));

        logger.debug('Parsing email PDF attachment');
        pdfParser.parseBuffer(binArray);
        let pdfData = await new Promise(function (resolve, reject) {
            pdfParser.on("pdfParser_dataReady", (pdfData) => {
                resolve(pdfData);
            });
        });
        return pdfData;
    } finally {
        globalThis.Worker = savedWorker;
    }
}

function formatDateYYYYMMDD(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}/${m}/${d}`
}

export default { getMessagesByDateInterval, getMessages, getLastMessage, getAttachmentFromMessage, getPDFFromAttachment };