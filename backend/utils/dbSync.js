const mongoose = require('mongoose');
const { User, Document, Flashcard, Plan } = require('../models');
const localStore = require('./localStore');
const { seedUsers } = require('./seed');

function isDatabaseConfigured() {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (
    trimmed === '' ||
    trimmed.includes('<db_password>') ||
    trimmed.includes('<password>') ||
    trimmed.includes('<username>') ||
    trimmed.includes('YOUR_') ||
    trimmed.includes('cluster0.xxxxx.mongodb.net') ||
    trimmed.includes('cluster0.xxx.mongodb.net')
  ) {
    return false;
  }
  return true;
}

function resolveMongoUri(inputUri) {
  const isProd = process.env.NODE_ENV === 'production';
  let uri = inputUri || process.env.MONGODB_URI;

  if (uri && typeof uri === 'string') {
    uri = uri.trim();
  }

  const isInvalidOrPlaceholder = !uri ||
    uri === '' ||
    uri.includes('<db_password>') ||
    uri.includes('<password>') ||
    uri.includes('<username>') ||
    uri.includes('YOUR_') ||
    uri.includes('cluster0.xxxxx.mongodb.net') ||
    uri.includes('cluster0.xxx.mongodb.net');

  if (isInvalidOrPlaceholder) {
    if (isProd) {
      return null;
    }
    return process.env.DEV_MONGODB_URI || 'mongodb://127.0.0.1:27017/notivexa';
  }
  return uri;
}

let isSyncing = false;

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Migrates registered users and documents from local memory/disk store into MongoDB Atlas.
 * This ensures no registered user or data is lost even if created while offline or during deployment startup.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - When true, inspects and logs without writing to database.
 */
