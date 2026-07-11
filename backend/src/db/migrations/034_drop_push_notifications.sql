-- Remove FCM push notification tables if they were created by 033_push_notifications.sql.

DROP TABLE IF EXISTS push_delivery_log;
DROP TABLE IF EXISTS push_device_tokens;
DROP TABLE IF EXISTS employee_notification_preferences;
