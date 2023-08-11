const express = require('express')
const router = express.Router()
const db = require("../db");
const WebPush = require('web-push')

const apiKeys = WebPush.generateVAPIDKeys()

console.log('WebPush VAPID keys generated: ', apiKeys)

const publicKey = apiKeys.publicKey
const privateKey = apiKeys.privateKey

WebPush.setVapidDetails('mailto: regismartiny@gmail.com', publicKey, privateKey)

db.PushNotificationSubscription.deleteMany({}).lean().exec()


router.get('/push/public_key', function (req, res) {
   console.log("/push/public_key", req.body)
   console.log('publicKey', publicKey)
   return res.status(200).json({publicKey}).send()
});

router.post('/push/register', function (req, res) {
   console.log("/push/register", req.body)
   let endpoint = req.body.subscription.endpoint
   let keys = req.body.subscription.keys
   let subscription = new db.PushNotificationSubscription({ endpoint, keys });
   subscription.save(function (err) {
        if (err) {
            handleError(err);
            return res.status(500).send()
        } else {
            console.log("PushNotificationSubscription saved");
            return res.status(201).send()
        }
    });
   return res.status(201).send()
});

router.post('/push/send', function (req, res) {
   console.log("/push/send", req.body)
   let notificationContent = req.body
  
   db.PushNotificationSubscription.find({}, function (err, subscriptions) {
      if (err) {
          handleError(err);
          return res.status(500).send()
      } else if (subscriptions){
         console.log('subscriptions found: ', subscriptions)
         for (const subscription of subscriptions) {
            sendNotification(subscription, notificationContent)
         }
         return res.status(201).send()
      } else {
         console.log('No subscriptions found')
         return res.status(200).send()
      }
  }).sort( { updated_at: 1 } );
});

function sendNotification(subscription, notificationContent) {
   const sendPushBody = {
      endpoint: subscription.endpoint,
      keys: {
         p256dh: subscription.keys.p256dh,
         auth: subscription.keys.auth
      }
   }

   var payload = JSON.stringify({
      title: notificationContent.title,
      body: notificationContent.body
  });

   WebPush.sendNotification(sendPushBody, payload)
      .catch((reason) => console.log("Ocorreu um erro ao enviar notificação", reason))
}

function handleError(error) {
   console.log("Error! " + error.message);
}

module.exports = router;
