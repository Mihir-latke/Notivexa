const mongoose = require('mongoose');
const { User, Document, Flashcard, Plan } = require('../models');
const localStore = require('./localStore');
const { seedUsers } = require('./seed');

const DEFAULT_MONGODB_URI = 'mongodb+srv://Notivexa:Notivexa@cluster0.t09sptg.mongodb.net/notivexa?retryWrites=true&w=majority&appName=Cluster0';

function resolveMongoUri(inputUri) {
  let uri = inputUri || process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  if (uri.includes('<db_password>')) {
    uri = uri.replace('<db_password>', 'Notivexa');
  }
  if (!uri || uri.includes('<username>') || uri.includes('<password>') || uri.includes('YOUR_')) {
    uri = DEFAULT_MONGODB_URI;
  }
  return uri;
}

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
        if (!mongoose.Types.ObjectId.isValid(dId)) {
          continue;
        }
        const exists = await Document.findById(dId);
        if (!exists) {
          const docToInsert = { ...d };
          delete docToInsert.id;
          if (docToInsert.user && mongoose.Types.ObjectId.isValid(docToInsert.user)) {
            docToInsert.user = new mongoose.Types.ObjectId(docToInsert.user);
          } else {
            docToInsert.user = new mongoose.Types.ObjectId('507f191e810c19729de860ea');
          }
          docToInsert._id = new mongoose.Types.ObjectId(dId);
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
 * Attempts a connection exclusively to MongoDB Atlas.
 */
async function attemptMongoConnect(inputUri) {
  const uri = resolveMongoUri(inputUri);
  if (!uri || isConnecting || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  isConnecting = true;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('✅ MongoDB Atlas connected successfully!');
    await syncLocalDataToMongo();
  } catch (err) {
    const now = Date.now();
    // Throttle duplicate warning logs to once every 30 seconds
    if (now - lastErrorLoggedTime > 30000) {
      console.warn('⚠️  MongoDB Atlas connection failed:', err.message);
      console.warn('👉 Tip: Whitelist IP 0.0.0.0/0 in MongoDB Atlas Network Access');
      lastErrorLoggedTime = now;
    }
  } finally {
    isConnecting = false;
  }
}

/**
 * Ensures MongoDB connection is ready or actively being connected before continuing critical operations.
 */
async function ensureDbState(maxWaitMs = 4000) {
  if (mongoose.connection.readyState === 1) return true;

  const uri = resolveMongoUri();

  if (mongoose.connection.readyState === 0) {
    attemptMongoConnect(uri).catch(() => {});
  }

  if (mongoose.connection.readyState === 2 || mongoose.connection.readyState === 0) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, maxWaitMs);
      const onConnected = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };
      const onError = () => {
        clearTimeout(timer);
        cleanup();
        resolve();
      };
      const cleanup = () => {
        mongoose.connection.removeListener('connected', onConnected);
        mongoose.connection.removeListener('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
  }
  return mongoose.connection.readyState === 1;
}

/**
 * Initializes MongoDB connection and starts persistent background reconnect loop.
 */
function startMongoManager(inputUri) {
  const uri = resolveMongoUri(inputUri);

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
  DEFAULT_MONGODB_URI,
  resolveMongoUri,
  ensureDbState,
  syncLocalDataToMongo,
  attemptMongoConnect,
  startMongoManager
};

