CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  pass_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_level   INTEGER NOT NULL DEFAULT 0,
  red_value    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_cabinets (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  level         INTEGER NOT NULL DEFAULT 0,
  total_value   INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection_id)
);

CREATE TABLE IF NOT EXISTS cabinet_submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  value         INTEGER NOT NULL,
  is_red        INTEGER NOT NULL,
  submitted_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_progress_level ON player_profiles(best_level DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_progress_red ON player_profiles(red_value DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON cabinet_submissions(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS player_saves (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
