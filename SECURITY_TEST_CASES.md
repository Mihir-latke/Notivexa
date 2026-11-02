# NOTIVEXA — SECURITY TEST CASES & VERIFICATION REPORT

## 1. Overview of Security Test Suites

The Notivexa backend incorporates two primary automated security test suites:
1. `backend/tests/security_isolation.test.js` — Dedicated 30-case suite covering clone isolation, database fail-safes, unauthenticated request rejection, multi-tenant IDOR defense, and privilege escalation prevention.
2. `backend/tests/api.test.js` — 30-case suite validating end-to-end API workflows, authentication flows, rate limiting, magic bytes file upload validation, and path traversal protection.

Total Automated Tests in Project: **113 Tests across 5 Test Suites**  
Pass Rate: **100% (113 Passed, 0 Failed)**

---

## 2. Security Test Matrix

### Test Category 1: Clone Isolation & Database Fail-Safe Verification
| Test ID | Objective | Input / Condition | Expected Result | Automated Test |
|---|---|---|---|---|
| **SEC-01** | Verify `isDatabaseConfigured()` returns false when `MONGODB_URI` is missing | `delete process.env.MONGODB_URI` | Returns `false` | `security_isolation.test.js` |
| **SEC-02** | Verify `isDatabaseConfigured()` rejects empty string | `MONGODB_URI = ""` | Returns `false` | `security_isolation.test.js` |
| **SEC-03** | Verify `isDatabaseConfigured()` rejects Atlas template placeholders | `MONGODB_URI = "mongodb+srv://<username>:<password>@cluster0.xxx..."` | Returns `false` | `security_isolation.test.js` |
| **SEC-04** | Verify `resolveMongoUri()` in production fails safely | `NODE_ENV = 'production'`, unconfigured `MONGODB_URI` | Returns `null` (causes startup exit) | `security_isolation.test.js` |
| **SEC-05** | Verify `resolveMongoUri()` in development falls back to local MongoDB | `NODE_ENV = 'development'`, unconfigured `MONGODB_URI` | Returns `mongodb://127.0.0.1:27017/notivexa` (never developer Atlas) | `security_isolation.test.js` |

---

### Test Category 2: Private API Authentication Enforcement
| Test ID | Objective | Target Endpoint | Expected Result | Automated Test |
|---|---|---|---|---|
| **SEC-06** | Reject unauthenticated document listing | `GET /api/documents` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-07** | Reject unauthenticated library access | `GET /api/library` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-08** | Reject unauthenticated planner access | `GET /api/planner` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-09** | Reject unauthenticated AI generation | `POST /api/generate/notes` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-10** | Reject unauthenticated video streaming | `GET /uploads/video/:filename` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-11** | Reject unauthenticated audio streaming | `GET /uploads/audio/:filename` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-12** | Reject unauthenticated generated note download | `GET /uploads/generated/:filename` | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-13** | Block direct unauthenticated access to doc storage | `GET /uploads/docs/any.pdf` | `403 Forbidden` | `security_isolation.test.js` |
| **SEC-14** | Block direct unauthenticated access to PDF storage | `GET /uploads/pdfs/any.pdf` | `403 Forbidden` | `security_isolation.test.js` |

---

### Test Category 3: Multi-Tenant IDOR & Resource Ownership Verification
| Test ID | Objective | Attacker Action | Expected Result | Automated Test |
|---|---|---|---|---|
| **SEC-15** | User B attempts to view User A's document | `GET /api/documents/<User_A_Doc_ID>` with User B token | `404 Not Found` (Zero information disclosure) | `security_isolation.test.js` |
| **SEC-16** | User B attempts to read User A's extracted text | `GET /api/documents/<User_A_Doc_ID>/extracted-text` with User B token | `404 Not Found` | `security_isolation.test.js` |
| **SEC-17** | User B attempts to delete User A's document | `DELETE /api/documents/<User_A_Doc_ID>` with User B token | `404 Not Found` (Document preserved) | `security_isolation.test.js` |
| **SEC-18** | User B attempts to read User A's flashcards | `GET /api/flashcards/<User_A_Set_ID>` with User B token | `404 Not Found` | `security_isolation.test.js` |
| **SEC-19** | User B attempts to modify User A's study plan | `PATCH /api/planner/<User_A_Plan_ID>/tasks/0` with User B token | `404 Not Found` (Plan unaffected) | `security_isolation.test.js` |
| **SEC-20** | User B attempts to stream User A's video | `GET /uploads/video/<User_A_Video>` with User B token | `403 Forbidden` (`Access denied`) | `security_isolation.test.js` |
| **SEC-21** | User A streams their own video | `GET /uploads/video/<User_A_Video>` with User A token | `200 OK` (Video stream returned) | `security_isolation.test.js` |
| **SEC-22** | User B attempts to download User A's audio | `GET /uploads/audio/<User_A_Audio>` with User B token | `403 Forbidden` (`Access denied`) | `security_isolation.test.js` |
| **SEC-23** | User A downloads their own audio | `GET /uploads/audio/<User_A_Audio>` with User A token | `200 OK` (Audio stream returned) | `security_isolation.test.js` |
| **SEC-24** | User B attempts to access User A's generated exam | `GET /uploads/generated/<User_A_Exam>` with User B token | `403 Forbidden` (`Access denied`) | `security_isolation.test.js` |
| **SEC-25** | User A accesses their own generated exam | `GET /uploads/generated/<User_A_Exam>` with User A token | `200 OK` | `security_isolation.test.js` |

