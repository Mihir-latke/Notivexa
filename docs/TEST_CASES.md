# Notivexa — Automated & Manual Test Catalog

**Last Updated:** October 2026  
**Test Runner:** Jest 29+ (`npm test`) / Supertest / React Vite Dev Tools  
**Overall Execution Result:** 47 Passed / 0 Failed / 0 Blocked (100% Pass Rate)  

---

## 1. Automated Test Suite Summary

```text
PASS tests/api.test.js
PASS tests/ocr.test.js

Test Suites: 2 passed, 2 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        27.942 s
```

---

## 2. Automated Test Case Catalog

### Category 1: Health, Setup & Environment Configuration

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-ENV-01** | `GET /api/health` returns operational status and database state | HTTP 200, `{ status: 'ok', database: { ... } }` | HTTP 200, database state reported accurately | **PASS** |
| **TC-ENV-02** | `GET /api/setup` returns environment configuration | HTTP 200, includes `hasTTS`, `edgeTTS`, and `features` | HTTP 200, valid configuration returned | **PASS** |
| **TC-ENV-03** | Setup does not hardcode `hasTTS` to true without valid API keys | `res.body.hasTTS` is boolean based on genuine keys | Returns `false` when placeholder keys present | **PASS** |

---

### Category 2: Authentication & Authorization Security

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-AUTH-01** | `POST /api/auth/register` with missing required fields | HTTP 400, validation error message | HTTP 400 `Please provide name, email, and password.` | **PASS** |
| **TC-AUTH-02** | `POST /api/auth/register` with weak password (`< 6` chars) | HTTP 400, password length error | HTTP 400 `Password must be at least 6 characters long.` | **PASS** |
| **TC-AUTH-03** | `POST /api/auth/register` creates valid student user | HTTP 201, returns user profile and JWT token | HTTP 201, user registered with `role: 'student'` | **PASS** |
| **TC-AUTH-04** | `POST /api/auth/register` rejects duplicate email registration | HTTP 409, duplicate email error | HTTP 409 `An account with this email already exists.` | **PASS** |
| **TC-AUTH-05** | `POST /api/auth/register` forces `role: 'student'` when `teacher` requested | Registered user has `role: 'student'` | User role is strictly set to `student` | **PASS** |
| **TC-AUTH-06** | `POST /api/auth/login` with correct credentials | HTTP 200, returns user and valid JWT token | HTTP 200, JWT token returned | **PASS** |
| **TC-AUTH-07** | `POST /api/auth/login` with invalid password | HTTP 401, generic invalid credentials message | HTTP 401 `Invalid email or password.` | **PASS** |
| **TC-AUTH-08** | `POST /api/auth/logout` logs out user cleanly | HTTP 200, `{ success: true }` | HTTP 200 `Logged out successfully.` | **PASS** |
| **TC-AUTH-09** | `GET /api/documents` without Authorization header | HTTP 401, authentication required | HTTP 401 `Access denied. No token provided.` | **PASS** |
| **TC-AUTH-10** | `GET /api/documents` with malformed JWT token | HTTP 401, invalid token message | HTTP 401 `Invalid or expired token.` | **PASS** |

---

### Category 3: Multi-Tenant Data Isolation & IDOR Protection

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-IDOR-01** | User 1 creates a study plan via `POST /api/planner/generate` | HTTP 201, study plan returned with owner ID | HTTP 201, study plan created | **PASS** |
| **TC-IDOR-02** | User 2 attempts to patch User 1's task (`PATCH /api/planner/:id/tasks/0`) | HTTP 404, not found or access denied | HTTP 404 `Study plan not found or access denied.` | **PASS** |
| **TC-IDOR-03** | User 2 attempts to delete User 1's study plan (`DELETE /api/planner/:id`) | HTTP 404, not found or access denied | HTTP 404 `Study plan not found or access denied.` | **PASS** |
| **TC-IDOR-04** | Multi-tenant isolation: User 2's `GET /api/documents` excludes User 1's docs | User 2 list contains 0 items belonging to User 1 | Document list is strictly filtered by owner | **PASS** |
| **TC-IDOR-05** | User 2 attempts direct `GET /api/documents/:id` on User 1's document | HTTP 404, document access denied | HTTP 404 `Document not found or access denied.` | **PASS** |
| **TC-IDOR-06** | Owner accesses document file via `GET /api/documents/:id/file` | HTTP 200 with appropriate Content-Type | HTTP 200 `application/pdf` | **PASS** |
| **TC-IDOR-07** | Non-owner attempts to fetch file via `GET /api/documents/:id/file` | HTTP 404, access denied | HTTP 404 `Document not found or access denied.` | **PASS** |

---

### Category 4: File Upload & Security Headers

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-SEC-01** | Upload script file (`exploit.sh`) via `POST /api/documents/upload` | HTTP 400 or 500, rejected by file filter | Rejected: `Only PDF and image files are accepted.` | **PASS** |
| **TC-SEC-02** | Path traversal attempt in video route (`GET /uploads/video/../../server.js`) | HTTP 400 or 404, traversal blocked | HTTP 404, traversal forbidden | **PASS** |
| **TC-SEC-03** | Direct unauthenticated request to `/uploads/docs/confidential.pdf` | HTTP 403 Forbidden | HTTP 403 `Direct directory access forbidden.` | **PASS** |
| **TC-SEC-04** | Direct unauthenticated request to `/uploads/pdfs/confidential.pdf` | HTTP 403 Forbidden | HTTP 403 `Direct directory access forbidden.` | **PASS** |
| **TC-SEC-05** | Upload text file renamed to `.pdf` with invalid magic bytes | HTTP 400, rejected by magic byte validator | HTTP 400 `Security verification failed for file...` | **PASS** |
| **TC-SEC-06** | Valid minimal PDF upload (`%PDF-1.4`) | HTTP 201, document created | HTTP 201, document uploaded successfully | **PASS** |

