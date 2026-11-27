function urlB64ToUint8Array(base64String) {
   const padding = '='.repeat((4 - base64String.length % 4) % 4);
   const base64 = (base64String + padding)
     .replace(/-/g, '+')
     .replace(/_/g, '/');
 
   const rawData = self.atob(base64);
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


   return true;
}

const CACHE_NAME = 'lembrador-contas-v4';
const STATIC_ASSETS = [
   '/stylesheets/starter-template.css',
   '/main.js',
   '/bootstrap/css/bootstrap.min.css',
   '/bootstrap/js/bootstrap.min.js',
   '/jquery/jquery.min.js',
   '/popperjs/popper.min.js',
   '/favicon.ico',
   '/app.webmanifest',
];

function isVendorStaticAsset(pathname) {
   return (
      pathname.startsWith('/bootstrap/') ||
      pathname.startsWith('/jquery/') ||
      pathname.startsWith('/jquery-mask/') ||
      pathname.startsWith('/popperjs/') ||
      pathname.startsWith('/images/') ||
      pathname === '/favicon.ico'
   );
}

function isAppStaticAsset(pathname) {
   return (
      pathname.startsWith('/stylesheets/') ||
      pathname === '/main.js' ||
      pathname === '/app.webmanifest'
   );
}

self.addEventListener('install', event => {
   event.waitUntil(
      caches.open(CACHE_NAME)
         .then(cache => cache.addAll(STATIC_ASSETS))
         .then(() => self.skipWaiting())
   );
});

self.addEventListener('activate', event => {
   event.waitUntil(
      caches.keys()
         .then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
         ))
         .then(() => self.clients.claim())
   );
});

self.addEventListener('fetch', event => {
   const request = event.request;
   if (request.method !== 'GET') return;

   const url = new URL(request.url);
   if (url.origin !== self.location.origin) return;
   if (url.pathname.startsWith('/notifications/') || url.pathname.startsWith('/backup') || url.pathname.startsWith('/reports/export.csv') || url.pathname === '/logout') return;

   if (isVendorStaticAsset(url.pathname)) {
      event.respondWith(
         caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
               if (response && response.ok) {
                  const clone = response.clone();
                  caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
               }
               return response;
            });
         })
      );
      return;
   }

   if (isAppStaticAsset(url.pathname)) {
      event.respondWith(
         fetch(request)
            .then(response => {
               if (response && response.ok) {
                  const clone = response.clone();
                  caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
               }
               return response;
            })
            .catch(() => caches.match(request))
      );
      return;
   }

   event.respondWith(
      fetch(request)
         .then(response => {
            if (response && response.ok && request.mode === 'navigate') {
               const clone = response.clone();
               caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
         })
         .catch(() => caches.match(request))
   );
});

self.addEventListener('push', event => {

   if (!checkNotificationsPermission()) {
      return
   }

   if (event.data) {
      const msg = event.data.json()
      showLocalNotification(msg.title, msg.body, event);
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

self.addEventListener('pushsubscriptionchange', function(event) {
   event.waitUntil((async () => {
      try {
         const resp = await fetch('/notifications/push/public_key', { credentials: 'same-origin' });
         if (!resp.ok) {
            console.error('Failed to fetch public key for re-subscription:', resp.status);
            return;
         }
         const data = await resp.json();
         if (!data.publicKey) {
            console.error('No public key available for re-subscription');
            return;
         }
         const applicationServerKey = urlB64ToUint8Array(data.publicKey);

         const newSubscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
         });

         const headers = { 'Content-Type': 'application/json' };
         if (data.csrfToken) {
            headers['x-csrf-token'] = data.csrfToken;
         }

         // Send the new subscription to the register endpoint
         await fetch('/notifications/push/register', {
            method: 'POST',
            credentials: 'same-origin',
            headers,
            body: JSON.stringify({ subscription: newSubscription })
         });
      } catch (err) {
         console.error('[Service Worker] Subscription refresh failed:', err.name);
      }
   })());
});

const showLocalNotification = (title, body, event) => {
   const options = {
     body
     // here you can add more properties like icon, image, vibrate, etc.
   };
   event.waitUntil(self.registration.showNotification(title, options));
};
