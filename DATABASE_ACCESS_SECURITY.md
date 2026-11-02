# NOTIVEXA — DATABASE ACCESS SECURITY & CLONE ISOLATION ARCHITECTURE

## 1. Overview & Security Model

The Notivexa platform follows a strict **Zero-Trust Clone Isolation Model**. The core principle is that cloning the public GitHub repository grants access to the application source code only — **never to the original developer's database, user accounts, documents, or cloud infrastructure.**

```
               [ Public GitHub Repository ]
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   [ Cloned Local Copy ]       [ Production Deployment ]
             │                           │
  • No MONGODB_URI in git     • Secrets injected via Render
  • Connects to Local Mongo   • MONGODB_URI required at boot
    (127.0.0.1:27017) or       (Process fails safely if missing)
    Autonomous Local Store    • Connects to Production Atlas
  • ZERO access to original   • Production users & documents
    developer's database        strictly protected
```

---

## 2. Environment Variables & Credential Lifecycle

### 2.1 Backend Environment Variables
All sensitive credentials are consumed exclusively by the Node.js Express backend and loaded via `dotenv`:
- `MONGODB_URI`: Dedicated MongoDB connection string.
- `JWT_SECRET`: Secret key used for HMAC-SHA256 signing and verification of user JWT tokens.
- `FRONTEND_URL`: Allowed Origin for CORS requests.
- `ALLOW_DEMO_MODE`: Set to `false` in production.

### 2.2 Frontend Vite Isolation
- The React/Vite frontend communicates with the backend exclusively via reverse proxy (`/api`) and HTTP APIs.
- No `VITE_MONGODB_URI`, `VITE_DB_URL`, or database credentials exist or are permitted in frontend code or build artifacts.
- The compiled bundle in `frontend/dist/assets` contains zero database connection strings or secrets.

---

## 3. Cloned Project Behavior

When a user clones the repository from GitHub:

1. **No `.env` File Exists:**
   Git ignores `.env`, `.env.*`, and `backend/.env`. A fresh clone contains only `.env.example` with safe placeholder values.

2. **Automatic Local Fallback:**
   If the developer starts the application without setting `MONGODB_URI`:
   - `resolveMongoUri()` identifies that no URI is configured.
   - It targets local MongoDB (`mongodb://127.0.0.1:27017/notivexa`).
   - If local MongoDB is not running, the application logs a clear setup notice:
     ```
     ========================================================================
     ℹ️  NOTIVEXA DATABASE SETUP: Cloned Instance / No Database Configured
     ========================================================================
     Notice: MONGODB_URI is not configured in backend environment variables.
     To isolate data and prevent unauthorized access, this cloned instance
     will NEVER connect to the original developer's database.
     ========================================================================
     ```
   - In development, the application operates in autonomous local storage mode without crashing, storing local test data in `backend/data/` (which is also ignored by Git).
   - In the frontend Dashboard, a security notice indicates that the clone is running in isolated storage mode.

3. **No Connection to Developer's Database:**
   At no point does the application fall back to the developer's remote database or production cluster.

---

## 4. Production Deployment Guidelines (Render & MongoDB Atlas)

### 4.1 MongoDB Atlas Configuration

1. **Create a Dedicated Production User:**
   - Go to **Database Access** in MongoDB Atlas.
   - Click **Add New Database User**.
   - Authentication Method: **Password**.
   - Assign a unique username (e.g. `notivexa_prod_app`).
   - Generate a strong password of at least 32 characters.
   - Database User Privileges: Select **Built-in Role** -> **Read and write to any database**, or restrict specifically to the `notivexa` database.

2. **Network Access (IP Whitelisting):**
   - Go to **Network Access** -> **IP Access List**.
   - Render web services use dynamic outbound IP addresses. Add `0.0.0.0/0` with a comment (e.g. `Render Production Web Service`).
   - Atlas enforces mandatory SCRAM-SHA-256 password authentication for every connection.

3. **Obtain Connection String:**
   - In Atlas, go to **Clusters** -> **Connect** -> **Drivers**.
   - Format:
     ```text
     mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/notivexa?retryWrites=true&w=majority
     ```

### 4.2 Render Environment Variables Injection

In the Render Dashboard (`https://dashboard.render.com`):
1. Navigate to your Web Service -> **Environment**.
2. Set the following environment variables:
   - `NODE_ENV`: `production`
   - `PORT`: `5000`
   - `MONGODB_URI`: Your Atlas connection string with real username and password.
   - `JWT_SECRET`: A cryptographically secure random string of at least 32 characters.
   - `FRONTEND_URL`: `https://notivexa.onrender.com` (or custom domain).
   - `ALLOW_DEMO_MODE`: `false`

3. **Production Fail-Safe Verification:**
   In production (`NODE_ENV=production`), `backend/server.js` verifies on boot that `MONGODB_URI` is present and valid. If `MONGODB_URI` is missing or contains placeholder tokens, the server logs a fatal error and terminates immediately (`process.exit(1)`).

---

## 5. Multi-Tenant Authorization & IDOR Protections

All private resources require authentication and strict ownership verification:

| Resource | Protection Mechanism | Behavior on Unauthorized Access |
|---|---|---|
| **Documents (`/api/documents/:id`)** | Query filtered by `{ _id: docId, user: req.userId }` | Returns `404 Not Found` (IDOR prevention) |
| **Document Files (`/api/documents/:id/file`)** | Ownership verified before reading disk storage | Returns `404 Not Found` |
| **Flashcard Sets (`/api/flashcards/:id`)** | Query filtered by `{ _id: id, user: req.userId }` | Returns `404 Not Found` |
| **Study Plans (`/api/planner/:id`)** | Query filtered by `{ _id: id, user: req.userId }` | Returns `404 Not Found` |
| **Video Lectures (`/uploads/video/:filename`)** | Ownership verified against `Document.outputs` and `VideoJob` | Returns `403 Forbidden` (`Access denied`) |
| **Audio Lectures (`/uploads/audio/:filename`)** | Ownership verified against `Document.outputs` and `VideoJob` | Returns `403 Forbidden` (`Access denied`) |
| **Generated Notes (`/uploads/generated/:filename`)** | Ownership verified against `Document.outputs` | Returns `403 Forbidden` (`Access denied`) |
| **Raw PDF/Doc Storage (`/uploads/docs`, `/uploads/pdfs`)** | Direct static access permanently blocked | Returns `403 Forbidden` (`Direct access forbidden`) |

---

## 6. HTTPS, CORS & Network Security

- **Strict CORS Policy:** Whitelists only verified domain origins (`localhost:3000`, `localhost:5173`, `notivexa.com`, `notivexa.onrender.com`, `FRONTEND_URL`). Unauthorized cross-origin requests are rejected with `403 Forbidden`.
- **Security Headers (Helmet):** Configures security headers including `Cross-Origin-Resource-Policy: cross-origin` and `X-Content-Type-Options: nosniff`.
- **Rate Limiting:**
  - Global API: 500 requests per 15 minutes.
  - Authentication (`/api/auth`): 150 requests per 15 minutes.
  - AI Generation (`/api/generate`, `/api/chatbot`, `/api/video-studio`): 30 requests per minute.