---

### Category 5: Media Routes Security & Query Token Support

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-MED-01** | `GET /uploads/images/extracted/:docId/:file` without token | HTTP 401, authentication required | HTTP 401 `Authentication required to access extracted media.` | **PASS** |
| **TC-MED-02** | `GET /uploads/images/extracted/:docId/:file` with non-owner token | HTTP 403 or 404 | HTTP 404, asset access denied | **PASS** |
| **TC-MED-03** | `GET /uploads/video/:filename` without token | HTTP 401, authentication required | HTTP 401 `Authentication required to access lecture videos.` | **PASS** |

---

### Category 6: Database Migration & Chunked Streaming

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-MIG-01** | Migration dry-run executes via `syncLocalDataToMongo({ dryRun: true })` | Returns stats without writing to database | `{ dryRun: true, userSyncCount: N, docSyncCount: N }` | **PASS** |
| **TC-MIG-02** | `computeFileHash` generates 64-character SHA-256 using 64KB chunked stream | Valid SHA-256 hexadecimal string | SHA-256 hash matches without memory spikes | **PASS** |

---

### Category 7: OCR & Document Extraction Engine (`tests/ocr.test.js`)

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-OCR-01** | PDF Service extracts text and metadata from digital PDF | Word count > 0, returns page count and text | 14 words, 1 page, 100% confidence | **PASS** |
| **TC-OCR-02** | PDF Service detects empty or corrupted PDF (< 8 bytes) | Throws descriptive error | Error: `File too small to be a valid PDF` | **PASS** |
| **TC-OCR-03** | Image Preprocessing converts RGB to grayscale buffer | Returns valid image buffer | Image processed without native binding errors | **PASS** |
| **TC-OCR-04** | Image Preprocessing applies contrast enhancement and thresholding | High-contrast buffer returned | Contrast enhanced, ready for Tesseract | **PASS** |
| **TC-OCR-05** | OCR Service initializes Tesseract worker pool | Offline worker pool initialized with `eng` | Pool initialized (2 workers) | **PASS** |
| **TC-OCR-06** | OCR Service recognizes text from scanned image buffer | Extracts legible words with confidence score | Extracted text returned successfully | **PASS** |
| **TC-OCR-07** | Text Extraction Service caches results by SHA-256 content hash | Second extraction hits cache in 0ms | Cache HIT logged, identical content returned | **PASS** |
| **TC-OCR-08** | Text Extraction Service routes digital PDF to native parser | Uses native extractor, confidence = 100% | `method=native, confidence=100%` | **PASS** |
| **TC-OCR-09** | Text Extraction Service falls back to OCR on scanned/image-only pages | Renders pages and extracts text via Tesseract | Multi-page OCR completed successfully | **PASS** |
| **TC-OCR-10** | PDF Diagram Extractor extracts authentic diagrams and filters headers/logos | Extracts diagrams, excludes tiny icons | Diagrams extracted and saved to uploads directory | **PASS** |

---

### Category 8: Structured Notes & PowerPoint Presentation Generation (`tests/api.test.js`)

| Test ID | Test Description & Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **TC-GEN-01** | `handwrittenPDF` generates structured PDF buffer with chapters, topics, subtopics, exam tips & tables | Valid `%PDF` buffer of non-zero length with complete hierarchy | Valid `%PDF-1.3` buffer generated successfully | **PASS** |
| **TC-GEN-02** | `generatePPTX` generates valid presentation binary with multi-layout educational slides | Valid `.pptx` buffer with title, cards, process, diagram, and table slides | Valid PK zip archive containing OpenXML presentation | **PASS** |
| **TC-GEN-03** | `POST /api/generate/export-pptx` exports authentic document diagrams and structured slides | HTTP 200, Content-Type `application/vnd.openxmlformats-officedocument.presentationml.presentation` | HTTP 200 with presentation binary attachment | **PASS** |

---

## 3. Manual UI & End-to-End Test Cases

| Scenario ID | User Workflow | Verification Steps | Status |
|---|---|---|---|
| **UI-01** | **User Registration & Login** | Register new user at `/register`, verify redirect to `/dashboard`, log out, log back in. | **PASS** |
| **UI-02** | **Dark / Scholar Green Theme** | Verify Scholar Green `#1b4332` theme accents, typography, and contrast on all screens. | **PASS** |
| **UI-03** | **Digital PDF Processing** | Upload standard PDF syllabus; verify instant extraction, summary generation, and flashcard creation. | **PASS** |
| **UI-04** | **Scanned PDF Multi-Page OCR** | Upload scanned multi-page PDF; verify progress bar shows extraction and OCR progress accurately. | **PASS** |
| **UI-05** | **Interactive Mindmap & Audio** | Open document view, inspect generated Mermaid mindmap and Edge-TTS audio player. | **PASS** |
| **UI-06** | **Document Download** | Click "Download Original PDF" and "Export Summary as Markdown"; verify clean file downloads. | **PASS** |
| **UI-07** | **Educational Notes Structure** | Open Notebook view, verify Chapters, Topics, Subtopics, Markdown comparison tables, and Exam Tip banners render cleanly. | **PASS** |
| **UI-08** | **PowerPoint Generation & Download** | Generate slides in Notebook, preview diagrams and tables, click "Download PPTX", open in PowerPoint/Google Slides to verify 100% editable vector shapes and text. | **PASS** |

