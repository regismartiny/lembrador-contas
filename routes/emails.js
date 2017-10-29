var express = require('express');
var router = express.Router();
var PDFParser = require('pdf2json');
var fs = require('fs');
var template = require('./template');
var db = require("../db");
var gmail = require('../util/gmail.js');
var base64Util = require('../util/base64Util.js');
var emailUtils = require('../util/emailUtils.js');

/* GET db.Email page. */
router.get('/list', function (req, res) {
    db.Email.find({}).lean().exec(
        function (e, email) {
            res.render('email/emailList', { template, title: 'Lista de Emails', emailList: email });
        });
});

/* GET db.Email JSON */
router.get('/listJSON', function (req, res) {
    db.Email.find({}).lean().exec(
        function (e, email) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(email));
        });
});

/* GET New email page. */
router.get('/new', function (req, res) {
    res.render('email/newEmail', { template, title: 'Cadastro de Email' });
});

/* POST to Add Email */
router.post('/add', function (req, res) {
    let emailAddress = req.body.address;
    let emailSubject = req.body.subject;

    console.log(req.body);

    let email = new db.Email({ address: emailAddress, subject: emailSubject });
    email.save(function (err) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Email saved");
            res.redirect("/emails/list");
        }
    });
});

/* GET Edit Email page. */
router.get('/edit/:id', function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.render('email/editEmail', { template, title: 'Edição de Email', email });
        }
    });
});

/* POST to Update Email */
router.post('/update', function (req, res) {

    let emailId = req.body.id;
    let emailAddress = req.body.address;
    let emailSubject = req.body.subject;

    db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address: emailAddress,  subject: emailSubject} }, { new: true }, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        }
        else {
            console.log("Email updated");
            res.redirect("/emails/list");
        }
    });
});

/* GET Remove Email */
router.get('/remove/:id', function (req, res) {
    let emailId = req.params.id;

    db.Email.findOneAndRemove({ _id: emailId }, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        } else {
            res.redirect("/emails/list");
        }
    });
});



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

        //message.payload.body.data = 'BINARY - removed';

        var headers = message.payload.headers;
        //headers = [headers[12], headers[13], headers[14]];

        //escape double quotes
        for (let i = 0; i < headers.length; i++) {
            if (headers[i].name === 'To') {
                headers[i].value = headers[i].value.replace(/"/g, '\\"');
            }
        }

        message.payload.headers = headers;

        res.render('email/email', { title: 'Email', message: message });
    });
});

router.get('/testValue', async function (req, res) {
    let valor = await emailUtils.getValueFromEmailNubank();    
    res.render('email/emailValue', { nome: 'Nubank', valor });
});

/* GET email page. */
router.get('/test', async function (req, res) {
    const remetenteNubank = 'meajuda@nubank.com.br';
    const assuntoNubank = 'A fatura do seu cartão Nubank está fechada';
    let message = await emailUtils.getMessage(remetenteNubank, assuntoNubank);
    let att = await emailUtils.getAttachmentFromMessage(message);
    let valor = await emailUtils.getValueFromAttachment(att);
    res.render('email/emailTest', { title: 'Email', message: message, attachment: att, valor });
});



function handleError(error) {
    console.log("Error! " + error.message);
}

module.exports = router;
