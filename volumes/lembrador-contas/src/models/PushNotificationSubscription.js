import mongoose from 'mongoose'

const pushNotificationSubscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: [true, 'O endpoint é obrigatório'] },
    expirationTIme: { type: Date },
    keys: { p256dh: {type: String, required: [true, 'O campo pd256dh é obrigatório'] }, auth: {type: String, required: [true, 'O campo auth é obrigatório'] } },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { collection: 'tablecollection' })

pushNotificationSubscriptionSchema.pre('save', function (next) {
    const currentDate = new Date()
    this.updated_at = currentDate
    if (!this.created_at)
        this.created_at = currentDate
    next()
})

const PushNotificationSubscription = mongoose.model('pushnotificationsubscriptioncollection', pushNotificationSubscriptionSchema, 'pushnotificationsubscriptioncollection')

export { PushNotificationSubscription }
