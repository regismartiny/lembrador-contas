const express = require('express')
const router = express.Router()
const db = require("../db");
const WebPush = require('web-push');

// const apiKeys = WebPush.generateVAPIDKeys()
// console.log('WebPush VAPID keys generated: ', apiKeys)
// const apiKeys = {
//    publicKey: 'BIjmnu66vnPL_ZBMZAfMTczJfqqkCkzHJ5j6RyH4KTwoMJGJrqBJ1YaBx0NMzQNS5esHeP3f7R8SAxWFTGJrIgs',
//    privateKey: 'NHuVW1uesQi56xgZYuzfNEEOyPXdHujF-4SyWNztQ1s' 
// }

db.PushNotificationSubscription.deleteMany().lean().exec()


router.get('/push/public_key', function (req, res) {
   console.log("/push/public_key", req.body)
   console.log('publicKey', apiKeys.publicKey)
   return res.status(200).json({publicKey: apiKeys.publicKey}).send()
});

router.post('/push/register', async function (req, res) {
   console.log("/push/register", req.body)
   let endpoint = req.body.subscription.endpoint
   let keys = req.body.subscription.keys

   let subscriptionFound = await db.PushNotificationSubscription.find({ endpoint }).lean().exec()
   console.log('subscriptionFound', subscriptionFound)
   if (!subscriptionFound.length) {
      console.log('Saving registration')
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
   }
   return res.status(201).send()
})

router.post('/push/send', function (req, res) {
   console.log("/push/send", req.body)
   let notificationContent = req.body
  
   db.PushNotificationSubscription.find({}, async function (err, subscriptions) {
      if (err) {
          handleError(err);
          return res.status(500).send()
      } else if (subscriptions){
         console.log('subscriptions found: ', subscriptions)
         for (const subscription of subscriptions) {
            await sendNotification(subscription, notificationContent)
         }
         return res.status(201).send()
      } else {
         console.log('No subscriptions found')
         return res.status(200).send()
      }
  }).sort( { updated_at: 1 } );
});

async function sendNotification(subscription, notificationContent) {
   return new Promise((resolve, reject) => {
      const sendPushBody = {
         endpoint: subscription.endpoint,
         keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
         }
      }

      const payload = JSON.stringify({
         title: notificationContent.title,
         body: notificationContent.body
      })

      const options = {
         vapidDetails: {
            subject: 'mailto:regismartiny@gmail.com',
            publicKey: apiKeys.publicKey,
            privateKey: apiKeys.privateKey
         }
      }

      WebPush.sendNotification(sendPushBody, payload, options)
      .then(() => resolve())
      .catch((reason) => {
         console.log("Ocorreu um erro ao enviar notificação", reason)
         resolve(reason)
      })
   })
}

function handleError(error) {
   console.log("Error! " + error.message);
}

module.exports = router;
