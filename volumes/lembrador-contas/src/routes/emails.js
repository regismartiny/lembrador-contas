const express = require('express');
const router = express.Router();
const template = require('./template');
const db = require("../db");
const gmail = require('../util/gmail.js');
const emailUtils = require('../util/emailUtils.js');
const vm = require('vm');
const utils = require("../util/utils");
const cpflEmailParser = require("../util/cpflEmailParser");

/* GET db.Email page. */
router.get('/list', function (req, res) {
    db.Email.find({}).lean().exec(
        function (e, email) {
            res.render('email/emailList', { template, title: 'Emails', emailList: email, statusEnum: db.StatusEnum });
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
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum, dataTypeEnum: db.DataTypeEnum });
});

/* POST to Add Email */
router.post('/add', function (req, res) {
    let address = req.body.address;
    let subject = req.body.subject;
    let dataType = req.body.dataType;
    let valueData = parseData(req.body);

    let email = new db.Email({ address, subject, dataType, valueData });
    email.save(function (err) {
        if (err) {
            handleError(err);
            return err;
        }
        console.log("Email saved");
        res.redirect("/emails/list");
    });
});

/* GET Edit Email page. */
router.get('/edit/:id', function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        } 
        res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, dataTypeEnum: db.DataTypeEnum, email });
    });
});

/* POST to Update Email */
router.post('/update', function (req, res) {

    let emailId = req.body.id;
    let address = req.body.address;
    let subject = req.body.subject;
    let dataType = req.body.dataType;
    let valueData = parseData(req.body);
    let status = req.body.status;

    db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address,  subject, dataType, valueData, status} }, { new: true }, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        }
        console.log("Email updated");
        res.redirect("/emails/list");
    });
});

/* GET Remove Email */
router.get('/remove/:id', function (req, res) {
    let emailId = req.params.id;

    db.Email.findOneAndRemove({ _id: emailId }, function (err, email) {
        if (err) {
            handleError(err);
            return err;
        }
        res.redirect("/emails/list");
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

router.get('/test/:id', async function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId, async function (err, email) {
        if (err) {
            handleError(err);
            return err;
        } 
        const message = await emailUtils.getLastMessage(email.address, email.subject);
        
        let values = [];
        if (db.DataTypeEnum[email.dataType] === db.DataTypeEnum.PDF_ATTACHMENT) {
            getEmailPDFAttachmentData(values);
        } else if(db.DataTypeEnum[email.dataType] === db.DataTypeEnum.BODY) {
            const info = await cpflEmailParser.getInfoFromHTMLEmail(message);
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
function parseData(body) {
    let newData = [];
    body.name = utils.toArray(body.name);
    body.value = utils.toArray(body.value);
    let length = body.name.length;
    for(let i=0; i < length; i++) {
        let name = body.name[i];
        let value = body.value[i];
        newData.push({name, value});
    }
    return newData;
}

function handleError(error) {
    console.log("Error! " + error.message);
    res.render('error', { message: '', error: error});
}

module.exports = router;
