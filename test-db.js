require('dotenv').config();
const Database = require('./db/database');

async function testDatabase() {
    console.log('Testing database connection and operations...\n');

    const db = new Database();

    try {
        // Test connection
        await db.testConnection();
        console.log('');

        // Add test user
        console.log('Adding test user...');
        await db.addUser('testuser');
        console.log('✓ User added\n');

        // Check whitelist
        console.log('Checking whitelist...');
        const isWhitelisted = await db.isUserWhitelisted('testuser');
        console.log(`✓ User whitelisted: ${isWhitelisted}\n`);

        // Add broadcaster
        console.log('Adding broadcaster...');
        await db.addBroadcaster('testuser');
        console.log('✓ Broadcaster added\n');

        // Check broadcaster
        console.log('Checking broadcaster status...');
        const isBroadcaster = await db.isBroadcaster('testuser');
        console.log(`✓ Is broadcaster: ${isBroadcaster}\n`);

        // Get all users
        console.log('Getting all users...');
        const users = await db.getAllUsers();
        console.log('Users:', users);
        console.log('');

        // Get all broadcasters
        console.log('Getting all broadcasters...');
        const broadcasters = await db.getAllBroadcasters();
        console.log('Broadcasters:', broadcasters);
        console.log('');

        console.log('✓ All database tests passed!');

    } catch (error) {
        console.error('✗ Database test failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

testDatabase();
