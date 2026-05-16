import logger from './logger.js';
import WebPush from 'web-push';

// Lazy import db to avoid circular dependency with www/app
const getDb = () => require('./db.js').default;

let schedulerInterval = null;

/**
 * Start the notification scheduler.
 * Runs checkAndNotify() on a fixed interval (default: every hour).
 */
export function startScheduler() {
    const intervalMs = parseInt(process.env.NOTIFICATION_CHECK_INTERVAL || '3600000', 10);
    const reminderDays = parseInt(process.env.REMINDER_DAYS || '3', 10);

    logger.info(`[NotificationScheduler] Starting scheduler (interval: ${intervalMs}ms, reminderDays: ${reminderDays})`);

    // Defer first run until Mongoose finishes connecting to MongoDB
    const db = getDb();
    const waitForConnection = () => {
        return new Promise((resolve) => {
            if (db.Mongoose?.connection?.readyState === 1) {
                resolve();
                return;
            }
            let timer;
            const handler = async () => {
                if (timer) clearTimeout(timer);
                await checkAndNotify();
                cleanupExpiredSubscriptions();
                resolve();
            };
            db.Mongoose?.connection?.once('open', handler);
            // Fallback: after 10 seconds, run anyway
            timer = setTimeout(handler, 10000);
        });
    };

    waitForConnection().then(() => {
        schedulerInterval = setInterval(async () => {
            try {
                await checkAndNotify();
                cleanupExpiredSubscriptions();
            } catch (err) {
                logger.error('[NotificationScheduler] Error in scheduled run:', err);
            }
        }, intervalMs);
    });
}

/**
 * Stop the notification scheduler.
 */
export function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info('[NotificationScheduler] Scheduler stopped.');
    }
}

/**
 * Check for unpaid bills due soon and send push notifications.
 * Idempotent: skips bills that already have a reminder with notifiedAt set.
 */
export async function checkAndNotify() {
    const reminderDays = parseInt(process.env.REMINDER_DAYS || '3', 10);
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidMailto = process.env.VAPID_MAILTO;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidMailto) {
        logger.warn('[NotificationScheduler] VAPID credentials not set. Skipping notification check.');
        return;
    }

    try {
        const now = new Date();
        const dueDateLimit = new Date();
        dueDateLimit.setDate(now.getDate() + reminderDays);
        dueDateLimit.setHours(23, 59, 59, 999);

        // Find UNPAID active bills within the reminder window
        const db = getDb();
        const unpaidBills = await db.ActiveBill.find({
            status: 'UNPAID',
            dueDate: { $gte: now, $lte: dueDateLimit }
        }).lean();

        if (!unpaidBills.length) {
            logger.info('[NotificationScheduler] No unpaid bills within reminder window.');
            return;
        }

        logger.info(`[NotificationScheduler] Found ${unpaidBills.length} unpaid bill(s) within reminder window.`);

        // Get existing reminders to avoid duplicates
        const existingReminders = await db.BillReminder.find({}).lean();
        const notifiedBillIds = new Set(
            existingReminders
                .filter(r => r.notifiedAt !== null && r.activeBill != null)
                .map(r => r.activeBill.toString())
        );

        for (const bill of unpaidBills) {
            const billIdStr = bill._id ? bill._id.toString() : null;

            // Skip if already notified
            if (billIdStr && notifiedBillIds.has(billIdStr)) {
                logger.info(`[NotificationScheduler] Bill "${bill.name}" already notified, skipping.`);
                continue;
            }

            const title = 'Lembrador de Contas: Conta próxima do vencimento!';
            const body = `A conta "${bill.name}" vence em ${reminderDays} dia(s).`;

            // Send push to all subscriptions
            await sendPushToAll({ title, body });

            // Create a BillReminder record with notifiedAt to prevent duplicates
            if (billIdStr) {
                const reminder = new db.BillReminder({
                    title,
                    body,
                    status: 'Criado',
                    dueDate: bill.dueDate,
                    daysBeforeDue: reminderDays,
                    activeBill: bill._id,
                    notifiedAt: new Date()
                });
                await reminder.save();
                logger.info(`[NotificationScheduler] Created BillReminder for bill "${bill.name}" (id: ${billIdStr}).`);
            }
        }
    } catch (err) {
        logger.error('[NotificationScheduler] Error in checkAndNotify:', err);
    }
}

/**
 * Send a push notification to all active subscriptions.
 */
async function sendPushToAll({ title, body }) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidMailto = process.env.VAPID_MAILTO;

    try {
        const subscriptions = await getDb().PushNotificationSubscription.find({}).lean();

        if (!subscriptions.length) {
            logger.info('[NotificationScheduler] No active subscriptions.');
            return;
        }

        const payload = JSON.stringify({ title, body });

        for (const sub of subscriptions) {
            try {
                await WebPush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.keys.p256dh,
                            auth: sub.keys.auth
                        }
                    },
                    payload,
                    { vapidDetails: { subject: `mailto:${vapidMailto}`, publicKey: vapidPublicKey, privateKey: vapidPrivateKey } }
                );
                logger.info(`[NotificationScheduler] Push sent to endpoint: ${sub.endpoint.substring(0, 50)}...`);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    logger.warn(`[NotificationScheduler] Subscription expired (${err.statusCode}). Removing.`);
                    await getDb().PushNotificationSubscription.deleteOne({ _id: sub._id });
                } else {
                    logger.error(`[NotificationScheduler] Failed to send push:`, err.message);
                }
            }
        }
    } catch (err) {
        logger.error('[NotificationScheduler] Error in sendPushToAll:', err);
    }
}

/**
 * Clean up expired or gone subscriptions.
 */
async function cleanupExpiredSubscriptions() {
    try {
        const subscriptions = await getDb().PushNotificationSubscription.find({}).lean();
        let removed = 0;

        for (const sub of subscriptions) {
            // Remove if past expiration time
            if (sub.expirationTime && new Date(sub.expirationTime) < new Date()) {
                await getDb().PushNotificationSubscription.deleteOne({ _id: sub._id });
                logger.info(`[NotificationScheduler] Removed expired subscription (expirationTime: ${sub.expirationTime}).`);
                removed++;
            }
        }

        if (removed > 0) {
            logger.info(`[NotificationScheduler] Cleaned up ${removed} expired subscription(s).`);
        }
    } catch (err) {
        logger.error('[NotificationScheduler] Error in cleanupExpiredSubscriptions:', err);
    }
}
