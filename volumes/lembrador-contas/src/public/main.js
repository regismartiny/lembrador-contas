let swRegistration = null;
let applicationServerPublicKey = null;
// eslint-disable-next-line no-unused-vars
let isSubscribed = false;

function hideNotificationsToast() {
   $('#notifications-toast-container').remove()
}
 
async function requestNotificationPermission() {
   hideNotificationsToast()
   const areNotificationsGranted = window.Notification.permission === "granted"
   if (areNotificationsGranted) {
      await subscribePushManager()
      return
   }
    
   const result = await window.Notification.requestPermission()
   // If the user rejects the permission result will be "denied"
   if (result === "granted") {
      await subscribePushManager()
      showNotification()
   }
}

 function showNotification() {
    const options = {
       body: 'Notificações ativadas'
    }
    if (swRegistration) {
       swRegistration.showNotification('Lembrador de Contas', options)
    }
 }

 // urlB64ToUint8Array is a magic function that will encode the base64 public key
 // to Array buffer which is needed by the subscription option
 function urlB64ToUint8Array(base64String) {
     const padding = '='.repeat((4 - base64String.length % 4) % 4);
     const base64 = (base64String + padding)
       .replace(/-/g, '+')
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

   let subscription = await swRegistration.pushManager.getSubscription()
   const isSubscribed = !(subscription === null)
   if (!isSubscribed) {
      const publicKeyResponse = await send('GET', '/notifications/push/public_key')
      const parsed = JSON.parse(publicKeyResponse)
      if (!parsed.publicKey) {
         console.warn('Push notifications not available: server has no VAPID public key configured.')
         return
      }
      applicationServerPublicKey = urlB64ToUint8Array(parsed.publicKey)

      subscription = await swRegistration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: applicationServerPublicKey
      })
   }


   if (subscription === null) {
      console.error('Unable to subscribe to push notifications')
      return
   }

   await updateSubscriptionOnServer(subscription)
 }

 // eslint-disable-next-line no-unused-vars
 function unsubscribeUser() {
     swRegistration.pushManager.getSubscription()
     .then(function(subscription) {
       if (subscription) {
         return subscription.unsubscribe()
       }
     })
     .catch(function(error) {
      console.error('Unable to unsubscribe from push notifications:', error.name)
     })
     .then(function() {
       updateSubscriptionOnServer(null)
   
       isSubscribed = false
   
     //   updateBtn()
     });
   }

  async function send(method, url, data) {
     const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
     const headers = {
        // 'Accept': 'application/json',
        'Content-Type': 'application/json'
     };
     if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
     }

     const options = {
        method: method,
        headers: headers,
        body: JSON.stringify(data)
     }
    const rawContent = await fetch(url, options)
    const content = await rawContent.text()
    return content
 }

if ('serviceWorker' in navigator && 'PushManager' in window) {

   navigator.serviceWorker.register('/sw.js')
   .then(async function(swReg) {
      swRegistration = swReg
      requestNotificationPermission()
   })
   .catch(function(error) {
      console.error('Service worker registration failed:', error.name)
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

    // Show logged-in user email in navbar
    const userEmail = document.querySelector('meta[name="user-email"]')?.content;
    if (userEmail) {
        $('#navbar-user-email').text(userEmail);
    }

    // Populate CSRF token in navbar logout form
    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]')?.content;
    const logoutCsrfInput = document.getElementById('logout-csrf-token');
    if (csrfTokenMeta && logoutCsrfInput) {
        logoutCsrfInput.value = csrfTokenMeta;
    }

    // Highlight active nav link based on current path
    const path = window.location.pathname.split('/')[1];
    $('.navbar-nav .nav-link').each(function() {
        const href = $(this).attr('href');
        if (href && href !== '/' && href.split('/')[1] === path && path !== '') {
            $(this).addClass('active');
        }
    });
 })

// Function to toggle between dark and light themes
function toggleTheme() {
   const root = document.documentElement;
   if (root.classList.contains('dark-theme')) {
       root.classList.remove('dark-theme');
       root.classList.add('light-theme');
       localStorage.setItem('theme', 'light-theme');
   } else {
       root.classList.remove('light-theme');
       root.classList.add('dark-theme');
       localStorage.setItem('theme', 'dark-theme');
   }
}

// Function to update the UI based on edit mode state
window.updateEditModeUI = function() {
   const isEditMode = localStorage.getItem('editMode') === 'true';
   const toggleBtn = document.getElementById('btn-toggle-edit-mode');
   
   // Update button text
   if (toggleBtn) {
       toggleBtn.textContent = isEditMode ? 'Desabilitar edição' : 'Habilitar edição';
   }
   
   // Toggle edit-mode-active on body so CSS controls .hidden-edit-mode visibility
   document.body.classList.toggle('edit-mode-active', isEditMode);
};

// Function to toggle edit mode for active bills
window.toggleEditMode = function() {
   const currentMode = localStorage.getItem('editMode') === 'true';
   const newMode = !currentMode;
   localStorage.setItem('editMode', newMode);
   window.updateEditModeUI();

   const billList = document.getElementById('billList');
   if (billList && typeof window.filterBills === 'function') {
       window.filterBills();
   }
};

// Initialize edit mode on page load
$(document).ready(function() {
   if (window.updateEditModeUI) {
       window.updateEditModeUI();
   }
});

// Delegated confirm handler for buttons with data-confirm attribute
document.addEventListener('click', function(event) {
    const btn = event.target.closest('[data-confirm]');
    if (btn && !confirm(btn.dataset.confirm)) {
        event.preventDefault();
        event.stopPropagation();
    }
});
// Navbar button event listeners (replacing inline onclick handlers)
document.addEventListener('click', function(event) {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
        case 'hide-toast':
            hideNotificationsToast();
            break;
        case 'notify-allow':
            requestNotificationPermission();
            break;
    }
});

$(document).ready(function() {
    // Theme toggle
    $('#btn-toggle-theme').on('click', toggleTheme);
    // Process bills (defined in dashboard page script)
    $('#btn-process-bills').on('click', function() {
        if (typeof window.processBills === 'function') window.processBills();
    });
    // Toggle edit mode (defined in main.js)
    $('#btn-toggle-edit-mode').on('click', window.toggleEditMode);
});