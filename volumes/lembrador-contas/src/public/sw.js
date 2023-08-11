function urlB64ToUint8Array(base64String) {
   const padding = '='.repeat((4 - base64String.length % 4) % 4);
   const base64 = (base64String + padding)
     .replace(/\-/g, '+')
     .replace(/_/g, '/');
 
   const rawData = window.atob(base64);
   const outputArray = new Uint8Array(rawData.length);
 
   for (let i = 0; i < rawData.length; ++i) {
     outputArray[i] = rawData.charCodeAt(i);
   }
   return outputArray;
 }

self.addEventListener('activate', async () => {
   // This will be called only once when the service worker is activated.
   console.log('[Service Worker] Activated.')

   setTimeout(() => {
      sendNotification({title: 'Lembrador de contas', body: 'Bem vindo ao Lembrador de Contas!'})
   }, 2000);

 })

self.addEventListener('push', event => {
   console.log('[Service Worker] Push Received.')
   console.log(`[Service Worker] Push had this data: "${event.data.text()}"`)

   if (Notification.permission == 'denied') {
      console.log("Permission wan't granted")
      return;
   }

   if (Notification.permission == 'default') {
      console.log("The permission request was dismissed")
   }

   console.log("The permission request was granted!")

   if (event.data) {
      const msg = event.data.json()
      showLocalNotification(msg.title, msg.body, event);
   } else {
      console.log("[Service Worker] Push event but no data")
    }
})

self.addEventListener('notificationclick', function(event) {
   console.log('[Service Worker] Notification click Received.')

   event.notification.close()

   event.waitUntil(
      clients.openWindow('https://developers.google.com/web/')
   )
})

self.addEventListener('pushsubscriptionchange', function(event) {
   console.log('[Service Worker]: \'pushsubscriptionchange\' event fired.')
   const applicationServerKey = urlB64ToUint8Array(applicationServerPublicKey)
   event.waitUntil(
      self.registration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: applicationServerKey
      })
      .then(async function(newSubscription) {
         console.log('[Service Worker] New subscription: ', newSubscription)
         updateSubscriptionOnServer(newSubscription)
      })
   );
});

const showLocalNotification = (title, body, event) => {
   console.log('[Service Worker] showLocalNotification')
   const options = {
     body
     // here you can add more properties like icon, image, vibrate, etc.
   };
   event.waitUntil(self.registration.showNotification(title, options));
 };

async function sendNotification(data) {
   //Teste de notificacao
   await send('POST', '/notifications/push/send', data)
}

async function updateSubscriptionOnServer(subscription) {
   await send('POST', '/notifications/push/register', {
      subscription
   })
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