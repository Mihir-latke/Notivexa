const mongoose = require('mongoose');
const { User, Document, Flashcard, Plan } = require('../models');
const localStore = require('./localStore');
const { seedUsers } = require('./seed');

let isSyncing = false;

/**
 * Migrates registered users and documents from local memory/disk store into MongoDB Atlas.
 * This ensures no registered user or data is lost even if created while offline or during deployment startup.
 */
async function syncLocalDataToMongo() {
  if (mongoose.connection.readyState !== 1 || isSyncing) return;
  isSyncing = true;
  try {
    console.log('🔄 [DB Sync] Synchronizing local accounts & assets with MongoDB Atlas...');

    // 1. Ensure standard demo accounts exist in MongoDB
    try {
      await seedUsers();
    } catch (e) {
      console.warn('[DB Sync] seedUsers warning:', e.message);
    }

    // 2. Synchronize all registered users from localStore into MongoDB
    const localUsers = localStore.getUsers() || [];
    let userSyncCount = 0;

    for (const u of localUsers) {
      if (!u.email) continue;
      const normEmail = u.email.toLowerCase().trim();
      try {
        const existing = await User.findOne({ email: normEmail });
        if (!existing) {
          const doc = {
            name: u.name || 'Student',
            email: normEmail,
            // Use existing password hash or fallback
            password: u.passwordHash || u.password || 'notivexa_default_password_hash',
            role: u.role || 'student',
            institution: u.institution || '',
            preferredLanguage: u.preferredLanguage || 'English',
            isActive: u.isActive !== false,
            studyStats: u.studyStats || { documentsUploaded: 0, notesGenerated: 0, flashcardsCreated: 0 },
            createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
            updatedAt: new Date()
          };
          if (u._id && mongoose.Types.ObjectId.isValid(u._id)) {
            doc._id = new mongoose.Types.ObjectId(u._id);
          }
          await User.collection.insertOne(doc);
          userSyncCount++;
          console.log(`[DB Sync] ✅ Saved registered account to MongoDB Atlas: ${normEmail}`);
        }
      } catch (err) {
        console.warn(`[DB Sync] Error migrating user ${normEmail}:`, err.message);
      }
    }

    if (userSyncCount > 0) {
      console.log(`🎉 [DB Sync] Successfully migrated ${userSyncCount} user account(s) to MongoDB Atlas.`);
    }

    // 3. Synchronize local documents into MongoDB
    const localDocs = localStore.getDocs() || [];
    let docSyncCount = 0;

    for (const d of localDocs) {
      if (!d || d.isDemo) continue;
      const dId = d._id || d.id;
      if (!dId) continue;
      try {
        const exists = await Document.findById(dId);
        if (!exists) {
          const docToInsert = { ...d };
          delete docToInsert.id;
          if (docToInsert.user && mongoose.Types.ObjectId.isValid(docToInsert.user)) {
            docToInsert.user = new mongoose.Types.ObjectId(docToInsert.user);
          }
          if (mongoose.Types.ObjectId.isValid(dId)) {
            docToInsert._id = new mongoose.Types.ObjectId(dId);
          }
          await Document.collection.insertOne(docToInsert);
          docSyncCount++;
        }
      } catch (err) {
        console.warn(`[DB Sync] Error migrating document ${dId}:`, err.message);
      }
    }

    if (docSyncCount > 0) {
      console.log(`🎉 [DB Sync] Successfully migrated ${docSyncCount} document(s) to MongoDB Atlas.`);
    }

  } catch (err) {
    console.warn('[DB Sync Exception]', err.message);
  } finally {
    isSyncing = false;
  }
}

let reconnectTimer = null;
let isConnecting = false;
let lastErrorLoggedTime = 0;

/**
 * Attempts a connection to MongoDB Atlas.
 */
async function attemptMongoConnect(uri) {
  if (!uri || isConnecting || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  isConnecting = true;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB Atlas connected successfully!');
    await syncLocalDataToMongo();
  } catch (err) {
    const now = Date.now();
    // Throttle duplicate warning logs to once every 30 seconds
    if (now - lastErrorLoggedTime > 30000) {
      console.warn('⚠️  MongoDB connection failed:', err.message);
      console.warn('👉 Tip: Whitelist IP 0.0.0.0/0 in MongoDB Atlas Network Access');
      lastErrorLoggedTime = now;
    }
  } finally {
    isConnecting = false;
  }
}

/**
 * Initializes MongoDB connection and starts persistent background reconnect loop.
 */
function startMongoManager(uri) {
  if (!uri || uri.includes('<username>') || uri.includes('<password>') || uri.includes('YOUR_')) {
    console.log('ℹ️  No valid MONGODB_URI configured. Running in autonomous local store mode.');
    return;
  }

  // 1. Initial attempt
  attemptMongoConnect(uri);

  // 2. Continuous background reconnect loop (every 12 seconds)
  if (!reconnectTimer) {
    reconnectTimer = setInterval(() => {
      if (mongoose.connection.readyState !== 1) {
        attemptMongoConnect(uri);
      }
    }, 12000);
    if (reconnectTimer.unref) reconnectTimer.unref();
  }
}

module.exports = {
  syncLocalDataToMongo,
  attemptMongoConnect,
  startMongoManager
};
