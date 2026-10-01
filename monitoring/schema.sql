-- Monitoring-only D1 database. No Supabase schema or application data is changed.
CREATE TABLE IF NOT EXISTS collector_state (
  name TEXT PRIMARY KEY, last_attempt_at TEXT NOT NULL, last_success_at TEXT,
  status TEXT NOT NULL, error_code TEXT, payload TEXT
);
CREATE TABLE IF NOT EXISTS samples (
  source TEXT NOT NULL, bucket TEXT NOT NULL, collected_at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(source, bucket)
);
CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY, at INTEGER NOT NULL, route TEXT NOT NULL, method TEXT NOT NULL,
  status INTEGER NOT NULL, duration_ms INTEGER NOT NULL, db_count INTEGER NOT NULL,
  db_ms INTEGER NOT NULL, db_failures INTEGER NOT NULL, outcome TEXT NOT NULL, sample_kind TEXT NOT NULL,
  slot TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS telemetry_at ON telemetry(at);
CREATE TABLE IF NOT EXISTS manual_usage (
  key TEXT PRIMARY KEY, value REAL NOT NULL, period_start TEXT NOT NULL,
  period_end TEXT NOT NULL, verified_at TEXT NOT NULL, scope TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
