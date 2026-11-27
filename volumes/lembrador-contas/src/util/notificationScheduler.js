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
        const runCheck = async () => {
            try {
                await checkAndNotify(db, reminderDays);
                await cleanupExpiredSubscriptions(db);
            } catch (err) {
                logger.error({ err }, 'Notification scheduler run failed');
            }
        };

        const waitForConnection = () => {
            return new Promise((resolve) => {
                if (db.Mongoose?.connection?.readyState === 1) {
                    runCheck().then(resolve);
                    return;
                }
                let settled = false;
                let timer;
                const handler = async () => {
                    if (settled) return;
                    settled = true;
                    if (timer) clearTimeout(timer);
                    db.Mongoose?.connection?.off?.('open', handler);
                    await runCheck();
                    resolve();
                };
                db.Mongoose?.connection?.once?.('open', handler);
                // Fallback: after 10 seconds, run anyway
                timer = setTimeout(handler, 10000);
            });
        };

        waitForConnection().then(() => {
            schedulerInterval = setInterval(runCheck, intervalMs);
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

export function getDaysUntilDue(dueDate, now = new Date()) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(dueDate);
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    return Math.round((dueStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatDueMessage(billName, daysUntilDue) {
    if (daysUntilDue <= 0) {
        return `A conta "${billName}" vence hoje.`;
    }
    if (daysUntilDue === 1) {
        return `A conta "${billName}" vence amanhã.`;
    }
    return `A conta "${billName}" vence em ${daysUntilDue} dias.`;
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
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDateLimit = new Date(now);
        dueDateLimit.setDate(now.getDate() + reminderDays);
        dueDateLimit.setHours(23, 59, 59, 999);

        // Find UNPAID active bills within the reminder window
        const unpaidBills = await db.ActiveBill.find({
            status: 'UNPAID',
            dueDate: { $gte: todayStart, $lte: dueDateLimit }
        }).lean();

        if (!unpaidBills.length) {
            logger.debug('No unpaid bills within reminder window');
            return;
        }

        logger.info({ unpaidBillCount: unpaidBills.length }, 'Found bills within notification window');

        // Get existing reminders only for candidate bills to avoid loading full history
        const unpaidBillIds = unpaidBills.map(b => b._id).filter(Boolean);
        const existingReminders = await db.BillReminder.find({
            activeBill: { $in: unpaidBillIds },
            notifiedAt: { $ne: null }
        }).lean();
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

            const daysUntilDue = getDaysUntilDue(bill.dueDate, now);
            const title = 'Lembrador de Contas: Conta próxima do vencimento!';
            const body = formatDueMessage(bill.name, daysUntilDue);

            // Send push to all subscriptions
            const deliveredCount = await sendPushToAll(db, { title, body });

            // Create a BillReminder record only if at least one notification was delivered
            if (deliveredCount > 0 && billIdStr) {
                const reminder = new db.BillReminder({
                    title,
                    body,
                    status: 'CREATED',
                    dueDate: bill.dueDate,
                    daysBeforeDue: daysUntilDue,
                    activeBill: bill._id,
                    notifiedAt: new Date()
                });
                await reminder.save();
                logger.info({ billId: billIdStr, deliveredCount }, 'Created bill reminder');
            }
        }
    } catch (err) {
        logger.error({ err }, 'Notification check failed');
    }
}

/**
 * Send a push notification to all active subscriptions.
 * Returns the number of notifications delivered successfully.
 */
async function sendPushToAll(db, { title, body }) {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidMailto = process.env.VAPID_MAILTO;
    let deliveredCount = 0;

    try {
        const subscriptions = await db.PushNotificationSubscription.find({}).lean();

        if (!subscriptions.length) {
            logger.debug('No active push subscriptions');
            return 0;
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
                deliveredCount++;
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

    return deliveredCount;
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
