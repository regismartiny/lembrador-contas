import express from 'express';
import logger from '../util/logger.js';
import asyncHandler from '../util/asyncHandler.js';
import db from '../db.js';
import { checkAndNotify } from '../util/notificationScheduler.js';

const router = express.Router();

router.get('/push/public_key', function (req, res) {
   const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
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
   // Trigger the scheduler's check-and-notify logic (manual trigger for testing)
   await checkAndNotify();
   return res.status(201).send()
}));

export default router;
