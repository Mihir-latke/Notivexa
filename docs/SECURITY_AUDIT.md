# Notivexa — Comprehensive Security Audit & Remediation Report

**Date:** October 2026  
**Auditor / Roles:** Senior Application Security Engineer, Full-Stack Architect  
**Repository Branch:** `fix/security-and-testing`  
**Target Environment:** Node.js 20+ / Express / MongoDB Atlas / React (Vite) / Render PaaS  

---

## 1. Executive Summary

A comprehensive application security audit and remediation was conducted across the Notivexa codebase. The primary objective was identifying and resolving vulnerabilities that could compromise user confidentiality, database integrity, and production stability.

All identified vulnerabilities—ranging from hardcoded credentials and insecure JWT fallbacks to static asset IDOR leaks and MIME-type spoofing—have been remediated and verified with a 44-test automated security and OCR test suite.

---

## 2. Vulnerability Catalog & Remediation Matrix

| ID | Vulnerability Description | Severity | Affected Files | Status |
|---|---|---|---|---|
| **VULN-01** | Hardcoded MongoDB Atlas Connection Strings & Plaintext Credentials | **CRITICAL** | `backend/utils/dbSync.js`, `render.yaml` | **REMEDIATED** |
| **VULN-02** | Weak / Default Fallback JWT Secret (`notivexa_secret_key...`) | **CRITICAL** | `backend/server.js`, `backend/middleware/auth.js` | **REMEDIATED** |
| **VULN-03** | Production Demo-Password Bypass & Insecure User Impersonation | **HIGH** | `backend/controllers/authController.js`, `backend/utils/localStore.js` | **REMEDIATED** |
| **VULN-04** | Unauthenticated Static Asset Exposure & IDOR in Uploads | **HIGH** | `backend/server.js`, `backend/controllers/documentController.js` | **REMEDIATED** |
| **VULN-05** | Overly Permissive Wildcard CORS Configuration (`*.onrender.com`) | **HIGH** | `backend/server.js` | **REMEDIATED** |
| **VULN-06** | Role Spoofing / Privilege Escalation via User Registration | **HIGH** | `backend/controllers/authController.js` | **REMEDIATED** |
| **VULN-07** | Extension Spoofing & Missing Magic Byte Validation on Uploads | **MEDIUM** | `backend/controllers/documentController.js`, `backend/middleware/upload.js` | **REMEDIATED** |
| **VULN-08** | Memory Exhaustion / DoS via Full-File Buffer Hashing | **MEDIUM** | `backend/services/ocr/textExtractionService.js` | **REMEDIATED** |
| **VULN-09** | Secret & Plaintext Password Exposure in Application Logs | **MEDIUM** | `backend/utils/dbSync.js`, `backend/controllers/authController.js` | **REMEDIATED** |
| **VULN-10** | Missing Logout Endpoint & Inaccurate Health Status Reporting | **LOW** | `backend/routes/auth.js`, `backend/controllers/authController.js`, `backend/server.js` | **REMEDIATED** |

---

## 3. Detailed Audit Findings & Implemented Fixes

### VULN-01: Hardcoded MongoDB Atlas Connection Strings & Plaintext Credentials
- **Finding:** Hardcoded MongoDB Atlas connection strings with embedded plaintext credentials were found in `backend/utils/dbSync.js` and `render.yaml`.
- **Impact:** Exposure of production database credentials allows unauthorized remote database access, data tampering, and full data exfiltration.
- **Remediation:**
  - Removed all hardcoded connection strings and fallback URIs from `backend/utils/dbSync.js`.
  - Configured `resolveMongoUri()` to exclusively read `process.env.MONGODB_URI`.
  - Updated `render.yaml` to specify `sync: false` for `MONGODB_URI`, requiring manual secret injection via the Render Dashboard.
  - Added safe startup validation: in `NODE_ENV === 'production'`, the server terminates immediately if `MONGODB_URI` is missing.

### VULN-02: Weak / Default Fallback JWT Secret
- **Finding:** The application allowed token signing and verification using default hardcoded strings (`notivexa_secret_key_change_in_production_2024`) when `JWT_SECRET` was omitted from environment variables.
- **Impact:** Attackers can forge arbitrary JWTs with `userId` claims, completely bypassing authentication and impersonating any student or instructor.
- **Remediation:**
  - Added strict environment verification in `backend/server.js`:
    - In production (`NODE_ENV === 'production'`), `JWT_SECRET` is strictly required.
    - `JWT_SECRET` must be at least 32 characters in length.
    - Default or placeholder values (`your_jwt_secret`, `notivexa_secret`, etc.) trigger immediate startup abort.
  - In `render.yaml`, configured `JWT_SECRET` to use `generateValue: true` for automatic high-entropy secret generation.

