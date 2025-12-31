import express from 'express';
import template from './template.js';
import db from '../db.js';
import gmail from '../util/gmail.js';
import emailUtils from '../util/emailUtils.js';
import vm from 'vm';
import cpflEmailParser from '../parser/cpflEmailParser.js';

const router = express.Router();

/* GET db.Email page. */
router.get('/list', function (req, res) {
    db.Email.find({}).lean().then(
        function (emails) {
            const emailList = emails.sort((a,b)=>a.address.localeCompare(b.address))
            res.render('email/emailList', { template, title: 'Emails', emailList, statusEnum: db.StatusEnum });
        }
    )
});

/* GET db.Email JSON */
router.get('/listJSON', function (req, res) {
    db.Email.find({}).lean().then(
        function (email) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(email));
        }
    );
});

/* GET New email page. */
router.get('/new', function (req, res) {
    res.render('email/editEmail', { template, title: 'Cadastro de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum });
});

/* POST to Add Email */
router.post('/add', function (req, res) {
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser

    let email = new db.Email({ address, subject, dataParser })
    email.save().then(function () {
        console.log("Email saved")
        res.redirect("/emails/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Edit Email page. */
router.get('/edit/:id', function (req, res) {
    let emailId = req.params.id;

    db.Email.findById(emailId).then(function (email) {
        res.render('email/editEmail', { template, title: 'Edição de Email', statusEnum: db.StatusEnum, dataParserEnum: db.DataParserEnum, email })
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* POST to Update Email */
router.post('/update', function (req, res) {

    let emailId = req.body.id
    let address = req.body.address
    let subject = req.body.subject
    let dataParser = req.body.dataParser
    let status = req.body.status

    db.Email.findOneAndUpdate({ _id: emailId }, { $set: { address,  subject, dataParser, status} }, { new: true }).then(function (email) {
        console.log("Email updated")
        res.redirect("/emails/list")
    }).catch(err => {
        handleError(err)
        return err
    })
})

/* GET Remove Email */
router.get('/remove/:id', function (req, res) {
    let emailId = req.params.id

    db.Email.findOneAndDelete({ _id: emailId }).then(function (email) {
        res.redirect("/emails/list")
    }).catch(err => {
        handleError(err)
        return err
    })
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

function handleError(error) {
    console.log("Error! " + error.message);
    res.render('error', { message: '', error: error});
}

export default router;
