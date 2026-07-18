-- Question Insights: a second product built from aggregated, anonymous
-- question data. Nothing here can be joined back to an individual asker:
-- no free text, no IP, no device fingerprint, no billing identifiers.

CREATE TABLE IF NOT EXISTS insight_events (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  gate_decision TEXT NOT NULL CHECK (gate_decision IN ('SPEAK', 'STAY_SILENT', 'BLOCK')),
  wall_type TEXT,
  coordinates JSONB,
  outcomes JSONB,
  confidence TEXT CHECK (confidence IN ('firm', 'moderate', 'thin')),
  region TEXT,
  logged_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insight_events_domain_time ON insight_events (domain, logged_at);
CREATE INDEX IF NOT EXISTS idx_insight_events_domain_decision ON insight_events (domain, gate_decision);

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  rate_limit_per_hour INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quarterly_reports (
  id BIGSERIAL PRIMARY KEY,
  quarter TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  format TEXT NOT NULL DEFAULT 'markdown',
  content TEXT NOT NULL
);
