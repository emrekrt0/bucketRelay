require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('./database');

async function runMigrations() {
    const db = new Database();

    console.log('Starting database migrations...\n');

    try {
        // Test connection
        const connected = await db.testConnection();
        if (!connected) {
            throw new Error('Failed to connect to database');
        }

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema...');
        await db.query(schema);
        console.log('✓ Schema executed successfully\n');

        // Optional: Add seed data for testing
        if (process.env.SEED_DATA === 'true') {
            console.log('Adding seed data...');

            // Add test users
            await db.addUser('testuser1');
            await db.addUser('testuser2');
            await db.addUser('broadcaster1');

            // Make broadcaster1 a broadcaster
            await db.addBroadcaster('broadcaster1');

            console.log('✓ Seed data added\n');
        }

        console.log('✓ Migrations completed successfully!');

        // Show current state
        const users = await db.getAllUsers();
        const broadcasters = await db.getAllBroadcasters();

        console.log('\nCurrent database state:');
        console.log('Users:', users.length);
        console.log('Broadcasters:', broadcasters.length);

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
