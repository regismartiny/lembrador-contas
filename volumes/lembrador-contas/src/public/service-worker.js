self.registration = null

self.addEventListener('push', e => {

   if(self.Notification.permission == 'denied'){
       console.log("Permission wan't granted")
       return;
   }

   if(self.Notification.permission == 'default'){
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
   console.log(data)
   const options = {
      body: data.body
   }
   e.waitUntil(
      self.registration.showNotification(data.title,options)
   )
}