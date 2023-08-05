navigator.serviceWorker.register('/service-worker.js')
   .then(async serviceWorker => {
      console.log('Service worker registered')

      let subscription = await serviceWorker.pushManager.getSubscription()

      if (!subscription) {
         const publicKeyResponse = await send('GET', '/notifications/push/public_key')

         subscription = await serviceWorker.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKeyResponse.data.publicKey
         })
      }

      await send('POST', '/notifications/push/register', {
         subscription
      })

      //Teste de notificacao
      await send('POST', '/notifications/push/send')
   })

function send(method, url, data) {
   return new Promise(function (resolve, reject) {
      const req = new XMLHttpRequest();
      req.addEventListener("load", () => {
         console.log(this.responseText)
         resolve(this.responseText)
      });
      req.open(method, url)
      req.send(data)
   });
}