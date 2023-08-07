
self.addEventListener('push', e => {
   console.log(self.Notification)

   if(self.Notification.permission == 'denied'){
       console.log("Permission wan't granted")
       return;
   }

   if(self.Notification.permission == 'default'){
       console.log("The permission request was dismissed")
   }

   console.log("The permission request was granted!")

   try{
       const data = e.data.json()
       console.log(data)
       const options = {
           body: data.body
       }
       e.waitUntil(
           self.registration.showNotification(data.title,options)
       )
   }catch(err){
       throw new Error(`Error in SW: ${e}`)
   }
})

// Check if the service worker API is supported
if ('serviceWorker' in navigator) {
   navigator.serviceWorker.register('service-worker.js', { scope: '/' })
      .then(async serviceWorker => {
         console.log(`Service Worker Registration (Scope: ${serviceWorker.scope})`);

         let subscription = await serviceWorker.pushManager.getSubscription()

         if (!subscription) {
            console.log('No pushManager subscription found. Creating one.')
            const publicKeyResponse = await send('GET', '/notifications/push/public_key')

            subscription = await serviceWorker.pushManager.subscribe({
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
         
      }).catch(error => {
         // display an error message
         let msg = `Service Worker Error (${error})`;
         console.error(msg);
       });
} else {
   // happens when the app isn't served over a TLS connection (HTTPS)
   // or if the browser doesn't support service workers
   console.warn('Service Worker not available');
}


 async function sendNotification(data) {
   //Teste de notificacao
   await send('POST', '/notifications/push/send', data)
}

function send(method, url, data) {
   return new Promise(function (resolve, reject) {
      const req = new XMLHttpRequest();
      req.onreadystatechange = function() {
         if (this.readyState == 4 && (this.status >= 200 || this.status < 300)) {
            resolve(this.responseText)
         }
      };
      req.open(method, url)
      req.setRequestHeader('Content-type', 'application/json');
      req.send(JSON.stringify(data))
   });
}