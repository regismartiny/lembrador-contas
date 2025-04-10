const jsdom = require("jsdom");
const base64Util = require("../util/base64Util.js");
const emailUtils = require('../util/emailUtils.js');
const moment = require('moment');

async function fetch(address, subject, period) {
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
    const parsedData = await parseEmailData(message);
    if (!parsedData) {
        return []
    }
    console.log("parsedData", parsedData);
    
    let response = { 
        dueDate: parsedData.vencimento, 
        value: parsedData.valor 
    }

    return [response]
}

function parseEmailData(msg) {
    try {
        console.log("parseEmailData()")
        let data = msg.payload.body.data
        if (!data) return
        
        let base64str = base64Util.fixBase64(data)
        var text = base64Util.base64ToText(base64str)
        
        const dom = new jsdom.JSDOM(text)

        const elemValor = querySelectorIncludesText(dom, 'span', 'R$')
        const elemVencimento = elemValor.parentElement.parentElement.previousElementSibling.childNodes[1].childNodes[1]
        const elemMesReferencia = elemValor.parentElement.parentElement.previousElementSibling.previousElementSibling.childNodes[1].childNodes[1]
        const elemInstalacao = elemValor.parentElement.parentElement.previousElementSibling.previousElementSibling.previousElementSibling.childNodes[1].childNodes[1]
        const valor = elemValor.innerHTML.substring(4)
        const vencimento = elemVencimento.innerHTML.substring(4)
        const mesReferencia = elemMesReferencia.innerHTML.substring(4)
        const instalacao = elemInstalacao.innerHTML.substring(4)
        return { instalacao, 
            vencimento : moment(vencimento, "DD/MM/YYYY").toDate(), 
            mesReferencia, 
            valor : Number.parseFloat(valor.replace(",",".").substring(3, valor.length-1)) 
        }
    } catch(e) {
        console.error("Failed to get info from HTML email", e)
    }
}

function querySelectorIncludesText(dom, selector, text) {
    return Array.from(dom.window.document.querySelectorAll(selector))
        .find(el => el.textContent.includes(text));
}

module.exports = { fetch }