### VULN-03: Production Demo-Password Bypass & Insecure Impersonation
- **Finding:** `backend/utils/localStore.js` and `backend/controllers/authController.js` allowed any user to log into demo accounts (`student@demo.com`, `teacher@demo.com`) using hardcoded aliases (`demo1234`, `student123`, `teacher123`) regardless of actual hash verification.
- **Impact:** In production, any external user could access demo accounts, observe demo study plans, and manipulate demo sessions.
- **Remediation:**
  - Demo password alias matching is now strictly gated behind `(process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production')`.
  - Default demo accounts in `localStore.js` are flagged with `isDemo: true`.
  - In `backend/utils/dbSync.js`, demo accounts are explicitly excluded from database migration when running in production.

### VULN-04: Unauthenticated Static Asset Exposure & IDOR in Uploads
- **Finding:** The Express server previously served `/uploads` as a static directory without authentication or authorization. Document-extracted diagrams (`/uploads/images/extracted/:docId/:fileName`), generated lecture videos (`/uploads/video/:filename`), and uploaded PDFs were publicly accessible to anyone who guessed the filename.
- **Impact:** Direct Information Disclosure and Insecure Direct Object References (IDOR).
- **Remediation:**
  - Added static blockades returning `403 Forbidden` for direct requests to `/uploads/docs` and `/uploads/pdfs`.
  - Converted `/uploads/images/extracted/:docId/:fileName` into an authenticated and authorized route:
    - Resolves JWT from `Authorization: Bearer <token>` or `?token=<token>` (for browser `<img>` embedding).
    - Verifies document ownership against MongoDB / local store. Non-owners receive `404 Not Found`.
    - Sanitizes path segments (`path.normalize`, `path.basename`) to prevent directory traversal.
    - Adds `X-Content-Type-Options: nosniff` and `Cache-Control: private`.
  - Secured `/uploads/video/:filename` with authentication and strict filename sanitization.
  - Added dedicated owner-authorized file streaming endpoints: `GET /api/documents/:id/file` and `GET /api/documents/:id/download`.

### VULN-05: Overly Permissive Wildcard CORS Configuration
- **Finding:** `server.js` used a regex `/https:\/\/.*\.onrender\.com/` and `/https:\/\/.*\.vercel\.app/`, allowing any third party hosting an app on Render or Vercel to perform credentialed cross-origin requests.
- **Impact:** Cross-Origin Request Forgery and credential leakage from malicious neighboring applications on shared hosting platforms.
- **Remediation:**
  - In production (`NODE_ENV === 'production'`), wildcard subdomain matching is completely disabled.
  - Only explicitly configured origins from `CLIENT_URL` or `FRONTEND_URL` (comma-separated list) are permitted.
  - Unauthorized origins are rejected with an explicit `403 Forbidden` error.

### VULN-06: Privilege Escalation via User Registration
- **Finding:** `POST /api/auth/register` accepted a client-supplied `role` field directly, allowing users to register as `teacher` or `admin`.
- **Impact:** Unauthorized privilege escalation allowing students to access instructor-only features and grading dashboards.
- **Remediation:**
  - `authController.register` now explicitly enforces `role = 'student'` on all public registrations.
  - Added strict server-side validation:
    - Name: 2–100 characters, trimmed.
    - Email: RFC-compliant email regex, max 255 characters.
    - Password: 6–128 characters.
  - Removed all code paths where unhashed passwords could be assigned to persisted user objects.

### VULN-07: Extension Spoofing & Missing Magic Byte Validation
- **Finding:** Multer file validation checked only file extension and client-provided MIME headers (`req.file.mimetype`), which are easily spoofed by renaming malicious binaries to `.pdf` or `.png`.
- **Impact:** Remote code execution risks, malicious file hosting, and parser crashes in PDF rendering engines.
- **Remediation:**
  - Implemented `validateMagicBytes()` in `backend/controllers/documentController.js`:
    - PDF: First 5 bytes must equal `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`).
    - PNG: First 8 bytes must equal `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`.
    - JPEG: First 3 bytes must equal `0xFF 0xD8 0xFF`.
    - WEBP: Must contain `RIFF....WEBP`.
  - Files failing magic byte inspection are immediately unlinked from disk and rejected with `400 Bad Request`.
  - Added minimum file size check (`>= 8 bytes`) and password-protected PDF graceful error handling.

