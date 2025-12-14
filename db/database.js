const { Pool } = require('pg');

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    async query(text, params) {
        try {
            const res = await this.pool.query(text, params);
            return res;
        } catch (error) {
            console.error('[DB ERROR]', { text, error: error.message });
            throw error;
        }
    }

    // Check if username is whitelisted
    async isUserWhitelisted(username) {
        try {
            const result = await this.query(
                'SELECT is_active FROM users WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 && result.rows[0].is_active;
        } catch (error) {
            return false;
        }
    }

    // Check if user is a broadcaster
    async isBroadcaster(username) {
        try {
            const result = await this.query(
                'SELECT is_broadcaster FROM users WHERE username = $1 AND is_active = TRUE',
                [username]
            );
            return result.rows.length > 0 && result.rows[0].is_broadcaster;
        } catch (error) {
            return false;
        }
    }

    // Check if user is an admin
    async isAdmin(username) {
        try {
            const result = await this.query(
                'SELECT is_admin FROM users WHERE username = $1 AND is_active = TRUE',
                [username]
            );
            return result.rows.length > 0 && result.rows[0].is_admin;
        } catch (error) {
            return false;
        }
    }

    // Add user (receiver only by default)
    async addUser(username, isBroadcaster = false) {
        const result = await this.query(
            `INSERT INTO users (username, is_broadcaster) VALUES ($1, $2) 
             ON CONFLICT (username) DO UPDATE SET is_active = TRUE 
             RETURNING id`,
            [username, isBroadcaster]
        );
        return result.rows[0];
    }

    // Add broadcaster (convenience method)
    async addBroadcaster(username) {
        const result = await this.query(
            `INSERT INTO users (username, is_broadcaster) VALUES ($1, TRUE) 
             ON CONFLICT (username) DO UPDATE SET is_broadcaster = TRUE, is_active = TRUE 
             RETURNING id`,
            [username]
        );
        return result.rows[0];
    }

    // Add admin (full permissions)
    async addAdmin(username) {
        const result = await this.query(
            `INSERT INTO users (username, is_broadcaster, is_admin) VALUES ($1, TRUE, TRUE) 
             ON CONFLICT (username) DO UPDATE SET is_broadcaster = TRUE, is_admin = TRUE, is_active = TRUE 
             RETURNING id`,
            [username]
        );
        return result.rows[0];
    }

    // Remove user (soft delete)
    async removeUser(username) {
        await this.query('UPDATE users SET is_active = FALSE WHERE username = $1', [username]);
        return true;
    }

    // Revoke broadcaster permission (user stays as receiver)
    async removeBroadcaster(username) {
        await this.query('UPDATE users SET is_broadcaster = FALSE WHERE username = $1', [username]);
        return true;
    }

    // Get all users
    async getAllUsers() {
        const result = await this.query(
            'SELECT id, username, is_broadcaster, created_at FROM users WHERE is_active = TRUE ORDER BY created_at DESC'
        );
        return result.rows;
    }

    // Get all broadcasters
    async getAllBroadcasters() {
        const result = await this.query(
            'SELECT id, username, created_at FROM users WHERE is_broadcaster = TRUE AND is_active = TRUE ORDER BY created_at DESC'
        );
        return result.rows;
    }

    // Test connection
    async testConnection() {
        try {
            await this.query('SELECT NOW()');
            console.log('✓ Database connected');
            return true;
        } catch (error) {
            console.error('✗ Database connection failed:', error.message);
            return false;
        }
    }

    async close() {
        await this.pool.end();
    }

    // ===== Connection Events Methods =====

    // Log a connection event
    async logConnectionEvent(username, ip, eventType, reason = null) {
        try {
            await this.query(
                `INSERT INTO connection_events (username, ip, event_type, disconnect_reason) 
                 VALUES ($1, $2, $3, $4)`,
                [username, ip, eventType, reason]
            );
        } catch (error) {
            console.error('[DB ERROR] Failed to log connection event:', error.message);
        }
    }

    // Get connection history for a specific user
    async getConnectionHistory(username, limit = 50) {
        try {
            const result = await this.query(
                `SELECT id, ip, event_type, disconnect_reason, created_at 
                 FROM connection_events 
                 WHERE username = $1 
                 ORDER BY created_at DESC 
                 LIMIT $2`,
                [username, limit]
            );
            return result.rows;
        } catch (error) {
            console.error('[DB ERROR] Failed to get connection history:', error.message);
            return [];
        }
    }

    // Get aggregated connection stats for graphs
    async getConnectionStats(hoursBack = 24) {
        try {
            // Validate hoursBack is a positive integer to prevent injection
            const validHours = Math.max(1, Math.min(168, parseInt(hoursBack) || 24)); // 1h to 7 days

            // Get hourly event counts using parameterized interval
            const result = await this.query(
                `SELECT 
                    date_trunc('hour', created_at) as hour,
                    event_type,
                    COUNT(*) as count
                 FROM connection_events 
                 WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
                 GROUP BY date_trunc('hour', created_at), event_type
                 ORDER BY hour ASC`,
                [validHours.toString()]
            );
            return result.rows;
        } catch (error) {
            console.error('[DB ERROR] Failed to get connection stats:', error.message);
            return [];
        }
    }

    // Get recent events across all users
    async getRecentEvents(limit = 20) {
        try {
            const result = await this.query(
                `SELECT id, username, ip, event_type, disconnect_reason, created_at 
                 FROM connection_events 
                 ORDER BY created_at DESC 
                 LIMIT $1`,
                [limit]
            );
            return result.rows;
        } catch (error) {
            console.error('[DB ERROR] Failed to get recent events:', error.message);
            return [];
        }
    }

    // Get user connection summary (for user detail view)
    async getUserConnectionSummary(username) {
        try {
            const result = await this.query(
                `SELECT 
                    COUNT(*) FILTER (WHERE event_type = 'connect') as total_connections,
                    COUNT(*) FILTER (WHERE event_type = 'disconnect') as total_disconnections,
                    COUNT(*) FILTER (WHERE event_type = 'auth_fail') as auth_failures,
                    COUNT(*) FILTER (WHERE event_type = 'kicked') as times_kicked,
                    MIN(created_at) as first_seen,
                    MAX(created_at) as last_seen
                 FROM connection_events 
                 WHERE username = $1`,
                [username]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('[DB ERROR] Failed to get user connection summary:', error.message);
            return null;
        }
    }

    // Cleanup old events (older than 7 days) - run weekly
    async cleanupOldEvents() {
        try {
            const result = await this.query(
                `DELETE FROM connection_events 
                 WHERE created_at < NOW() - INTERVAL '7 days'
                 RETURNING id`
            );
            const deleted = result.rowCount || 0;
            if (deleted > 0) {
                console.log(`[DB] Cleaned up ${deleted} old connection events`);
            }
            return deleted;
        } catch (error) {
            console.error('[DB ERROR] Failed to cleanup old events:', error.message);
            return 0;
        }
    }
}

module.exports = Database;

