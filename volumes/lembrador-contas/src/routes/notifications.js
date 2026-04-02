import express from 'express';
import db from '../db.js';
import WebPush from 'web-push';

const router = express.Router();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidMailto = process.env.VAPID_MAILTO;

if (!vapidPublicKey || !vapidPrivateKey || !vapidMailto) {
   console.warn('WARNING: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_MAILTO env vars are not set. Push notifications will not work.');
}

db.PushNotificationSubscription.deleteMany().lean().exec()


router.get('/push/public_key', function (req, res) {
   console.log("/push/public_key", req.body)
   if (!vapidPublicKey) {
      return res.status(503).json({ error: 'Push notifications not configured (VAPID_PUBLIC_KEY missing)' })
   }
   return res.status(200).json({ publicKey: vapidPublicKey })
});

router.post('/push/register', async function (req, res) {
   console.log("/push/register", req.body)
   let endpoint = req.body.subscription.endpoint
   let keys = req.body.subscription.keys

   let subscriptionFound = await db.PushNotificationSubscription.find({ endpoint }).lean()
   console.log('subscriptionFound', subscriptionFound)
   if (!subscriptionFound.length) {
      console.log('Saving registration')
      let subscription = new db.PushNotificationSubscription({ endpoint, keys });
      subscription.save().then(() => {
         console.log("PushNotificationSubscription saved")
         return res.status(201).send()
      }).catch(err => {
         handleError(err);
         return res.status(500).send()
      });
   }
   return res.status(201).send()
})

router.post('/push/send', function (req, res) {
   console.log("/push/send", req.body)
   let notificationContent = req.body

   db.PushNotificationSubscription.find({}).then(async function (subscriptions) {
      if (subscriptions) {
         console.log('subscriptions found: ', subscriptions)
         for (const subscription of subscriptions) {
            await sendNotification(subscription, notificationContent)
         }
         return res.status(201).send()
      } else {
         console.log('No subscriptions found')
         return res.status(200).send()
      }
   }).catch(err => {
      handleError(err);
      return res.status(500).send()
   })
})

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
            subject: `mailto:${vapidMailto}`,
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey
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

export default router;
