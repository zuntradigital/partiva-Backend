-- Extends the roles system for custom roles + per-user extra permissions,
-- replacing the previously hardcoded ROLE_PERMISSIONS object in
-- permissions.ts as the source of truth (that file now reads from these
-- tables via an in-memory cache, reloaded on any write).
ALTER TABLE roles ADD COLUMN name_ar VARCHAR(100) NULL AFTER name;

CREATE TABLE IF NOT EXISTS role_permissions (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id INT UNSIGNED NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_role_permissions (role_id, resource, action),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive per-user grants on top of whatever their role(s) already allow --
-- no deny/revoke concept, matching the "effective = role + extra" model.
CREATE TABLE IF NOT EXISTS user_permissions (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  granted_by INT UNSIGNED NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_permissions (user_id, resource, action),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
