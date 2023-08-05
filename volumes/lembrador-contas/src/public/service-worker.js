// Check if the service worker API is supported
if ("serviceWorker" in navigator) {
   navigator.serviceWorker.register('/service-worker.js')
      .then(async serviceWorker => {
         console.log('Service worker registered.')

         let subscription = await serviceWorker.pushManager.getSubscription()

         if (!subscription) {
            const publicKeyResponse = await send('GET', '/notifications/push/public_key')

            subscription = await serviceWorker.pushManager.subscribe({
               userVisibleOnly: true,
               applicationServerKey: JSON.parse(publicKeyResponse).publicKey
            })
         }

         await send('POST', '/notifications/push/register', {
            subscription
         })

         //Teste de notificacao
         await send('POST', '/notifications/push/send', subscription)
      })

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
}