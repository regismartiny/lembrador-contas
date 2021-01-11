var path = require('path');
var PDFParser = require('pdf2json');
var fs = require('fs');
var gmail = require( path.resolve( __dirname, "./gmail.js" ) );
var base64Util = require( path.resolve( __dirname, "./base64Util.js" ) );

async function getMessage(sender, subject) {
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`);
    
    if (messages.length == 0) return false;

    console.log('MENSAGENS ENCONTRADAS');

    //console.log(messages);

    var id = messages[0].id; //pega id da primeira mensagem

    message = await gmail.getMessage(id, null);

    if (!message) return;

    //console.log(message);
    
    console.log('MENSAGEM ENCONTRADA');

    console.log('messageId: ', message.id);

    return message;
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

module.exports = { getMessage, getAttachmentFromMessage, getPDFFromAttachment };