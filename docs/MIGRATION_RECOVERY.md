# Notivexa — Database Migration & Disaster Recovery Guide

**Purpose:** Comprehensive guide for migrating local data assets into MongoDB Atlas, verifying migration integrity, and executing recovery procedures.

---

## 1. Migration Overview & Architecture

Notivexa includes an autonomous data synchronization and CLI migration engine:
- **Source:** Local JSON file store (`backend/data/store.json` or `$DATA_DIR/store.json`).
- **Target:** Remote MongoDB Atlas database collections (`users`, `documents`, `studyplans`).
- **Security & Integrity Filters:**
  1. **Demo Account Exclusion:** In production (`NODE_ENV === 'production'`), demo accounts (`student@demo.com`, `teacher@demo.com`) are strictly skipped.
  2. **Bcrypt Hash Verification:** Accounts missing a valid 60-character bcrypt hash (`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`) are rejected to prevent migrating corrupted or plaintext password records.
  3. **Strict Document Ownership:** Documents with missing or orphaned owner references are skipped. The migration engine validates that the referenced owner exists in the database before inserting documents.
  4. **Idempotency & Batching:** Uses batch query lookups to prevent duplicate insertions and reduce network round-trips from hundreds of requests to just 3 batch queries.

---

## 2. Pre-Migration Backup Procedures

> [!IMPORTANT]
> Always create backups of both your local store and remote MongoDB Atlas cluster before executing write migrations.

### Step 1: Backup Local Store
```bash
# Windows PowerShell
Copy-Item "backend/data/store.json" "backend/data/store.json.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Linux / macOS
cp backend/data/store.json "backend/data/store.json.backup_$(date +%Y%m%d_%H%M%S)"
```

### Step 2: Backup MongoDB Atlas
In the **MongoDB Atlas Console**:
1. Navigate to **Deployment** -> **Databases**.
2. Select your cluster -> click **Backup** tab.
3. Click **Take Snapshot Now** to capture an immediate cluster snapshot.
4. Alternatively, use `mongodump` from the terminal:
   ```bash
   mongodump --uri="mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/notivexa" --out="./backup_$(date +%Y%m%d)"
   ```

---

## 3. Migration Dry-Run (Non-Destructive Inspection)

Before performing any real writes to MongoDB Atlas, execute the dry-run CLI:

```bash
npm run migrate:dry-run
# or directly:
node backend/utils/migrate.js --dry-run
```

### Sample Dry-Run Output:
```text
[DB Sync DRY-RUN] Inspecting local accounts & assets for MongoDB Atlas synchronization...
[DB Sync DRY-RUN] Would migrate registered account to MongoDB: a***@example.com
[DB Sync DRY-RUN] Would migrate registered account to MongoDB: b***@university.edu
[DB Sync DRY-RUN] Would migrate document "Biology Notes Chapter 3" for owner 6adc25b9696b0fcf0cc4c47e
🎉 [DB Sync] [DRY-RUN] Would migrate 2 user account(s) to MongoDB Atlas.
🎉 [DB Sync] [DRY-RUN] Would migrate 1 document(s) to MongoDB Atlas.

============================================================
 MIGRATION SUMMARY (DRY-RUN)
============================================================
 Mode:               DRY RUN (No data written)
 Users Checked:      82
 Users To Migrate:   2
 Users Skipped:      80 (Already exist, demo, or invalid hash)
 Documents Checked:  31
 Docs To Migrate:    1
 Docs Skipped:       30 (Already exist or invalid owner)
 Errors:             0
============================================================
```

---

## 4. Live Migration Execution

Once the dry-run output is inspected and confirmed:

```bash
npm run migrate
# or directly:
node backend/utils/migrate.js
```

### Verification Checks:
1. Verify migrated accounts in MongoDB Atlas:
   ```javascript
   // In mongosh or MongoDB Compass
   db.users.countDocuments({ role: "student" });
   db.documents.countDocuments();
   ```
2. Verify that no plaintext passwords exist in `users`:
   ```javascript
   db.users.find({ password: { $not: /^\$2/ } }).count(); // Must return 0
   ```
3. Test login with a migrated account through the frontend or API.

---

## 5. Rollback & Disaster Recovery Procedures

If corrupted records or unwanted data were migrated:

### Procedure A: Restore from MongoDB Atlas Snapshot
1. In the **MongoDB Atlas Console**, go to **Backup** -> **Snapshots**.
2. Select the pre-migration snapshot taken in Step 2.
3. Click **Restore** -> **Restore to this cluster** (or restore to a new test cluster to verify).

### Procedure B: Targeted Document / User Cleanup
If specific migrated batches need removal:
```javascript
// Connect to MongoDB Atlas via mongosh
use notivexa;

// Find documents migrated after a specific timestamp
db.documents.deleteMany({
  createdAt: { $gte: ISODate("2026-10-24T00:00:00Z") },
  status: "migrated"
});
```

### Procedure C: Restore Local JSON File Store
If `store.json` was corrupted:
```bash
# Windows PowerShell
Copy-Item "backend/data/store.json.backup_*" "backend/data/store.json" -Force

# Linux / macOS
cp backend/data/store.json.backup_* backend/data/store.json
```
Restart the Node.js server to reload the restored dataset into memory.
