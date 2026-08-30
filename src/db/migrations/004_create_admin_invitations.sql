CREATE TABLE IF NOT EXISTS admin_invitations (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  invited_by INT UNSIGNED NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_invitations_token_hash (token_hash),
  KEY idx_admin_invitations_user_id (user_id),
  CONSTRAINT fk_admin_invitations_user FOREIGN KEY (user_id)
    REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_invitations_role FOREIGN KEY (role_id)
    REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_invitations_invited_by FOREIGN KEY (invited_by)
    REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
