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

function checkNotificationsPermission() {
   if (Notification.permission == 'denied') {
      return false;
   }

   if (Notification.permission == 'default') {
   }

   return true;
}

self.addEventListener('activate', async () => {
   // This will be called only once when the service worker is activated.
})

self.addEventListener('push', event => {

   if (!checkNotificationsPermission()) {
      return
   }

   if (event.data) {
      const msg = event.data.json()
      showLocalNotification(msg.title, msg.body, event);
   } else {
    }
})

self.addEventListener('notificationclick', function(event) {

   event.notification.close()

   event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
         for (const client of clientList) {
            if ('focus' in client) return client.focus();
         }
         return clients.openWindow('/');
      })
   )
})

self.addEventListener('pushsubscriptionchange', async function(event) {
   
   try {
      const resp = await fetch('/notifications/push/public_key')
      const data = await resp.json()
      if (!data.publicKey) {
         console.error('No public key available for re-subscription')
         return
      }
      const applicationServerKey = urlB64ToUint8Array(data.publicKey)
      
      const newSubscription = await self.registration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: applicationServerKey
      })
      
      
      // Send the new subscription to the register endpoint
      await fetch('/notifications/push/register', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ subscription: newSubscription })
      })
   } catch (err) {
      console.error('[Service Worker] Subscription refresh failed:', err.name)
   }
});

const showLocalNotification = (title, body, event) => {
   const options = {
     body
     // here you can add more properties like icon, image, vibrate, etc.
   };
   event.waitUntil(self.registration.showNotification(title, options));
};
