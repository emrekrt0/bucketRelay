const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log('[DB]', { text, duration, rows: res.rowCount });
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
                'SELECT id, is_active FROM users WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 && result.rows[0].is_active;
        } catch (error) {
            console.error('Error checking whitelist:', error);
            return false;
        }
    }

    // Check if user is a broadcaster
    async isBroadcaster(username) {
        try {
            const result = await this.query(
                `SELECT b.id FROM broadcasters b
                 INNER JOIN users u ON u.id = b.user_id
                 WHERE u.username = $1 AND u.is_active = TRUE`,
                [username]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error checking broadcaster:', error);
            return false;
        }
    }

    // Add user to whitelist
    async addUser(username) {
        try {
            const result = await this.query(
                'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO UPDATE SET is_active = TRUE RETURNING id',
                [username]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Error adding user:', error);
            throw error;
        }
    }

    // Remove user from whitelist (soft delete)
    async removeUser(username) {
        try {
            await this.query(
                'UPDATE users SET is_active = FALSE WHERE username = $1',
                [username]
            );
            return true;
        } catch (error) {
            console.error('Error removing user:', error);
            return false;
        }
    }

    // Get user ID by username
    async getUserId(username) {
        try {
            const result = await this.query(
                'SELECT id FROM users WHERE username = $1',
                [username]
            );
            return result.rows.length > 0 ? result.rows[0].id : null;
        } catch (error) {
            console.error('Error getting user ID:', error);
            return null;
        }
    }

    // Add broadcaster permission
    async addBroadcaster(username) {
        try {
            // First ensure user exists
            let userId = await this.getUserId(username);
            if (!userId) {
                const user = await this.addUser(username);
                userId = user.id;
            }

            const result = await this.query(
                'INSERT INTO broadcasters (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING id',
                [userId]
            );
            return result.rows.length > 0 ? result.rows[0] : { id: 'exists' };
        } catch (error) {
            console.error('Error adding broadcaster:', error);
            throw error;
        }
    }

    // Remove broadcaster permission
    async removeBroadcaster(username) {
        try {
            const userId = await this.getUserId(username);
            if (!userId) return false;

            await this.query(
                'DELETE FROM broadcasters WHERE user_id = $1',
                [userId]
            );
            return true;
        } catch (error) {
            console.error('Error removing broadcaster:', error);
            return false;
        }
    }

    // Get all whitelisted users
    async getAllUsers() {
        try {
            const result = await this.query(
                'SELECT id, username, created_at, is_active FROM users ORDER BY created_at DESC'
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting users:', error);
            return [];
        }
    }

    // Get all broadcasters
    async getAllBroadcasters() {
        try {
            const result = await this.query(
                `SELECT u.id, u.username, b.created_at
                 FROM users u
                 INNER JOIN broadcasters b ON u.id = b.user_id
                 WHERE u.is_active = TRUE
                 ORDER BY b.created_at DESC`
            );
            return result.rows;
        } catch (error) {
            console.error('Error getting broadcasters:', error);
            return [];
        }
    }

    // Test connection
    async testConnection() {
        try {
            const result = await this.query('SELECT NOW()');
            console.log('✓ Database connection successful:', result.rows[0].now);
            return true;
        } catch (error) {
            console.error('✗ Database connection failed:', error.message);
            return false;
        }
    }

    // Close pool
    async close() {
        await this.pool.end();
    }
}

module.exports = Database;
