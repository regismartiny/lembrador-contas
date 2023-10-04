const express = require('express')
const router = express.Router()
const db = require("../db")
const WebPush = require('web-push')

const apiKeys = WebPush.generateVAPIDKeys()
console.log('WebPush VAPID keys generated: ', apiKeys)


db.PushNotificationSubscription.deleteMany().lean().exec()


router.get('/push/public_key', function (req, res) {
   console.log("/push/public_key", req.body)
   console.log('publicKey', apiKeys.publicKey)
   return res.status(200).json({publicKey: apiKeys.publicKey}).send()
})

router.post('/push/register', async function (req, res) {
   console.log("/push/register", req.body)
   let endpoint = req.body.subscription.endpoint
   let keys = req.body.subscription.keys

   let subscriptionFound = await db.PushNotificationSubscription.find({ endpoint }).lean().exec()
   console.log('subscriptionFound', subscriptionFound)
   if (!subscriptionFound.length) {
      console.log('Saving registration')
      let subscription = new db.PushNotificationSubscription({ endpoint, keys })
      try {
         await subscription.save()
         console.log("PushNotificationSubscription saved")
         return res.status(201).send() 
      } catch(err) {
          handleError(err, res)
          return res.status(500).send()
      }
   }
   return res.status(201).send()
})

router.post('/push/send', async function (req, res) {
   console.log("/push/send", req.body)
   let notificationContent = req.body
  
   try {
      let subscriptions = await db.PushNotificationSubscription.find({}).sort( { updated_at: 1 } )
      if (subscriptions){
         console.log('subscriptions found: ', subscriptions)
         for (const subscription of subscriptions) {
            await sendNotification(subscription, notificationContent)
         }
         return res.status(201).send()
      } else {
         console.log('No subscriptions found')
         return res.status(200).send()
      }
   } catch(err) {
      handleError(err, res)
      return res.status(500).send()
   }
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

function handleError(error, res) {
   console.log("Error! " + error.message)
   res.render('error', { message: '', error: error})
 }

module.exports = router
