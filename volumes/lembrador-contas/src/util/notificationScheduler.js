import logger from './logger.js';
import WebPush from 'web-push';

// Lazy import db to avoid circular dependency with www/app
// `db.js` lives in src/, so from src/util this should be ../db.js
const getDb = async () => (await import('../db.js')).default;

let schedulerInterval = null;

/**
 * Start the notification scheduler.
 * Runs checkAndNotify() on a fixed interval (default: every hour).
 */
export function startScheduler() {
    const intervalMs = parseInt(process.env.NOTIFICATION_CHECK_INTERVAL || '3600000', 10);
    const reminderDays = parseInt(process.env.REMINDER_DAYS || '3', 10);

    logger.info({ intervalMs, reminderDays }, 'Notification scheduler started');

    // Lazy-load db module and wait for connection before first run
    getDb().then((db) => {
        const waitForConnection = () => {
            return new Promise((resolve) => {
                if (db.Mongoose?.connection?.readyState === 1) {
                    resolve();
                    return;
                }
                let timer;
                const handler = async () => {
                    if (timer) clearTimeout(timer);
                    await checkAndNotify(db, reminderDays);
                    await cleanupExpiredSubscriptions(db);
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
                    await checkAndNotify(db, reminderDays);
                    await cleanupExpiredSubscriptions(db);
                } catch (err) {
                    logger.error({ err }, 'Notification scheduler run failed');
                }
            }, intervalMs);
        });
    }).catch((err) => {
        logger.error({ err }, 'Notification scheduler failed to load database module');
    });
}

/**
 * Stop the notification scheduler.
 */
export function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info('Notification scheduler stopped');
    }
}

/**
 * Check for unpaid bills due soon and send push notifications.
 * Idempotent: skips bills that already have a reminder with notifiedAt set.
 */
export async function checkAndNotify(db, reminderDays) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidMailto = process.env.VAPID_MAILTO;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidMailto) {
        logger.warn('VAPID credentials are missing; skipping notification check');
        return;
    }

    try {
        const now = new Date();
        const dueDateLimit = new Date();
        dueDateLimit.setDate(now.getDate() + reminderDays);
        dueDateLimit.setHours(23, 59, 59, 999);

        // Find UNPAID active bills within the reminder window
        const unpaidBills = await db.ActiveBill.find({
            status: 'UNPAID',
            dueDate: { $gte: now, $lte: dueDateLimit }
        }).lean();

        if (!unpaidBills.length) {
            logger.debug('No unpaid bills within reminder window');
            return;
        }

        logger.info({ unpaidBillCount: unpaidBills.length }, 'Found bills within notification window');

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
                logger.debug({ billId: billIdStr }, 'Bill reminder already exists');
                continue;
            }

            const title = 'Lembrador de Contas: Conta próxima do vencimento!';
            const body = `A conta "${bill.name}" vence em ${reminderDays} dia(s).`;

            // Send push to all subscriptions
            await sendPushToAll(db, { title, body });

            // Create a BillReminder record with notifiedAt to prevent duplicates
            if (billIdStr) {
                const reminder = new db.BillReminder({
                    title,
                    body,
                    status: 'CREATED',
                    dueDate: bill.dueDate,
                    daysBeforeDue: reminderDays,
                    activeBill: bill._id,
                    notifiedAt: new Date()
                });
                await reminder.save();
                logger.info({ billId: billIdStr }, 'Created bill reminder');
            }
        }
    } catch (err) {
        logger.error({ err }, 'Notification check failed');
    }
}

/**
 * Send a push notification to all active subscriptions.
 */
async function sendPushToAll(db, { title, body }) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidMailto = process.env.VAPID_MAILTO;

    try {
        const subscriptions = await db.PushNotificationSubscription.find({}).lean();

        if (!subscriptions.length) {
            logger.debug('No active push subscriptions');
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
                logger.debug('Push notification delivered');
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    logger.warn({ statusCode: err.statusCode }, 'Push subscription expired; removing it');
                    await db.PushNotificationSubscription.deleteOne({ _id: sub._id });
                } else {
                    logger.error({ errorName: err.name, statusCode: err.statusCode }, 'Failed to send push notification');
                }
            }
        }
    } catch (err) {
        logger.error({ err }, 'Failed to send push notifications');
    }
}

/**
 * Clean up expired or gone subscriptions.
 */
async function cleanupExpiredSubscriptions(db) {
    try {
        const subscriptions = await db.PushNotificationSubscription.find({}).lean();
        let removed = 0;

        for (const sub of subscriptions) {
            // Remove if past expiration time
            if (sub.expirationTime && new Date(sub.expirationTime) < new Date()) {
                await db.PushNotificationSubscription.deleteOne({ _id: sub._id });
                logger.info('Removed expired push subscription');
                removed++;
            }
        }

        if (removed > 0) {
                logger.info({ removedCount: removed }, 'Cleaned up expired push subscriptions');
        }
    } catch (err) {
        logger.error({ err }, 'Failed to clean up expired push subscriptions');
    }
}
