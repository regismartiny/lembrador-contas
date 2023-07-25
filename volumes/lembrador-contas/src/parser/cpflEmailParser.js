const jsdom = require("jsdom");
const base64Util = require("../util/base64Util.js");
const moment = require('moment');
const emailUtils = require('../util/emailUtils.js');

async function fetch(address, subject) {
    console.log("address:", address, "subject:", subject)
    const message = await emailUtils.getLastMessage(address, subject);
    if (!message) {
        console.error("No email found", address)
        return
    }

    const info = await parse(message);
    if (!info) {
        return
    }
    console.log("info", info);
    
    return { 
        dueDate: info.vencimento, 
        value: info.valor 
    }
}

function parse(msg) {
    try {
        console.log("getInfoFromHTMLEmail()")
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