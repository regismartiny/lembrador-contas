import base64Util from '../util/base64Util.js';
import emailUtils from '../util/emailUtils.js';
import logger from '../util/logger.js';
import jsdom from 'jsdom';

export async function fetch(address, subject, period) {
    let startDate = new Date(period.year, period.month, 1)
    let endDate = new Date(period.year, period.month, 31)

    const messages = 
        await emailUtils.getMessagesByDateInterval(address, subject, startDate, endDate);
    if (!messages) {
        logger.warn({ year: period.year, month: period.month + 1 }, 'No CPFL email found for period');
        return []
    }

    let message = messages[0] //use only the first message
        logger.debug({ messageCount: messages.length }, 'CPFL emails found');
    const parsedData = await parseEmailData(message);
    if (!parsedData) {
        return []
    }
    
    let response = { 
        dueDate: parsedData.vencimento, 
        value: parsedData.valor 
    }

    return [response]
}

export function parseEmailData(msg) {
    try {
        let data = msg.payload.body.data
        if (!data) return
        
        let base64str = base64Util.fixBase64(data)
        const text = base64Util.base64ToText(base64str)
        
        return parseHTML(text)
    } catch(e) {
        logger.error({ err: e }, 'Failed to parse CPFL email HTML');
        return null
    }
}

export function parseHTML(text) {
    const dom = new jsdom.JSDOM(text)
    const elemValor = querySelectorIncludesText(dom, 'span', 'R$')
    const elemVencimento = elemValor.parentElement.parentElement.previousElementSibling.childNodes[0].childNodes[1]
    const elemMesReferencia = elemValor.parentElement.parentElement.previousElementSibling.previousElementSibling.childNodes[0].childNodes[1]
    const elemInstalacao = elemValor.parentElement.parentElement.previousElementSibling.previousElementSibling.previousElementSibling.childNodes[0].childNodes[1]
    const valor = elemValor.innerHTML.substring(elemValor.innerHTML.indexOf('R$'))
    const vencimento = elemVencimento.innerHTML.substring(4)
    const mesReferencia = elemMesReferencia.innerHTML.substring(4)
    const instalacao = elemInstalacao.innerHTML.substring(4)
    return { 
        instalacao, 
        vencimento : parseDDMMYYYY(vencimento),
        mesReferencia, 
        valor : Number.parseFloat(valor.replace(",",".").substring(3, valor.length-1)) 
    }
}

function parseDDMMYYYY(str) {
    const [day, month, year] = str.split('/').map(Number)
    return new Date(year, month - 1, day)
}

function querySelectorIncludesText(dom, selector, text) {
    return Array.from(dom.window.document.querySelectorAll(selector))
        .find(el => el.textContent.includes(text));
}

export default { fetch, parseHTML, parseEmailData }