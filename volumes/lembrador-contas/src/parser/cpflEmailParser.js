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

    let parsedData = []

    let message = messages[0] //use only the first message
    const info = await parse(message);
    if (!info) {
        return []
    }
    console.log("info", info);
    
    parsedData.push ({ 
        dueDate: info.vencimento, 
        value: info.valor 
    })

    return parsedData
}

function parse(msg) {
    try {
        console.log("parse()")
        let data = msg.payload.body.data;
        if (!data) return
        
        let base64str = base64Util.fixBase64(data);
        var text = base64Util.base64ToText(base64str);
        const dom = new jsdom.JSDOM(text);
        const elemValor = querySelectorIncludesText(dom, 'b', 'R$')
        const elemMesReferencia = elemValor.previousElementSibling.previousElementSibling
        const elemVencimento = elemMesReferencia.previousElementSibling.previousElementSibling
        const elemInstalacao = elemVencimento.previousElementSibling.previousElementSibling
        const valor = elemValor.innerHTML
        const mesReferencia = elemMesReferencia.innerHTML
        const vencimento = elemVencimento.innerHTML
        const instalacao = elemInstalacao.innerHTML
        return { instalacao, 
            vencimento : moment(vencimento, "DD/MM/YYYY").toDate(), 
            mesReferencia, 
            valor : Number.parseFloat(valor.replace(",",".").substring(3, valor.length-1)) 
        }
    } catch(e) {
        console.error("Failed to get info from HTML email", e);
    }
}

function querySelectorIncludesText(dom, selector, text) {
    return Array.from(dom.window.document.querySelectorAll(selector))
        .find(el => el.textContent.includes(text));
}

module.exports = { fetch }