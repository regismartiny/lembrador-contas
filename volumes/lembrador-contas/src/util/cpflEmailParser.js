const jsdom = require("jsdom");
const path = require('path');
const base64Util = require(path.resolve(__dirname, "./base64Util.js"));

function getInfoFromHTMLEmail(msg) {
    try {
        let data = msg.payload.body.data;
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
        return { instalacao, vencimento, mesReferencia, valor }
    } catch(e) {
        console.error("Failed to get info from HTML", e);
    }
}

function querySelectorIncludesText(dom, selector, text){
    return Array.from(dom.window.document.querySelectorAll(selector))
        .find(el => el.textContent.includes(text));
  }


module.exports = { getInfoFromHTMLEmail }