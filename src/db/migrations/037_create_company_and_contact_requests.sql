-- Website → Dashboard lead capture. Two genuinely separate submission types,
-- each its own table (the existing `contact_info` table is a hard singleton
-- -- CHECK (id = 1), see 017_create_contact_info.sql -- for the site's
-- published contact details; it cannot and must not be reused to hold a
-- list of individual visitor submissions).

-- "Join Partiva" / "Register Your Company" website form (RegisterContent.tsx).
-- Shown in the Dashboard as "Potential Clients".
CREATE TABLE IF NOT EXISTS company_requests (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  trade_name VARCHAR(150) NOT NULL,
  -- Unique so the website's already-built "this CR number is already
  -- registered" (409) UX -- present in RegisterContent.tsx before this
  -- backend existed -- has a real duplicate to detect.
  cr_number VARCHAR(20) NOT NULL,
  business_activity ENUM('retail','wholesale','importer','workshop') NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  status ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
  admin_note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_requests_cr_number (cr_number),
  KEY idx_company_requests_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Contact Us" / "Send Message" website form (ContactContent.tsx).
-- Shown in the Dashboard as "Contact Requests".
CREATE TABLE IF NOT EXISTS contact_messages (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20) NULL,
  inquiry_type ENUM('sales','support','partnership','press','other') NOT NULL,
  message VARCHAR(2000) NOT NULL,
  status ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contact_messages_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