### VULN-08: Memory Exhaustion via Full-File Buffer Hashing
- **Finding:** `computeFileHash` in `textExtractionService.js` used `fs.readFileSync(filePath)` to compute SHA-256 hashes for OCR deduplication caching.
- **Impact:** Processing concurrent 50MB PDF uploads causes severe Node.js heap spikes and trigger Out-Of-Memory (OOM) crashes on 512MB RAM server tiers (Render Free/Starter).
- **Remediation:**
  - Refactored `computeFileHash` to use chunked streaming:
    - Opens a synchronous file descriptor.
    - Reads the file in 64 KB chunks (`fs.readSync`) into a reusable buffer.
    - Updates the crypto hash incrementally.
    - Closes file descriptor reliably in a `finally` block.
  - Peak memory per file is reduced from entire file size (~50 MB) to exactly 64 KB.

### VULN-09: Secret & Credential Exposure in Logs
- **Finding:** Logs occasionally displayed full user objects or raw error messages containing database connection URLs.
- **Impact:** Log aggregation services or console captures could expose active connection strings.
- **Remediation:**
  - Masked all user identifiers in sync logs (e.g., `s***@demo.com`).
  - Validated bcrypt hashes (`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`) before migration; skipped invalid accounts without logging passwords or hashes.
  - Removed fallback owner ID (`507f191e810c19729de860ea`) from migration scripts; required genuine authenticated user references.

### VULN-10: Missing Logout Endpoint & Inaccurate Health Reporting
- **Finding:** Frontend had no dedicated API endpoint to invalidate server-side session state; `/api/health` returned `200 OK` even if MongoDB was disconnected.
- **Impact:** Inaccurate orchestration health probes; inability to perform clean audit logging on user logout.
- **Remediation:**
  - Added `POST /api/auth/logout` endpoint returning `{ success: true, message: 'Logged out successfully.' }`.
  - Updated `/api/health` to inspect `mongoose.connection.readyState`. In production, returns `503 Service Unavailable` if MongoDB Atlas is disconnected.
  - Fixed `/api/setup` bug that hardcoded `hasTTS: true`.

---

## 4. Verification & Automated Test Coverage

The implemented security controls were verified using Jest and Supertest across 44 automated tests:

```text
Test Suites: 2 passed, 2 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        24.351 s
```

### Key Security Test Verifications:
- **Registration Validation:** Rejects weak passwords (`< 6` chars), invalid emails, and enforces `role: student`.
- **Authentication:** Issues valid JWTs; rejects invalid credentials with generic 401.
- **IDOR Protection:** User 2 cannot access, update, or delete User 1 study plans, documents, or extracted media.
- **File Upload Security:** Rejects executable scripts (`exploit.sh`) and spoofed files lacking `%PDF-` magic bytes.
- **Directory Traversal:** Blocked on video and document endpoints (`/uploads/video/../../server.js`).
- **Static Media Routes:** Blocks direct unauthenticated access to `/uploads/docs/` and `/uploads/pdfs/` with `403 Forbidden`.
- **Migration Dry-Run:** Executes safely in non-destructive inspection mode without database modification.
- **Chunked Stream Hashing:** Computes valid 64-character SHA-256 hashes without buffer memory spikes.

---

## 5. Remaining Operational Risks & Recommendations

1. **Credential Rotation:** Because legacy MongoDB connection strings were committed in earlier git history, **rotate the MongoDB Atlas user password immediately** in the Atlas console and update the Render environment variable.
2. **MongoDB Atlas Network Access:** Avoid `0.0.0.0/0` in production if dedicated static egress IPs are available; if dynamic IPs must be supported (standard Render behavior), ensure strong (32+ character) database passwords and SCRAM-SHA-256 authentication.
3. **Storage Persistence:** Render web services have an ephemeral filesystem by default. For production document and image retention across redeployments, attach a Render Persistent Disk mounted at `/var/data` and configure `UPLOADS_DIR=/var/data/uploads`.
