-- WebSocket Relay Database Schema
-- PostgreSQL

-- Users table (whitelist)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Broadcasters table (users who can send broadcasts)
CREATE TABLE IF NOT EXISTS broadcasters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_broadcasters_user_id ON broadcasters(user_id);

-- Optional: Create a view for easy broadcaster lookup
CREATE OR REPLACE VIEW broadcaster_users AS
SELECT 
    u.id,
    u.username,
    u.created_at,
    u.is_active,
    b.id as broadcaster_id
FROM users u
INNER JOIN broadcasters b ON u.id = b.user_id
WHERE u.is_active = TRUE;
