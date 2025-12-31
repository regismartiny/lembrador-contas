import moment from "moment";
import emailUtils from "../util/emailUtils.js";

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
        let data = msg.snippet;
        if (!data) return
        
        const strCodImovel = "Código do Imóvel: "
        const posCodImovel = data.search(strCodImovel)
        const codImovelLength = 11
        const codImovelInicio = posCodImovel+strCodImovel.length
        const codImovel = data.substring(codImovelInicio, codImovelInicio+codImovelLength)
        
        const strVencimento = "Vencimento: "
        const posVencimento = data.search(strVencimento)
        const vencimentoLength = 10
        const vencimentoInicio = posVencimento+strVencimento.length
        const vencimento = data.substring(vencimentoInicio, vencimentoInicio+vencimentoLength)

        const strValor = "Valor: "
        const posValor = data.search(strValor)
        const valorLength = 5
        const valorInicio = posValor+strValor.length
        const valor = data.substring(valorInicio, valorInicio+valorLength)

        return { 
            vencimento : moment(vencimento, "DD/MM/YYYY").toDate(), 
            codImovel, 
            valor : Number.parseFloat(valor.replace(",",".")) 
        }
    } catch(e) {
        console.error("Failed to get info from email", e);
    }
}

export default { fetch }