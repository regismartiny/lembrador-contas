var path = require('path');
var PDFParser = require('pdf2json');
var fs = require('fs');
var gmail = require( path.resolve( __dirname, "./gmail.js" ) );
var base64Util = require( path.resolve( __dirname, "./base64Util.js" ) );


const remetenteRGE = 'contadigital@cpfl.com.br';
const assuntoInicioRGE = 'Conta por e-mail RGE - Protocolo:';
const remetenteNubank = 'meajuda@nubank.com.br';
const assuntoNubank = 'A fatura do seu cartão Nubank está fechada';

async function getValueFromEmailNubank() {
    let message = await getMessage(remetenteNubank, assuntoNubank);
    let att = await getAttachmentFromMessage(message);
    let valor = await getValueFromAttachment(att);
    return valor;
}

async function getValueFromEmailRGE() {
    let message = await getMessage(remetenteRGE, assuntoInicioRGE);
    
    return 0;
}

async function getMessage(sender, subject) {
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`);
    
    if (!messages) return;

    console.log('MENSAGENS ENCONTRADAS');

    console.log(messages);

    if (!messages) return;

    var id = messages[0].id; //pega id da primeira mensagem

    message = await gmail.getMessage(id, null);

    if (!message) return;
    
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
    return att;
}

async function getValueFromAttachment(att) {
    let pdfData = await getPDFFromAttachment(att.attachment.data);
    let valor = getValueFromPDF(pdfData);
    return valor;
}

async function getPDFFromAttachment(attData) {
    var base64 = base64Util.fixBase64(attData);
    var binArray = base64Util.base64ToBin(base64);

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

function getValueFromPDF(pdfData) {
    var valor = decodeURIComponent(pdfData.formImage.Pages[0].Texts[3].R[0].T);
    return valor.slice(2, valor.length);
}

module.exports = { getValueFromEmailNubank, getValueFromEmailRGE, getMessage, getAttachmentFromMessage, getValueFromAttachment };