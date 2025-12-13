require('dotenv').config();
const Database = require('./db/database');

async function seedDatabase() {
    console.log('🌱 Seeding database...\n');

    const db = new Database();

    try {
        await db.testConnection();

        // ekoBaba31 = admin (can send, receive, and manage users)
        await db.addAdmin('ekoBaba31');
        console.log('✓ ekoBaba31 added (admin)');

        // jewloema31 = receiver only
        await db.addUser('jewloema31');
        console.log('✓ jewloema31 added (receiver)');

        // Show current state
        console.log('\n📊 Users:');
        const users = await db.getAllUsers();
        users.forEach(u => {
            const role = u.is_broadcaster ? '📡 Broadcaster' : '📥 Receiver';
            console.log(`   • ${u.username} - ${role}`);
        });

        console.log('\n✅ Done!');

    } catch (error) {
        console.error('❌ Failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

seedDatabase();