async function syncLocalDataToMongo(options = {}) {
  const { dryRun = false } = options;
  if (!dryRun) {
    if (mongoose.connection.readyState !== 1 || isSyncing) {
      return { ok: false, reason: 'Database not connected or migration in progress' };
    }
    isSyncing = true;
  }
  const stats = { userSyncCount: 0, docSyncCount: 0, skippedUsers: 0, skippedDocs: 0, dryRun };

  try {
    console.log(`🔄 [DB Sync] ${dryRun ? '[DRY-RUN] ' : ''}Inspecting local accounts & assets for MongoDB Atlas synchronization...`);

    // 1. Ensure standard demo accounts exist in MongoDB ONLY if demo mode is explicitly enabled
    const allowDemo = process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
    if (allowDemo && !dryRun) {
      try {
        await seedUsers();
      } catch (e) {
        console.warn('[DB Sync] seedUsers warning:', e.message);
      }
    }

    // 2. Synchronize all registered users from localStore into MongoDB
    const localUsers = localStore.getUsers() || [];
    const candidateUsers = [];

    for (const u of localUsers) {
      if (!u || !u.email) continue;
      const normEmail = u.email.toLowerCase().trim();
      const maskedEmail = normEmail.replace(/(^.).*(@.*$)/, '$1***$2');

      // Do NOT migrate demo accounts into production
      const isDemoAccount = u.isDemo === true || normEmail === 'student@demo.com' || normEmail === 'teacher@demo.com';
      if (isDemoAccount && process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
        stats.skippedUsers++;
        continue;
      }

      // Password security check: skip records lacking valid bcrypt hash
      const hash = u.passwordHash;
      if (!hash || !BCRYPT_HASH_REGEX.test(hash)) {
        console.warn(`[DB Sync] Skipped account "${maskedEmail}": missing or invalid bcrypt password hash.`);
        stats.skippedUsers++;
        continue;
      }

      candidateUsers.push({ ...u, normEmail, maskedEmail });
    }

    if (candidateUsers.length > 0) {
      const candidateEmails = candidateUsers.map(u => u.normEmail);
      const existingUserDocs = await User.find({ email: { $in: candidateEmails } }, { email: 1 }).lean();
      const existingEmailSet = new Set(existingUserDocs.map(u => u.email.toLowerCase()));

      for (const u of candidateUsers) {
        if (existingEmailSet.has(u.normEmail)) {
          continue;
        }

        try {
          const doc = {
            name: u.name || 'Student',
            email: u.normEmail,
            password: u.passwordHash,
            role: u.role === 'teacher' && allowDemo ? 'teacher' : 'student',
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

          if (dryRun) {
            console.log(`[DB Sync DRY-RUN] Would migrate registered account to MongoDB: ${u.maskedEmail}`);
          } else {
            await User.collection.insertOne(doc);
            console.log(`[DB Sync] ✅ Saved registered account to MongoDB Atlas: ${u.maskedEmail}`);
          }
          existingEmailSet.add(u.normEmail);
          stats.userSyncCount++;
        } catch (err) {
          console.warn(`[DB Sync] Error migrating user ${u.maskedEmail}:`, err.message);
          stats.skippedUsers++;
        }
      }
    }

    if (stats.userSyncCount > 0) {
      console.log(`🎉 [DB Sync] ${dryRun ? '[DRY-RUN] Would migrate' : 'Successfully migrated'} ${stats.userSyncCount} user account(s) to MongoDB Atlas.`);
    }

    // 3. Synchronize local documents into MongoDB with strict ownership check
    const localDocs = localStore.getDocs() || [];
    const candidateDocs = [];
    const neededOwnerIds = new Set();
    const candidateDocIds = [];

    for (const d of localDocs) {
      if (!d || d.isDemo) continue;
      const dId = d._id || d.id;
      if (!dId || !mongoose.Types.ObjectId.isValid(dId)) {
        stats.skippedDocs++;
        continue;
      }

      // Validate owner reference exists and is valid
      const ownerId = d.user;
      if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
        console.warn(`[DB Sync] Skipped document "${d.title}" (${dId}): invalid owner reference.`);
        stats.skippedDocs++;
        continue;
      }

      candidateDocs.push({ ...d, dId: String(dId), ownerId: String(ownerId) });
      candidateDocIds.push(new mongoose.Types.ObjectId(dId));
      neededOwnerIds.add(new mongoose.Types.ObjectId(ownerId));
    }

    if (candidateDocs.length > 0) {
      const existingDocList = await Document.find({ _id: { $in: candidateDocIds } }, { _id: 1 }).lean();
      const existingDocIdSet = new Set(existingDocList.map(doc => String(doc._id)));

      let existingOwnerIdSet = new Set();
      if (!dryRun && neededOwnerIds.size > 0) {
        const existingUsers = await User.find({ _id: { $in: Array.from(neededOwnerIds) } }, { _id: 1 }).lean();
        existingOwnerIdSet = new Set(existingUsers.map(u => String(u._id)));
      }

      for (const d of candidateDocs) {
        if (existingDocIdSet.has(d.dId)) {
          continue;
        }

        if (!dryRun && !existingOwnerIdSet.has(d.ownerId)) {
          console.warn(`[DB Sync] Skipped document "${d.title}" (${d.dId}): owner ${d.ownerId} not found in database.`);
          stats.skippedDocs++;
          continue;
        }

        try {
          const docToInsert = { ...d };
          delete docToInsert.id;
          delete docToInsert.dId;
          delete docToInsert.ownerId;
          docToInsert.user = new mongoose.Types.ObjectId(d.ownerId);
          docToInsert._id = new mongoose.Types.ObjectId(d.dId);

          if (dryRun) {
            console.log(`[DB Sync DRY-RUN] Would migrate document "${d.title}" for owner ${d.ownerId}`);
          } else {
            await Document.collection.insertOne(docToInsert);
          }
          existingDocIdSet.add(d.dId);
          stats.docSyncCount++;
        } catch (err) {
          console.warn(`[DB Sync] Error migrating document ${d.dId}:`, err.message);
          stats.skippedDocs++;
        }
      }
    }

    if (stats.docSyncCount > 0) {
      console.log(`🎉 [DB Sync] ${dryRun ? '[DRY-RUN] Would migrate' : 'Successfully migrated'} ${stats.docSyncCount} document(s) to MongoDB Atlas.`);
    }

  } catch (err) {
    console.warn('[DB Sync Exception]', err.message);
  } finally {
    isSyncing = false;
  }
  return stats;
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
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected successfully to: ${uri.includes('127.0.0.1') ? 'Local MongoDB' : 'Configured Database Cluster'}`);
    if (process.env.NODE_ENV !== 'production' || process.env.RUN_DB_SYNC === 'true') {
      await syncLocalDataToMongo();
    }
  } catch (err) {
    const now = Date.now();
    if (now - lastErrorLoggedTime > 30000) {
      if (uri.includes('127.0.0.1') || uri.includes('localhost')) {
        console.warn(`ℹ️  [Local Database] Could not connect to local MongoDB at ${uri}: ${err.message}`);
        console.warn('👉 Tip: Start MongoDB locally or set MONGODB_URI in backend/.env to connect to your own MongoDB Atlas cluster.');
      } else {
        console.warn('⚠️  MongoDB connection failed:', err.message);
        console.warn('👉 Tip: Check your database credentials and whitelist your server IP in MongoDB Atlas Network Access.');
      }
      lastErrorLoggedTime = now;
    }
  } finally {
    isConnecting = false;
  }
}

async function ensureDbState(maxWaitMs = 4000) {
  if (mongoose.connection.readyState === 1) return true;

  const uri = resolveMongoUri();

  if (mongoose.connection.readyState === 0 && uri) {
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

function startMongoManager(inputUri) {
  const uri = resolveMongoUri(inputUri);
  const isConfigured = isDatabaseConfigured();

  if (!isConfigured && process.env.NODE_ENV !== 'test') {
    console.log('\n========================================================================');
    console.log('ℹ️  NOTIVEXA DATABASE SETUP: Cloned Instance / No Database Configured');
    console.log('========================================================================');
    console.log('Notice: MONGODB_URI is not configured in backend environment variables.');
    console.log('To isolate data and prevent unauthorized access, this cloned instance');
    console.log('will NEVER connect to the original developer\'s database.\n');
    console.log('To configure your own database:');
    console.log('  1. Local MongoDB (Recommended for local dev):');
    console.log('     Start mongod on 127.0.0.1:27017 (Auto-detected)');
    console.log('  2. Dedicated MongoDB Atlas Cluster:');
    console.log('     Set MONGODB_URI in backend/.env with your own connection string.');
    console.log('========================================================================\n');
  }

  if (!uri) return;

  attemptMongoConnect(uri);

  if (!reconnectTimer) {
    reconnectTimer = setInterval(() => {
      if (mongoose.connection.readyState !== 1) {
        attemptMongoConnect(uri);
      }
    }, 15000);
    if (reconnectTimer.unref) reconnectTimer.unref();
  }
}

module.exports = {
  isDatabaseConfigured,
  resolveMongoUri,
  ensureDbState,
  syncLocalDataToMongo,
  attemptMongoConnect,
  startMongoManager
};

