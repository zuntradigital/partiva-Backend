CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(150) NULL,
  user_email VARCHAR(255) NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(50) NULL,
  resource_label VARCHAR(300) NULL,
  details VARCHAR(1000) NULL,
  result ENUM('success', 'failure') NOT NULL DEFAULT 'success',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_log_created (created_at),
  KEY idx_audit_log_user (user_id),
  CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user "last seen notifications" marker -- lets the notification bell
-- compute an unread count/state without a separate per-notification
-- read-tracking table, since notifications are just a formatted view of
-- recent audit_log entries.
ALTER TABLE admin_users
  ADD COLUMN notifications_read_at TIMESTAMP NULL DEFAULT NULL;
