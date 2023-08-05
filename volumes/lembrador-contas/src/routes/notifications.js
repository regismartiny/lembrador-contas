const express = require('express')
const router = express.Router()
const WebPush = require('web-push')

//console.log(WebPush.generateVAPIDKeys())

const publickKey = 'BESn_XPIJdTml9-Z7lmMr4YrwpCfGN1KEiS4q25UrzjU3mW3_ZX06cRsLgotfKtfkEM_Cvt2oTNbl9VRx7Amg3w'
const privateKey = 'qPeMZfrOwGabPGki5WJyVlF_6gqonbdlaB2PCtmxBlg'

WebPush.setVapidDetails('https://lembradordecontas.martiny.tech', publickKey, privateKey)


router.get('/push/public_key', function (req, res) {
   return res.status(200).json({publickKey}).send()
});

router.post('/push/register', function (req, res) {
   console.log(req.body)
   return res.status(201).send()
});

router.post('/push/send', function (req, res) {
   console.log(req.body)
   const sub = req.body.subscription

   const sendPushBody = {
      subscription: {
         endpoint: sub.endpoint,
         keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth
         }
      }
   }

   WebPush.sendNotification(sendPushBody, 'Teste de notificação')

   return res.status(201).send()
});

module.exports = router;
