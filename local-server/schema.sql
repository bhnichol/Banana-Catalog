CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  picture_url TEXT,
  author TEXT,
  completed INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
