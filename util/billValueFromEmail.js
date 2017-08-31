var gmail = require('../util/gmail.js');
var PDFParser = require('pdf2json');
var base64Util = require('../util/base64Util.js');
var fs = require('fs');

function getValueFromEmail() {

    gmail.listMessagesFrom('meajuda@nubank.com.br', function (messages) {
        console.log('MENSAGEM ENCONTRADA');

        var id = messages[0].id;

        gmail.getMessage(id, null, function (message) {
            console.log('MENSAGEM ENCONTRADA');

            console.log('messageId: ', message.id);

            var headers = message.payload.headers;

            //escape double quotes
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].name === 'To') {
                    headers[i].value = headers[i].value.replace(/"/g, '\\"');
                }
            }

            message.payload.headers = headers;


            gmail.getAttachments(message, function (attachments) {
                var att = attachments[0];

                var base64 = base64Util.fixBase64(att.attachment.data);
                var binArray = base64Util.base64ToBin(base64);

                att.attachment.data = base64;

                let pdfParser = new PDFParser();

                pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
                pdfParser.on("pdfParser_dataReady", pdfData => {
                    console.log(pdfData);
                    fs.writeFile("./pdf2json/test/F1040EZ.json", JSON.stringify(pdfData));

                    var valor = getValorFromPDF(pdfData);

                    callback(valor);
                });
                pdfParser.parseBuffer(binArray);
            });
        });
    });
}

module.exports = { getValueFromEmail };