var express = require('express');
var router = express.Router();
var template = require('./template');
var db = require("../db");
var gmail = require('../util/gmail.js');
var emailUtils = require('../util/emailUtils.js');
var vm = require('vm');

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
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum });
});

/* POST to Add Email */
router.post('/add', function (req, res) {
    let address = req.body.address;
    let subject = req.body.subject;
    let valueData = parseData(req.body);
    let status = req.body.status;

    console.log(req.body);

    let email = new db.Email({ address, subject, valueData, status });
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
            res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, email });
        }
    });
});

/* POST to Update Email */
router.post('/update', function (req, res) {

    let emailId = req.body.id;
    let address = req.body.address;
    let subject = req.body.subject;
    let valueData = parseData(req.body);
    let status = req.body.status;

    db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address,  subject, valueData, status} }, { new: true }, function (err, email) {
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

router.get('/testValue/:id', async function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId, async function (err, email) {
        if (err) {
            handleError(err);
        } else {
            const message = await emailUtils.getMessage(email.address, email.subject);
            let att = await emailUtils.getAttachmentFromMessage(message);
            let pdfData = await emailUtils.getPDFFromAttachment(att.attachment.data);

            let value = [];

            email.valueData.forEach(val => {
                let obj = { name: val.name, value: ''};
                let str = 'pdfData = JSON.parse(\'' + JSON.stringify(pdfData) + '\');'
                    + 'decodeURIComponent(' + val.value + ')';
                obj.value = vm.runInNewContext(str);
                value.push(obj);
            })
            console.table(value);
            res.render('email/emailValue', { nome: email.address, valor: JSON.stringify(value) });
        }
    });
});

function parseData(body) {
    let newData = [];
    let length = (typeof body.name === 'object') ? body.name.length : 1;
    for(let i=0; i < length; i++) {
        let name = length > 1 ? body.name[i] : body.name;
        let value = length > 1 ? body.value[i] : body.value;
        newData.push({name, value});
    }
    return newData;
}

function handleError(error) {
    console.log("Error! " + error.message);
    res.render('error', { message: '', error: error});
}

module.exports = router;
