var express = require('express');
var router = express.Router();
var gmail = require('../util/gmail.js');
var PDFParser = require('pdf2json');
var base64Util = require('../util/base64Util.js');
var fs = require('fs');
var template = require('./template');
var db = require("../db");

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

    console.log(req.body);

    let email = new db.Email({ address: emailAddress });
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

    db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address: emailAddress } }, { new: true }, function (err, email) {
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

/* GET email page. */
router.get('/test', function (req, res) {

    gmail.listMessagesFrom('meajuda@nubank.com.br').then((messages)=>{
        console.log('MENSAGEM ENCONTRADA');

        var id = messages[0].id;

        gmail.getMessage(id, null, function (message) {
            console.log('MENSAGEM ENCONTRADA');

            console.log('messageId: ', message.id);

            var headers = message.payload.headers;

            //escape double quotes
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].name === 'To') {
                    headers[i].value = headers[i].value.replace(/"/g, '\\"');
                }
            }

            message.payload.headers = headers;


            gmail.getAttachments(message, function (attachments) {
                var att = attachments[0];

                var base64 = base64Util.fixBase64(att.attachment.data);
                var binArray = base64Util.base64ToBin(base64);

                att.attachment.data = base64;

                let pdfParser = new PDFParser();

                pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
                pdfParser.on("pdfParser_dataReady", pdfData => {
                    console.log(pdfData);
                    fs.writeFile("./pdf2json/test/F1040EZ.json", JSON.stringify(pdfData));

                    var valor = getValorFromPDF(pdfData);

                    res.render('email/email', { title: 'Email', message: message, attachment: att, valor });
                });
                pdfParser.parseBuffer(binArray);
            });
        });
    });
});

function getValorFromPDF(pdfData) {
    var valor = decodeURIComponent(pdfData.formImage.Pages[0].Texts[3].R[0].T);
    return valor.slice(2, valor.length);
}

function handleError(error) {
    console.log("Error! " + error.message);
}

module.exports = router;
