var path = require('path');
var PDFParser = require('pdf2json');
var fs = require('fs');
var gmail = require( path.resolve( __dirname, "./gmail.js" ) );
var base64Util = require( path.resolve( __dirname, "./base64Util.js" ) );


const remetenteBommtempo = 'avisos@bomtempo.com.br';
const assuntoInicioBommtempo = 'Boleto bancário [BOMMTEMPO INTERNET]';
const remetenteNubank = 'todomundo@nubank.com.br';
const assuntoNubank = 'A fatura do seu cartão Nubank está fechada';

async function getValueFromEmailNubank() {
    let message = await getMessage(remetenteNubank, assuntoNubank);
    if (!message) return;
    let att = await getAttachmentFromMessage(message);
    let pdfData = await getPDFFromAttachment(att.attachment.data);
    let valor = await getValueFromNubankPDF(pdfData);
    return valor;
}

async function getValueFromEmailBommtempo() {
    let message = await getMessage(remetenteBommtempo, assuntoInicioBommtempo);
    if (!message) return;
    let att = await getAttachmentFromMessage(message);
    let pdfData = await getPDFFromAttachment(att.attachment.data);
    let valor = await getValueFromBommtempoPDF(pdfData);
    return valor;
}

async function getMessageFromEmailNubank() {
    return await getMessage(remetenteNubank, assuntoNubank);
}

async function getMessage(sender, subject) {
    let messages = await gmail.findMessages(`from:${sender} subject:"${subject}"`);
    
    if (messages.length == 0) return false;

    console.log('MENSAGENS ENCONTRADAS');

    console.log(messages);

    var id = messages[0].id; //pega id da primeira mensagem

    message = await gmail.getMessage(id, null);

    if (!message) return;

    console.log(message);
    
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

//Nubank
function getValueFromNubankPDF(pdfData) {
    var valor = decodeURIComponent(pdfData.formImage.Pages[0].Texts[3].R[0].T);
    return valor.slice(2, valor.length);
}
//RGE
function getValueFromBommtempoPDF(pdfData) {
    const str = JSON.stringify(pdfData);
    //console.log(str);
    fs.writeFile('anexoBommtempo.json', JSON.stringify(str), () => console.log('JSON PDF Bommtempo salvo'));
    var vencimento = decodeURIComponent(pdfData.formImage.Pages[0].Texts[99].R[0].T); //117 99 e 142
    console.log('vencimento: ', vencimento);
    var codigoBarras = decodeURIComponent(pdfData.formImage.Pages[0].Texts[122].R[0].T); //121 e 122
    console.log('codigoBarras: ', codigoBarras);
    var valorTotal = decodeURIComponent(pdfData.formImage.Pages[0].Texts[111].R[0].T); //110 e 111
    console.log('valorTotal: ', valorTotal);
    return {codigoBarras, vencimento, valorTotal};
}

module.exports = { getValueFromEmailNubank, getValueFromEmailBommtempo, getMessageFromEmailNubank, getMessage, getAttachmentFromMessage, getPDFFromAttachment, getValueFromNubankPDF};