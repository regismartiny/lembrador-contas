import express from 'express';
import template from './template.js';
import db from '../db.js';
import gmail from '../util/gmail.js';
import emailUtils from '../util/emailUtils.js';
import vm from 'vm';
import cpflEmailParser from '../parser/cpflEmailParser.js';

const router = express.Router();

/* GET db.Email page. */
router.get('/list', async function (req, res, next) {
    try {
        const emails = await db.Email.find({}).lean()
        const emailList = emails.sort((a,b)=>a.address.localeCompare(b.address))
        res.render('email/emailList', { template, title: 'Emails', emailList, statusEnum: db.StatusEnum });
    } catch (err) {
        next(err)
    }
});

/* GET db.Email JSON */
router.get('/listJSON', async function (req, res, next) {
    try {
        const emails = await db.Email.find({}).lean()
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(emails));
    } catch (err) {
        next(err)
    }
});

/* GET New email page. */
router.get('/new', function (req, res) {
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum });
});

/* POST to Add Email */
router.post('/add', async function (req, res, next) {
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser

    try {
        const email = new db.Email({ address, subject, dataParser })
        await email.save()
        console.log("Email saved")
        res.redirect("/emails/list")
    } catch (err) {
        next(err)
    }
})

/* GET Edit Email page. */
router.get('/edit/:id', async function (req, res, next) {
    try {
        const email = await db.Email.findById(req.params.id)
        res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum, email })
    } catch (err) {
        next(err)
    }
})

/* POST to Update Email */
router.post('/update', async function (req, res, next) {
    let emailId = req.body.id
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser
    let status = req.body.status

    try {
        await db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address, subject, dataParser, status } }, { new: true })
        console.log("Email updated")
        res.redirect("/emails/list")
    } catch (err) {
        next(err)
    }
})

/* GET Remove Email */
router.get('/remove/:id', async function (req, res, next) {
    try {
        await db.Email.findOneAndDelete({ _id: req.params.id })
        res.redirect("/emails/list")
    } catch (err) {
        next(err)
    }
})

/* GET unread db.Email page. */
router.get('/unread', function (req, res) {
    gmail.listUnreadMessages(function (messages) {
        console.log('MENSAGENS BUSCADAS');
        res.render('email/unreadEmails', { title: 'Emails não lidos', messageList: messages });
    });
});

/* GET email page. */
router.get('/get/:id', function (req, res) {
    var id = req.params.id;

    gmail.getMessage(id, ['From', 'Date', 'Subject'], function (message) {
        console.log('MENSAGEM ENCONTRADA');

        var headers = message.payload.headers;

        for (let i = 0; i < headers.length; i++) {
            if (headers[i].name === 'To') {
                headers[i].value = headers[i].value.replace(/"/g, '\\"');
            }
        }

        message.payload.headers = headers;

        res.render('email/email', { title: 'Email', message: message });
    });
});

router.get('/test/:id', async function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId, async function (err, email) {
        if (err) {
            console.log("Error! " + err.message);
            return err;
        }
        const message = await emailUtils.getLastMessage(email.address, email.subject);

        let values = [];
        if (db.DataTypeEnum[email.dataType] === db.DataTypeEnum.PDF_ATTACHMENT) {
            getEmailPDFAttachmentData(values);
        } else if(db.DataTypeEnum[email.dataType] === db.DataTypeEnum.BODY) {
            const info = await cpflEmailParser.parseEmailData(message);
            values.push(info);
        }
        console.table(values);
        res.render('email/emailValue', { nome: email.address, valor: JSON.stringify(values) });
    });
});

async function getEmailPDFAttachmentData(value) {
    let att = await emailUtils.getAttachmentFromMessage(message);
    let pdfData = await emailUtils.getPDFFromAttachment(att.attachment.data);

    email.valueData.forEach(val => {
        let obj = { name: val.name, value: ''};
        let str = 'pdfData = JSON.parse(\'' + JSON.stringify(pdfData) + '\');' + 'decodeURIComponent(' + val.value + ')';
        obj.value = vm.runInNewContext(str);
        value.push(obj);
    })
}

export default router;
