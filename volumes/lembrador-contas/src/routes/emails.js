const express = require('express')
const router = express.Router()
const template = require('./template')
const db = require("../db")
const gmail = require('../util/gmail.js')
const emailUtils = require('../util/emailUtils.js')
const vm = require('vm')
const cpflEmailParser = require("../parser/cpflEmailParser")

/* GET db.Email page. */
router.get('/list', async function (req, res) {
    try {
        let emails = await db.Email.find({}).lean().exec()
        const emailList = emails.sort((a,b)=>a.address.localeCompare(b.address))
        res.render('email/emailList', { template, title: 'Emails', emailList, statusEnum: db.StatusEnum })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET db.Email JSON */
router.get('/listJSON', async function (req, res) {
    try {
        let email = await db.Email.find({}).lean().exec()
        res.setHeader('Content-Type', 'application/json')
        res.send(JSON.stringify(email))
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET New email page. */
router.get('/new', function (req, res) {
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum })
})

/* POST to Add Email */
router.post('/add', async function (req, res) {
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser

    let email = new db.Email({ address, subject, dataParser })
    try {
        await email.save()
        console.log("Email saved")
        res.redirect("/emails/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Edit Email page. */
router.get('/edit/:id', async function (req, res) {
    let emailId = req.params.id

    try {
        let email = await db.Email.findById(emailId)
        res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum, email })
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* POST to Update Email */
router.post('/update', async function (req, res) {

    let emailId = req.body.id
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser
    let status = req.body.status

    try {
        await db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address,  subject, dataParser, status} }, { new: true })
        console.log("Email updated")
        res.redirect("/emails/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET Remove Email */
router.get('/remove/:id', async function (req, res) {
    let emailId = req.params.id

    try {
        await db.Email.findOneAndRemove({ _id: emailId })
        res.redirect("/emails/list")
    } catch(err) {
        handleError(err, res)
        return err
    }
})

/* GET unread db.Email page. */
router.get('/unread', function (req, res) {

    gmail.listUnreadMessages(function (messages) {
        console.log('MENSAGENS BUSCADAS')
        res.render('email/unreadEmails', { title: 'Emails não lidos', messageList: messages })
    })

})

/* GET email page. */
router.get('/get/:id', function (req, res) {
    var id = req.params.id

    gmail.getMessage(id, ['From', 'Date', 'Subject'], function (message) {
        console.log('MENSAGEM ENCONTRADA')

        //message.payload.body.data = 'BINARY - removed'

        var headers = message.payload.headers
        //headers = [headers[12], headers[13], headers[14]]

        //escape double quotes
        for (i = 0; i < headers.length; i++) {
            if (headers[i].name === 'To') {
                headers[i].value = headers[i].value.replace(/"/g, '\\"')
            }
        }

        message.payload.headers = headers

        res.render('email/email', { title: 'Email', message: message })
    })
})

router.get('/test/:id', async function (req, res) {
    let emailId = req.params.id

    try {
        let email = await db.Email.findById(emailId)
        const message = await emailUtils.getLastMessage(email.address, email.subject)
        
        let values = []
        if (db.DataTypeEnum[email.dataType] === db.DataTypeEnum.PDF_ATTACHMENT) {
            getEmailPDFAttachmentData(values)
        } else if(db.DataTypeEnum[email.dataType] === db.DataTypeEnum.BODY) {
            const info = await cpflEmailParser.getInfoFromHTMLEmail(message)
            values.push(info)
        }
        console.table(values)
        res.render('email/emailValue', { nome: email.address, valor: JSON.stringify(values) })

    } catch(err) {
        handleError(err, res)
        return err
    }
})

async function getEmailPDFAttachmentData(value) {
    let att = await emailUtils.getAttachmentFromMessage(message)
    let pdfData = await emailUtils.getPDFFromAttachment(att.attachment.data)

    email.valueData.forEach(val => {
        let obj = { name: val.name, value: ''}
        let str = 'pdfData = JSON.parse(\'' + JSON.stringify(pdfData) + '\')' + 'decodeURIComponent(' + val.value + ')'
        obj.value = vm.runInNewContext(str)
        value.push(obj)
    })
}

function handleError(error, res) {
    console.log("Error! " + error.message)
    res.render('error', { message: '', error: error})
}

module.exports = router
