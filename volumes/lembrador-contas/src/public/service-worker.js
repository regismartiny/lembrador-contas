self.addEventListener('activate', async () => {
   // This will be called only once when the service worker is activated.
   console.log('service worker activated')

   let subscription = await self.registration.pushManager.getSubscription()

   if (!subscription) {
      console.log('No pushManager subscription found. Creating one.')
      const publicKeyResponse = await send('GET', '/notifications/push/public_key')

      subscription = await self.registration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: JSON.parse(publicKeyResponse).publicKey
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

self.addEventListener('push', e => {
   console.log('push event')

   if (Notification.permission == 'denied') {
      console.log("Permission wan't granted")
      return;
   }

   if (Notification.permission == 'default') {
      console.log("The permission request was dismissed")
   }

   console.log("The permission request was granted!")

   try {
      showNotification(e)
   } catch(err){
      throw new Error(`Error in SW: ${e}`)
   }
})

function showNotification(e) {
   const data = e.data.json()
   console.log('showNotification', data)
   const options = {
      body: data.body
   }

   e.waitUntil(
      registration.showNotification(data.title,options)
   )
}

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