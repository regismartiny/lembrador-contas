import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import template from './template.js';
import db from '../db.js';
import gmail from '../util/gmail.js';
import emailUtils from '../util/emailUtils.js';
import vm from 'vm';
import cpflEmailParser from '../parser/cpflEmailParser.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateObjectId } from '../middleware/validateObjectId.js';
import { validateBody } from '../middleware/validate.js';
import { DataParserEnum } from '../enums.js';

const router = express.Router();

/* GET db.Email page. */
router.get('/list', asyncHandler(async function (req, res) {
    const emails = await db.Email.find({}).lean()
    const emailList = emails.sort((a,b)=>a.address.localeCompare(b.address))
    res.render('email/emailList', { template, title: 'Emails', emailList, statusEnum: db.StatusEnum });
}));

/* GET db.Email JSON */
router.get('/listJSON', asyncHandler(async function (req, res) {
    const emails = await db.Email.find({}).lean()
    res.json(emails);
}));

/* GET New email page. */
router.get('/new', requireAdmin, function (req, res) {
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum });
});

/* POST to Add Email */
router.post('/add', requireAdmin, validateBody({
    address: { required: true, trim: true, message: 'Remetente é obrigatório.' },
    subject: { required: true, trim: true, message: 'Assunto é obrigatório.' },
    dataParser: { enum: Object.keys(DataParserEnum), enumMessage: 'Parser inválido.' }
}), asyncHandler(async function (req, res) {
    const address = req.body.address
    const subject = req.body.subject
    const dataParser = req.body.dataParser

    const email = new db.Email({ address, subject, dataParser })
    await email.save()
    logger.info("Email saved")
    res.redirect("/emails/list")
}));

/* GET Edit Email page. */
router.get('/edit/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    const email = await db.Email.findById(req.params.id)
    res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum, email })
}));

/* POST to Update Email */
router.post('/update', requireAdmin, validateBody({
    id: { required: true, message: 'ID é obrigatório.' },
    address: { required: true, trim: true, message: 'Remetente é obrigatório.' },
    subject: { required: true, trim: true, message: 'Assunto é obrigatório.' }
}), asyncHandler(async function (req, res) {
    const emailId = req.body.id
    const address = req.body.address
    const subject = req.body.subject
    const dataParser = req.body.dataParser
    const status = req.body.status

    await db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address, subject, dataParser, status } }, { new: true })
    logger.info("Email updated")
    res.redirect("/emails/list")
}));

/* POST Remove Email */
router.post('/remove/:id', requireAdmin, validateObjectId('id'), asyncHandler(async function (req, res) {
    await db.Email.findOneAndDelete({ _id: req.params.id })
    res.redirect("/emails/list")
}));

/* GET unread db.Email page. */
router.get('/unread', function (req, res) {
    gmail.listUnreadMessages(function (messages) {
        logger.info('MENSAGENS BUSCADAS');
        res.render('email/unreadEmails', { title: 'Emails não lidos', messageList: messages });
    });
});

/* GET email page. */
router.get('/get/:id', function (req, res) {
    const id = req.params.id;

    gmail.getMessage(id, ['From', 'Date', 'Subject'], function (message) {
        logger.info('MENSAGEM ENCONTRADA');

        const headers = message.payload.headers;

        for (let i = 0; i < headers.length; i++) {
            if (headers[i].name === 'To') {
                headers[i].value = headers[i].value.replace(/"/g, '\\"');
            }
        }

        message.payload.headers = headers;

        res.render('email/email', { title: 'Email', message: message });
    });
});

router.get('/test/:id', asyncHandler(async function (req, res) {
    let emailId = req.params.id;

    const email = await db.Email.findById(emailId);
    if (!email) {
        return res.status(404).send('Email not found');
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
}));

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
