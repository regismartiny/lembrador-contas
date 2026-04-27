import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import db from '../db.js';
import WebPush from 'web-push';

const router = express.Router();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidMailto = process.env.VAPID_MAILTO;

if (!vapidPublicKey || !vapidPrivateKey || !vapidMailto) {
   logger.warn('WARNING: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_MAILTO env vars are not set. Push notifications will not work.');
}

db.PushNotificationSubscription.deleteMany().lean().exec()


router.get('/push/public_key', function (req, res) {
   logger.info("/push/public_key", req.body)
   if (!vapidPublicKey) {
      return res.status(503).json({ error: 'Push notifications not configured (VAPID_PUBLIC_KEY missing)' })
   }
   return res.status(200).json({ publicKey: vapidPublicKey })
});

router.post('/push/register', asyncHandler(async function (req, res) {
   logger.info("/push/register", req.body)
   let subscription = req.body.subscription
   if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' })
   }
   let endpoint = subscription.endpoint
   let keys = subscription.keys

   const subscriptionFound = await db.PushNotificationSubscription.find({ endpoint }).lean()
   logger.info('subscriptionFound', subscriptionFound)
   if (!subscriptionFound.length) {
      logger.info('Saving registration')
      const subscription = new db.PushNotificationSubscription({ endpoint, keys });
      await subscription.save()
      logger.info("PushNotificationSubscription saved")
   }
   return res.status(201).send()
}));

router.post('/push/send', asyncHandler(async function (req, res) {
   logger.info("/push/send", req.body)
   let notificationContent = req.body

   const subscriptions = await db.PushNotificationSubscription.find({})
   if (subscriptions && subscriptions.length) {
      logger.info('subscriptions found: ', subscriptions)
      for (const subscription of subscriptions) {
         await sendNotification(subscription, notificationContent)
      }
   } else {
      logger.info('No subscriptions found')
   }
   return res.status(201).send()
}));

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
         logger.info("Ocorreu um erro ao enviar notificação", reason)
         resolve(reason)
      })
   })
}

export default router;