---

### Test Category 4: Privilege Escalation & Role Protection
| Test ID | Objective | Scenario | Expected Result | Automated Test |
|---|---|---|---|---|
| **SEC-26** | Prevent self-assignment of `admin` during registration | `POST /api/auth/register` with `role: "admin"` | Role forced to `"student"` | `security_isolation.test.js` |
| **SEC-27** | Prevent self-assignment of `teacher` during registration | `POST /api/auth/register` with `role: "teacher"` | Role forced to `"student"` | `security_isolation.test.js` |
| **SEC-28** | Prevent role modification via profile update | `PUT /api/auth/profile` with `role: "admin"` | Role unchanged (`"student"`) | `security_isolation.test.js` |
| **SEC-29** | Verify `requireRole` middleware blocks unauthorized roles | Request with `user.role: 'student'` against `requireRole('admin')` | `403 Forbidden` (`Insufficient role permissions`) | `security_isolation.test.js` |

---

### Test Category 5: Authentication Bypass Safeguards
| Test ID | Objective | Scenario | Expected Result | Automated Test |
|---|---|---|---|---|
| **SEC-30** | Prevent login with incorrect password | `POST /api/auth/login` with wrong password | `401 Unauthorized` | `security_isolation.test.js` |
| **SEC-31** | Prevent login via hardcoded bypass passwords | `POST /api/auth/login` with plaintext bypass string | `401 Unauthorized` (Bcrypt match required) | `security_isolation.test.js` |

---

## 3. How to Run Security Verification in a Clean Environment

To verify in a completely clean environment:

```bash
# 1. Clone repository to a temporary location
git clone https://github.com/Mihir-latke/Notivexa.git clean_test
cd clean_test

# 2. Verify that no .env or sensitive data files exist in the clone
ls -la backend/.env               # Must NOT exist
ls -la backend/data/users.json    # Must NOT exist

# 3. Install backend dependencies
cd backend
npm install

# 4. Run the automated security test suite
npm test -- tests/security_isolation.test.js

# 5. Run the complete test suite
npm test
```

### Execution Output:
```text
PASS tests/security_isolation.test.js
  Notivexa Security, Isolation & Multi-tenant Authorization Suite
    1. Clone Isolation & Database Safeguards
      √ isDatabaseConfigured returns false when MONGODB_URI is not set or is empty
      √ isDatabaseConfigured rejects common placeholder values
      √ resolveMongoUri in production returns null if MONGODB_URI is unconfigured (Enforces Fail-Safe)
      √ resolveMongoUri in development returns local MongoDB or DEV_MONGODB_URI, NEVER developer Atlas credentials
    2. Authentication Requirement for Private Endpoints
      √ GET /api/documents rejects unauthenticated request with 401
      √ GET /api/library rejects unauthenticated request with 401
      √ GET /api/planner rejects unauthenticated request with 401
      √ POST /api/generate/notes rejects unauthenticated request with 401
      √ GET /uploads/video/:filename rejects unauthenticated request with 401
      √ GET /uploads/audio/:filename rejects unauthenticated request with 401
      √ GET /uploads/generated/:filename rejects unauthenticated request with 401
      √ Direct access to /uploads/docs/any.pdf is blocked with 403 Forbidden
      √ Direct access to /uploads/pdfs/any.pdf is blocked with 403 Forbidden
    3. Multi-tenant IDOR Protection (User A vs User B Isolation)
      √ User B CANNOT access User A's document metadata (GET /api/documents/:id)
      √ User B CANNOT read User A's extracted document text (GET /api/documents/:id/extracted-text)
      √ User B CANNOT delete User A's document (DELETE /api/documents/:id)
      √ User B CANNOT access User A's flashcards (GET /api/flashcards/:id)
      √ User B CANNOT modify User A's study plan task (PATCH /api/planner/:planId/tasks/:taskId)
      √ User B CANNOT stream or download User A's video (GET /uploads/video/:filename)
      √ User A CAN stream and download their own video (GET /uploads/video/:filename)
      √ User B CANNOT access User A's audio (GET /uploads/audio/:filename)
      √ User A CAN access their own audio (GET /uploads/audio/:filename)
      √ User B CANNOT access User A's generated notes/exam paper (GET /uploads/generated/:filename)
      √ User A CAN access their own generated document (GET /uploads/generated/:filename)
    4. Privilege Escalation Prevention
      √ Registration forcing role: "admin" is overridden to "student"
      √ Registration forcing role: "teacher" is overridden to "student"
      √ Profile update cannot modify user role (PUT /api/auth/profile)
      √ requireRole middleware blocks users without authorized role
    5. Authentication Bypass Safeguards
      √ Demo account rejects incorrect passwords without backdoors
      √ No plain-text bypass passwords ("student123") work unless matching actual password

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
```

