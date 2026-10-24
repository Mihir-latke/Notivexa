# Notivexa — Production Deployment & Configuration Checklist

**Target Platform:** Render.com (Web Service)  
**Database:** MongoDB Atlas (M0 Free Tier or Dedicated Cluster)  
**Branch:** `fix/security-and-testing`  

---

## 1. Pre-Deployment Configuration Checklist

Before initiating deployment on Render, verify that all mandatory environment variables are generated and prepared.

### Environment Variables Matrix

| Variable Name | Required | Default / Recommended Value | Description |
|---|---|---|---|
| `NODE_ENV` | **YES** | `production` | Enables production optimizations, strict CORS, and security guards. |
| `PORT` | **YES** | `10000` | Port assigned by Render or container runner. |
| `JWT_SECRET` | **YES** | *High-entropy string (min 32 chars)* | Cryptographic secret used for signing and verifying user JWT tokens. Render can auto-generate this. |
| `MONGODB_URI` | **YES** | `mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/notivexa?retryWrites=true&w=majority` | Primary production database connection string. |
| `ALLOWED_ORIGINS` | **YES** | `https://notivexa.onrender.com` | Comma-separated list of permitted frontend origins for CORS. |
| `ALLOW_DEMO_MODE` | OPTIONAL | `false` | When `false`, demo login bypasses are completely disabled. Set to `true` only for staging demo environments. |
| `MAX_PAGES` | OPTIONAL | `100` | Maximum page limit for document extraction to protect server memory. |
| `MAX_FILE_SIZE_MB`| OPTIONAL | `50` | Maximum allowed file upload size. |
| `UPLOADS_DIR` | OPTIONAL | `/var/data/uploads` | Path to persistent storage directory for uploaded files and extracted images. |
| `DATA_DIR` | OPTIONAL | `/var/data/store` | Path to persistent directory for fallback metadata. |
| `RUN_DB_SYNC` | OPTIONAL | `false` | Set to `true` on initial deployment if migrating legacy accounts from local store. |

> [!CAUTION]
> **Secret Rotation Rule:** Do NOT reuse passwords or connection strings that have been previously committed to public Git history. Generate a new database user in MongoDB Atlas with a random 32+ character alphanumeric password.

---

## 2. MongoDB Atlas Setup & Network Whitelist

1. **Create Database User:**
   - Go to **MongoDB Atlas** -> **Database Access** -> **Add New Database User**.
   - Authentication Method: **Password**.
   - Database User Privileges: `Read and write to any database` (or restricted to `notivexa` database).
   - Generate a strong password (copy and URL-encode special characters if necessary).

2. **Configure Network Access:**
   - Go to **Network Access** -> **IP Access List** -> **Add IP Address**.
   - Add `0.0.0.0/0` (Allow Access from Anywhere) because Render web service outbound IPs are dynamic.
   - Note: MongoDB Atlas requires valid SCRAM-SHA-256 credentials, so `0.0.0.0/0` is protected by database user authentication.

3. **Verify Database Connection String:**
   - The connection string format must be:
     ```text
     mongodb+srv://<username>:<password>@cluster0.t09sptg.mongodb.net/notivexa?retryWrites=true&w=majority
     ```

---

## 3. Render Web Service Configuration

### Option A: Automated Blueprint Deployment (`render.yaml`)
Notivexa includes an audited `render.yaml` configuration. In the Render Dashboard:
1. Click **Blueprints** -> **New Blueprint Instance**.
2. Connect repository: `https://github.com/Mihir-latke/Notivexa.git` (branch: `fix/security-and-testing`).
3. Render reads `render.yaml` automatically:
   - Builds frontend and backend dependencies in one build step.
   - Automatically generates a 64-character `JWT_SECRET`.
   - Prompts for `MONGODB_URI`.

### Option B: Manual Service Configuration
1. Go to **Render Dashboard** -> **New** -> **Web Service**.
2. Connect your Git repository.
3. Configure the following fields:
   - **Name:** `notivexa`
   - **Region:** Frankfurt (EU Central) or Oregon (US West) (choose the region closest to your MongoDB Atlas cluster).
   - **Branch:** `fix/security-and-testing`
   - **Runtime:** `Node`
   - **Build Command:**
     ```bash
     npm run build
     ```
     *(This runs root `npm install`, frontend build, and backend setup)*
   - **Start Command:**
     ```bash
     npm start
     ```
     *(This starts the backend production server serving both the API and frontend build)*
   - **Instance Type:** Starter (recommended for OCR operations, min 512MB RAM).

4. **Add Persistent Disk (Recommended):**
   - In service settings, click **Disks** -> **Add Disk**.
   - **Name:** `notivexa-storage`
   - **Mount Path:** `/var/data`
   - **Size:** 1 GB (or as desired)
   - Add Environment Variables:
     - `UPLOADS_DIR = /var/data/uploads`
     - `DATA_DIR = /var/data/store`

---

## 4. Post-Deployment Verification Steps

Once Render displays **Deploy live**, execute these verification commands:

### 1. Health Probe Verification
```bash
curl -i https://<your-render-subdomain>.onrender.com/api/health
```
**Expected Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok",
  "database": {
    "connected": true,
    "state": "connected",
    "provider": "MongoDB Atlas"
  },
  "auth": {
    "demoModeEnabled": false
  }
}
```

### 2. Setup Configuration Verification
```bash
curl -i https://<your-render-subdomain>.onrender.com/api/setup
```
**Expected Response:**
```json
HTTP/1.1 200 OK
{
  "hasTTS": false,
  "edgeTTS": true,
  "features": { ... }
}
```

### 3. User Registration & Login Smoke Test
```bash
# Register
curl -X POST https://<your-render-subdomain>.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Tester","email":"smoke.test@example.com","password":"StrongPassword123!"}'

# Login
curl -X POST https://<your-render-subdomain>.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke.test@example.com","password":"StrongPassword123!"}'
```

### 4. Upload & Offline OCR Verification
- Log in through the web UI at `https://<your-render-subdomain>.onrender.com`.
- Upload a standard PDF or scanned document.
- Verify progress indicator completes and notes/flashcards/mindmap are generated cleanly.

---

## 5. Rollback & Troubleshooting Procedures

| Symptom | Probable Cause | Immediate Remediation |
|---|---|---|
| Server aborts on startup with `FATAL SECURITY CONFIGURATION ERROR` | `JWT_SECRET` is missing or shorter than 32 characters. | In Render Dashboard -> Environment, set `JWT_SECRET` to a 32+ character random string. |
| `/api/health` returns `503 Service Unavailable` | MongoDB Atlas connection failed or IP blocked. | Check MongoDB Atlas Network Access: add `0.0.0.0/0`. Verify username and password in `MONGODB_URI`. |
| CORS error in browser console when calling API | Origin not listed in `ALLOWED_ORIGINS`. | Set `ALLOWED_ORIGINS` to include your production domain (e.g. `https://notivexa.onrender.com`). |
| Uploaded images or documents disappear after restart | Ephemeral filesystem restarted without persistent disk. | Mount a Render Persistent Disk at `/var/data` and configure `UPLOADS_DIR=/var/data/uploads`. |
| Out of Memory (OOM) during OCR | Too many concurrent OCR workers for 512MB instance. | The server defaults to 2 workers; set `TESSERACT_WORKERS=1` to limit memory usage on Starter tier. |

