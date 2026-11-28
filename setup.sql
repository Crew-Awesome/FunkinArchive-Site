PRAGMA foreign_keys = ON;

CREATE TABLE "user" (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  banner TEXT,
  username TEXT,
  username_changed_at TEXT
);

CREATE UNIQUE INDEX user_username_unique_idx ON "user" (username COLLATE NOCASE) WHERE username IS NOT NULL;

CREATE TABLE resources (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL,
  original_by TEXT,
  recreation_by TEXT,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  file_types TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(file_types)),
  cover_key TEXT,
  download_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  from_mod TEXT,
  cover_url TEXT,
  download_url TEXT,
  submitted_by_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  alternate_downloads TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(alternate_downloads))
);

CREATE INDEX resources_created_at_idx ON resources (created_at DESC);
CREATE INDEX resources_updated_at_idx ON resources (updated_at DESC);
CREATE INDEX resources_category_idx ON resources (category);
CREATE INDEX resources_status_idx ON resources (status);
CREATE INDEX resources_submitted_by_user_id_idx ON resources (submitted_by_user_id);

CREATE TABLE "session" (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON "session" (userId);

CREATE TABLE "account" (
  id TEXT NOT NULL PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);
CREATE INDEX account_userId_idx ON "account" (userId);

CREATE TABLE "verification" (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);
CREATE INDEX verification_identifier_idx ON "verification" (identifier);

CREATE TABLE resource_ratings (
  resource_id TEXT NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  rating REAL NOT NULL CHECK (
    rating >= 0.5 AND rating <= 5 AND rating * 2 = CAST(rating * 2 AS INTEGER)
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (resource_id, user_id)
);
CREATE INDEX resource_ratings_user_id_idx ON resource_ratings (user_id);

CREATE TABLE resource_reports (
  id TEXT NOT NULL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'leaked_private_content', 'paid_download', 'unrelated_resource', 'credit_problem',
    'spam_duplicate_misleading', 'community_safety', 'unsafe_download',
    'broken_cover', 'broken_download', 'incorrect_details', 'other'
  )),
  target_field TEXT CHECK (target_field IS NULL OR target_field IN ('content', 'cover', 'download', 'alternate_download', 'metadata')),
  target_index INTEGER,
  details TEXT NOT NULL,
  suggested_url TEXT,
  suggested_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX resource_reports_status_created_idx ON resource_reports (status, created_at DESC);
CREATE INDEX resource_reports_resource_status_idx ON resource_reports (resource_id, status, reason_code, target_field, target_index);
CREATE INDEX resource_reports_reporter_created_idx ON resource_reports (reporter_user_id, created_at DESC);

CREATE TABLE resource_report_actions (
  id TEXT NOT NULL PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES resource_reports (id) ON DELETE CASCADE,
  admin_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('investigate', 'dismiss', 'resolve', 'apply_fix', 'reject_resource')),
  target_field TEXT,
  before_value TEXT,
  after_value TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX resource_report_actions_report_idx ON resource_report_actions (report_id, created_at DESC);

CREATE TABLE user_restrictions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('ban', 'mute', 'restrict_submissions')),
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_by_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT,
  revoked_by_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  revoke_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX user_restrictions_active_idx ON user_restrictions (user_id, action, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE user_admin_actions (
  id TEXT NOT NULL PRIMARY KEY,
  target_user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  admin_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('ban', 'mute', 'restrict_submissions', 'lift_restriction', 'reset_profile', 'resource_status')),
  before_value TEXT,
  after_value TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX user_admin_actions_target_idx ON user_admin_actions (target_user_id, created_at DESC);

CREATE TABLE site_admins (
  user_id TEXT PRIMARY KEY NOT NULL
);
INSERT INTO site_admins (user_id) VALUES
  ('R78Vlok05SHyIsotnJawi4aOCE4YdzCG'),
  ('t84aWRoiowk902k2aI6dS1WmMlCHt9ba');

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO site_settings (key, value) VALUES
  ('auto_approval', 'false'),
  ('submissions_locked', 'false');

