import gmail from './gmail.js';
import base64Util from './base64Util.js';

async function getMessagesByDateInterval(sender, subject, startDate, endDate) {
    console.log("getMessagesByDateInterval()")
    startDate = moment(startDate).format('YYYY/MM/DD')
    endDate = moment(endDate).format('YYYY/MM/DD')
    let query = `from:${sender} subject:"${subject}" after:${startDate} before:${endDate}`
    let messages = await gmail.findMessages(query)
    
    if (!messages || messages.length == 0) return false

    console.log(`Mensagens encontradas: ${messages.length}`)

    console.log(messages)

    let fullMessages = []

    for (const message of messages) {
        let fullMessage = await gmail.getMessage(message.id, null)

        if (!fullMessage) return

        fullMessages.push(fullMessage)

        console.log('Mensagem carregada: ', fullMessage.id)
    }

    console.log(`Mensagens carregadas: ${fullMessages.length}`)

    return fullMessages
}

async function getMessages(sender, subject) {
    console.log("getMessages()")
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`)
    
    if (!messages || messages.length == 0) return false

    console.log(`Mensagens encontradas: ${messages.length}`)

    console.log(messages)

    let fullMessages = []

    for (const message of messages) {
        let fullMessage = await gmail.getMessage(message.id, null)

        if (!fullMessage) return

        fullMessages.push(fullMessage)

        console.log('Mensagem carregada: ', fullMessage.id)
    }

    console.log(`Mensagens carregadas: ${fullMessages.length}`)

    return fullMessages
}

async function getLastMessage(sender, subject) {
    console.log("getLastMessage()")
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`)

    if (!messages || messages.length == 0) return false

    return await gmail.getMessage(messages[0].id, null)
}

async function getAttachmentFromMessage(message) {
    var headers = message.payload.headers;
    
    //escape double quotes
    for (let i = 0; i < headers.length; i++) {
        if (headers[i].name === 'To') {
            headers[i].value = headers[i].value.replace(/"/g, '\\"');
        }
    }

    message.payload.headers = headers;

    let attachments = await gmail.getAttachments(message);

    if (!attachments) return;

    console.log('ANEXOS ENCONTRADOS');
    var att = attachments[0];
    //fs.writeFile('anexo.pdf', JSON.stringify(att), () => console.log('Anexo salvo'));
    att.attachment.data = base64Util.fixBase64(att.attachment.data);
    return att;
}

async function getPDFFromAttachment(attData) {
    var binArray = base64Util.base64ToBin(attData);

    let pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));

    console.log('FAZENDO PARSE DO PDF');
    pdfParser.parseBuffer(binArray);
    let pdfData = await new Promise(function (resolve, reject) {
        pdfParser.on("pdfParser_dataReady", (pdfData) => {
            resolve(pdfData);
        });
    });
    return pdfData;
}

export default { getMessagesByDateInterval, getMessages, getLastMessage, getAttachmentFromMessage, getPDFFromAttachment };