CREATE TABLE IF NOT EXISTS courier_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  heading REAL,
  speed_mps REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id)
);
CREATE INDEX IF NOT EXISTS idx_courier_locations_agent_at ON courier_locations(agent_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_courier_locations_at ON courier_locations(recorded_at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('gps_ping_interval_s', '20'),
  ('gps_max_speed_kmh', '120'),
  ('gps_max_accuracy_m', '100');
