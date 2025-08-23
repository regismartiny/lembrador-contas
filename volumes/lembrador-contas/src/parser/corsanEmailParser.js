const emailUtils = require('../util/emailUtils.js');
const base64Util = require("../util/base64Util.js");
const moment = require('moment');
const https = require('https');
const fs = require('fs');
const path = require('path');
const pdfBarcodeExtractor = require('../util/pdfBarcodeExtractor.js'); 

const PDF_LOCATION = '../../downloads/corsan.pdf'

async function fetch(address, subject, period) {
    try {
        console.log("address", address)
        console.log("subject", subject)
        console.log("period", period)
        let startDate = new Date(period.year, period.month, 1)
        let endDate = new Date(period.year, period.month, 31)

        const messages = 
            await emailUtils.getMessagesByDateInterval(address, subject, startDate, endDate);
        if (!messages) {
            console.error("No email found")
            return []
        }

        let message = messages[0] //use only the first message

        let parsedData = parse(message)

        console.log("parsedData", parsedData)

        let filePath = path.join(__dirname, PDF_LOCATION)
        
        await download(parsedData.linkPDF, filePath)
        
        const pdfInfo = await parsePDFFile(filePath)
        if (!pdfInfo) {
            return []
        }
        console.log("pdfInfo", pdfInfo)
        
        parsedData.value = pdfInfo.valor

        return [parsedData]
    } catch(e) {
        console.error("Error in fetch()", e)
    }
}

async function parsePDFFile(location) {
    console.log("parsePDFFile", location)

    const barcodes = await pdfBarcodeExtractor.extractBarcodeFromPDF(location)

    console.log("barcodes", barcodes)

    let barcode = barcodes[0]

    let cost = barcode.substring(10, 15)

    return { 
        valor: Number.parseFloat(cost)/100
    }
}

function download(url, dest) {
  console.log("Downloading", url, "to", dest)
  return new Promise((resolve, reject) => {
    var file = fs.createWriteStream(dest)
    https.get(url, function(response) {
        response.pipe(file)
        file.on('finish', function() {
            console.log("Download success")
            file.close(resolve)
        });
    }).on('error', function(err) {
        fs.unlinkSync(dest)
        console.log("Download failed")
        reject(err.message)
    })
  })
}

function parse(msg) {
    try {
        console.log("parse()")

        let snippet = msg.snippet;
        if (!snippet) throw "No snippet"
        
        const strCodImovel = "Número da ligação: "
        const posCodImovel = snippet.search(strCodImovel)
        const codImovelLength = 7
        const codImovelInicio = posCodImovel+strCodImovel.length
        const codImovel = snippet.substring(codImovelInicio, codImovelInicio+codImovelLength)
        
        const strVencimento = "Vencimento: "
        const posVencimento = snippet.search(strVencimento)
        const vencimentoLength = 10
        const vencimentoInicio = posVencimento+strVencimento.length
        const vencimento = snippet.substring(vencimentoInicio, vencimentoInicio+vencimentoLength)

        let emailBody = msg.payload.parts[0].body.data
 
        if (!emailBody) throw "No email body"
        
        let base64str = base64Util.fixBase64(emailBody)
        var text = base64Util.base64ToText(base64str)

        const posNF = text.search("&nf=");
        const posK = text.search("&k=");
        const nfNumber = text.substring(posNF+4, posK)
        const kNumber = text.substring(posK+3, posK+3+32)

        let linkSite = `https://aeservicosonline.com.br/fatura/download?u=corsanweb&nf=${nfNumber}&k=${kNumber}`

        var linkPDF = `https://aegea-api-manager-01.azure-api.net/external/agv/v1/conta/segunda-via?u=corsanweb&nf=${nfNumber}&k=${kNumber}`

        return { 
            dueDate : moment(vencimento, "DD/MM/YYYY").toDate(), 
            codImovel,
            linkPDF
        }
    } catch(e) {
        console.error("Failed to get info from email", e);
    }
}

module.exports = { fetch, parse }