const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const { User, Document, Flashcard, Chat, Plan } = require('./models');
const { seedUsers } = require('./utils/seed');

async function testAtlas() {
  const uri = process.argv[2] || process.env.MONGODB_URI;

  console.log('----------------------------------------------------');
  console.log('🔍 Testing MongoDB Atlas Connection...');
  console.log('----------------------------------------------------');

  if (!uri || uri.includes('localhost') || uri.includes('<username>') || uri.includes('<password>')) {
    console.error('❌ Error: Please provide a valid MongoDB Atlas connection string.');
    console.error('Usage: node test_atlas.js "mongodb+srv://user:pass@cluster0.xxx.mongodb.net/notivexa"');
    console.error('Or set MONGODB_URI in backend/.env');
    process.exit(1);
  }

  // Hide password in logs
  const maskedUri = uri.replace(/\/\/[^:]+:([^@]+)@/, '//***:***@');
  console.log(`Connecting to: ${maskedUri}`);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('✅ Connection established successfully!');

    console.log('📦 Initializing collections and seeding default demo accounts...');
    await seedUsers();

    const userCount = await User.countDocuments();
    console.log(`👤 Users in database: ${userCount}`);

    console.log('----------------------------------------------------');
    console.log('🎉 MongoDB Atlas is FULLY OPERATIONAL and ready for Notivexa!');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection Failed:');
    console.error(err.message);
    if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.error('👉 Tip: Check your database username and password in the connection string.');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('querySrv')) {
      console.error('👉 Tip: Check your cluster host domain in the connection string.');
    } else {
      console.error('👉 Tip: Ensure IP 0.0.0.0/0 (Allow access from anywhere) is added in Atlas Network Access.');
    }
    process.exit(1);
  }
}

testAtlas();
