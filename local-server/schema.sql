CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  picture_url TEXT,
  author TEXT,
  genres TEXT,
  collection TEXT,
  completed INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  name TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
