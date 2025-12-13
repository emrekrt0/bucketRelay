require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('./database');

async function runMigrations() {
    const db = new Database();

    console.log('Running database migrations...\n');

    try {
        await db.testConnection();

        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        await db.query(schema);
        console.log('✓ Schema applied\n');

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
