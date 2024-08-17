function hideNotificationsToast() {
   $('#notifications-toast-container').remove()
}
 
async function requestNotificationPermission() {
   console.log('requestNotificationPermission')
   hideNotificationsToast()
   const areNotificationsGranted = window.Notification.permission === "granted"
   if (areNotificationsGranted) {
      console.log("Notifications permission granted")
      await subscribePushManager()
      return
   }
    
   const result = await window.Notification.requestPermission()
   // If the user rejects the permission result will be "denied"
   if (result === "granted") {
      console.log('Notifications permission granted')
      await subscribePushManager()
      showNotification()
   } else {
      console.log('Notifications permission denied')
   }
}

 function showNotification() {
    const options = {
       body: 'Notificações ativadas'
    }
    self.swRegistration.showNotification('Lembrador de Contas', options)
 }

 // urlB64ToUint8Array is a magic function that will encode the base64 public key
 // to Array buffer which is needed by the subscription option
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

async function updateSubscriptionOnServer(subscription) {
   await send('POST', '/notifications/push/register', {
      subscription
   })
}

async function subscribePushManager() {

   await navigator.serviceWorker.ready

   var subscription = await swRegistration.pushManager.getSubscription()
   const isSubscribed = !(subscription === null)
   if (!isSubscribed) {
      console.log('No pushManager subscription found. Creating one.')
      const publicKeyResponse = await send('GET', '/notifications/push/public_key')
      console.log('publicKeyResponse', publicKeyResponse)
      const appServerPublicKey = JSON.parse(publicKeyResponse).publicKey
      applicationServerPublicKey = urlB64ToUint8Array(appServerPublicKey)
      console.log('applicationServerKey', applicationServerPublicKey)

      subscription = await swRegistration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: applicationServerPublicKey
      })
   }

   console.log('subscription', subscription)

   if (subscription === null) {
      console.error('Unable to subscribe to pushManager.', err)
      return
   }

   await updateSubscriptionOnServer(subscription)
 }

 function unsubscribeUser() {
     swRegistration.pushManager.getSubscription()
     .then(function(subscription) {
       if (subscription) {
         return subscription.unsubscribe()
       }
     })
     .catch(function(error) {
       console.log('Error unsubscribing', error)
     })
     .then(function() {
       updateSubscriptionOnServer(null)
   
       console.log('User is unsubscribed.')
       isSubscribed = false
   
     //   updateBtn()
     });
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

if ('serviceWorker' in navigator && 'PushManager' in window) {
    console.log('Service Worker and Push are supported')

   navigator.serviceWorker.register('/sw.js')
   .then(async function(swReg) {
      console.log('Service Worker is registered', swReg)
      swRegistration = swReg
      requestNotificationPermission()
   })
   .catch(function(error) {
      console.error('Service Worker Error: ', error)
   })
} else {
   console.warn('Push messaging is not supported')
}

$(document).ready(function () {
    if (Notification.permission == 'default') {
       $('.toast').toast({autohide: false})
       $('#notifications-toast-container').css("display", "block");
       $('#notifications-toast').toast('show')
    }
 })

// Function to toggle between dark and light themes
function toggleTheme() {
   const body = document.body;
   if (body.classList.contains('dark-theme')) {
       body.classList.remove('dark-theme');
       body.classList.add('light-theme');
   } else {
       body.classList.remove('light-theme');
       body.classList.add('dark-theme');
   }
}