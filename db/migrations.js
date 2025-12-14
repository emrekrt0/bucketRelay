require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('./database');

async function runMigrations() {
    const db = new Database();

    console.log('Running database migrations...\n');

    try {
        await db.testConnection();

        // Create table if not exists
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await db.query(schema);
        console.log('✓ Schema applied');

        // Add is_admin column if it doesn't exist (for existing tables)
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name = 'users' AND column_name = 'is_admin') THEN
                    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        console.log('✓ is_admin column ensured');

        // Apply schema_v2 - connection_events table
        const schema2Path = path.join(__dirname, 'schema_v2.sql');
        if (fs.existsSync(schema2Path)) {
            const schema2 = fs.readFileSync(schema2Path, 'utf8');
            await db.query(schema2);
            console.log('✓ connection_events table ensured');
        }

        const users = await db.getAllUsers();
        console.log(`Current users: ${users.length}`);

    } catch (error) {
        console.error('✗ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

if (require.main === module) {
    runMigrations();
}

module.exports = runMigrations;
