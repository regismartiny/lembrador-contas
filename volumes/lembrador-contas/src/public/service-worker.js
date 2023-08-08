self.addEventListener('activate', async () => {
   // This will be called only once when the service worker is activated.
   console.log('service worker activated')

   let subscription = await self.registration.pushManager.getSubscription()

   if (!subscription) {
      console.log('No pushManager subscription found. Creating one.')
      const publicKeyResponse = await send('GET', '/notifications/push/public_key')
      const applicationServerKey = urlB64ToUint8Array(JSON.parse(publicKeyResponse).publicKey)

      subscription = await self.registration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey
      })
   }

   if (!subscription) console.error('Unable to subscribe to pushManager.', err)

   await send('POST', '/notifications/push/register', {
      subscription
   })

   setTimeout(() => {
      sendNotification(subscription)
   }, 5000);

 })

self.addEventListener('push', event => {
   console.log('push event')

   if (Notification.permission == 'denied') {
      console.log("Permission wan't granted")
      return;
   }

   if (Notification.permission == 'default') {
      console.log("The permission request was dismissed")
   }

   console.log("The permission request was granted!")

   if (event.data) {
      console.log('event text:', event.data.text())
      const msg = event.data.json()
      showLocalNotification(msg.title, msg.body, self.registration);
   } else {
      console.log("Push event but no data");
    }
})

const showLocalNotification = (title, body, swRegistration) => {
   console.log('showLocalNotification')
   const options = {
     body
     // here you can add more properties like icon, image, vibrate, etc.
   };
   swRegistration.showNotification(title, options);
 };

async function sendNotification(data) {
   //Teste de notificacao
   await send('POST', '/notifications/push/send', data)
}

async function send(method, url, data) {
   const options = {
      method: method,
      headers: {
         // 'Accept': 'application/json',
         'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
   }

   const rawContent = await fetch(url, options)
   const content = await rawContent.text()
   return content
}

// urlB64ToUint8Array is a magic function that will encode the base64 public key
// to Array buffer which is needed by the subscription option
const urlB64ToUint8Array = base64String => {
   const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
   const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
   const rawData = atob(base64)
   const outputArray = new Uint8Array(rawData.length)
   for (let i = 0; i < rawData.length; ++i) {
     outputArray[i] = rawData.charCodeAt(i)
   }
   return outputArray
 }