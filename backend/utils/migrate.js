/**
 * migrate.js — Safe, Idempotent CLI Database Migration Utility
 * 
 * Usage:
 *   node backend/utils/migrate.js --dry-run   (Test without altering database)
 *   node backend/utils/migrate.js             (Perform live migration)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveMongoUri, syncLocalDataToMongo } = require('./dbSync');

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  const uri = resolveMongoUri(process.env.MONGODB_URI);

  if (!uri) {
    console.error('❌ [Migration Error] No valid MONGODB_URI configured. Set MONGODB_URI in environment.');
    process.exit(1);
  }

  console.log(`🚀 [Migration Utility] Starting migration ${isDryRun ? '(DRY-RUN MODE)' : '(LIVE MODE)'}...`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Connected to MongoDB Atlas.');

    const result = await syncLocalDataToMongo({ dryRun: isDryRun });

    console.log('\n📊 ════════ Migration Summary ════════');
    console.log(`   Mode:           ${isDryRun ? 'DRY-RUN (No changes written)' : 'LIVE'}`);
    console.log(`   Users Migrated: ${result.userSyncCount || 0}`);
    console.log(`   Users Skipped:  ${result.skippedUsers || 0}`);
    console.log(`   Docs Migrated:  ${result.docSyncCount || 0}`);
    console.log(`   Docs Skipped:   ${result.skippedDocs || 0}`);
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Migration utility completed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ [Migration Exception]', err.message);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
