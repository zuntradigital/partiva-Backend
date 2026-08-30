INSERT IGNORE INTO roles (name, description) VALUES
  ('Super Admin', 'Full access to all Admin Dashboard functionality, including Roles/Permissions management and the Audit Log'),
  ('Content Manager', 'Manages Pages, Articles, Categories/Tags, FAQ, Testimonials, Navigation, Footer, Contact Info'),
  ('Editor', 'Creates and edits Draft content; submits for review; cannot Approve or Publish'),
  ('SEO Manager', 'Edits SEO metadata across all content types'),
  ('Pricing Manager', 'Edits and Drafts Pricing content; Publish requires a separately granted Pricing-Publish permission');
