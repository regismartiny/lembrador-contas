const express = require('express')
const router = express.Router()
const WebPush = require('web-push')

const apiKeys = WebPush.generateVAPIDKeys()

const publicKey = apiKeys.publicKey
const privateKey = apiKeys.privateKey

WebPush.setVapidDetails('https://lembradordecontas.martiny.tech', publicKey, privateKey)


router.get('/push/public_key', function (req, res) {
   console.log("/push/public_key", req.body)
   return res.status(200).json({publicKey}).send()
});

router.post('/push/register', function (req, res) {
   console.log("/push/register", req.body)
   return res.status(201).send()
});

router.post('/push/send', function (req, res) {
   console.log("/push/send", req.body)
   const sub = req.body

   const sendPushBody = {
      endpoint: sub.endpoint,
      keys: {
         p256dh: sub.keys.p256dh,
         auth: sub.keys.auth
      }
   }

   var payload = JSON.stringify({
      title: 'Lembrador de Contas',
      body: 'Bem vindo ao Lembrador de Contas!'
  });

   WebPush.sendNotification(sendPushBody, payload)
      .catch((reason) => console.log("Ocorreu um erro ao enviar notificação", reason))

   return res.status(201).send()
});

module.exports = router;
