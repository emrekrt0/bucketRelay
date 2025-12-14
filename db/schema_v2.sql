-- WebSocket Relay Database Schema - Connection Events
-- PostgreSQL

-- Connection events table for tracking connection history
CREATE TABLE IF NOT EXISTS connection_events (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip VARCHAR(45),
    event_type VARCHAR(20) NOT NULL, -- 'connect', 'disconnect', 'auth_success', 'auth_fail', 'kicked', 'banned'
    disconnect_reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_conn_events_username ON connection_events(username);
CREATE INDEX IF NOT EXISTS idx_conn_events_created_at ON connection_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conn_events_type ON connection_events(event_type);
