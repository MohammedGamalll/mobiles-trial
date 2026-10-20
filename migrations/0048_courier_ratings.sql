CREATE TABLE IF NOT EXISTS courier_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  invoice_id INTEGER,
  rating INTEGER NOT NULL,
  note TEXT,
  on_time INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_courier_ratings_agent ON courier_ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_courier_ratings_invoice ON courier_ratings(invoice_id);
