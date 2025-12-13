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
}

module.exports = Database;
