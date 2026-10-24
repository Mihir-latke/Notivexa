const request = require('supertest');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Ensure development mode for test suite
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_automated_testing_32chars_long';
process.env.ALLOW_DEMO_MODE = 'true';
jest.setTimeout(30000);

const app = require('../server');
const localStore = require('../utils/localStore');
const mongoose = require('mongoose');

describe('Notivexa API Audit & Security Test Suite', () => {
  let user1Token = '';
  let user1Id = '';
  let user2Token = '';
  let user2Id = '';
  const user1Email = `student_${Date.now()}@test.com`;
  const user2Email = `student2_${Date.now()}@test.com`;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 2) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 3000);
        mongoose.connection.once('connected', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  });

  describe('1. Health Check & Environment Status', () => {
    it('GET /api/health returns accurate health status and metadata', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('app', 'Notivexa v2.0');
      expect(res.body).toHaveProperty('storageMode');
      expect(res.body).toHaveProperty('uptimeSeconds');
    });

    it('GET /api/setup returns configuration status and instructions', async () => {
      const res = await request(app).get('/api/setup');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('hasAI');
      expect(Array.isArray(res.body.freeAPIs)).toBe(true);
    });
  });

  describe('2. Authentication & Role Privilege Escalation Prevention', () => {
    it('Registration rejects invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test Student', email: 'notanemail', password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid email/i);
    });

    it('Registration rejects weak passwords (< 6 characters)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test Student', email: 'test@example.com', password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 6 characters/i);
    });

    it('Registration prevents privilege escalation: strips client-supplied "admin" or "teacher" role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Hacker Attempt',
          email: user1Email,
          password: 'securepassword123',
          role: 'admin' // Attempting to register as admin!
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('student'); // MUST be forced to student
      expect(res.body).toHaveProperty('token');

      user1Token = res.body.token;
      user1Id = res.body.user._id || res.body.user.id;
    });

    it('Registration rejects duplicate email addresses', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate Student',
          email: user1Email,
          password: 'securepassword123'
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });

    it('Register a second user (User 2) for multi-tenant isolation testing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Student Two',
          email: user2Email,
          password: 'securepassword123',
          role: 'teacher' // Attempting teacher role
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('student'); // Force student
      user2Token = res.body.token;
      user2Id = res.body.user._id || res.body.user.id;
    });

    it('Login succeeds with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user1Email, password: 'securepassword123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });

    it('Login fails with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user1Email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('Protected endpoints reject requests without a Bearer token', async () => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/no token provided/i);
    });

    it('Protected endpoints reject expired or forged tokens', async () => {
      const forgedToken = jwt.sign({ id: 'fake_user' }, 'completely_wrong_secret', { expiresIn: '1h' });
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('3. IDOR & Multi-tenant Authorization Enforcement', () => {
    let user1PlanId = '';

    it('User 1 can create their own study plan', async () => {
      const res = await request(app)
        .post('/api/planner/generate')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: "User 1's Private Study Plan",
          subjects: ['Mathematics', 'Physics'],
          dailyHours: 4
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      user1PlanId = res.body.plan._id || res.body.plan.id;
    });

    it('IDOR Check: User 2 cannot modify User 1’s study plan tasks', async () => {
      const res = await request(app)
        .patch(`/api/planner/${user1PlanId}/tasks/0`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ completed: true });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('IDOR Check: User 2 cannot delete User 1’s study plan', async () => {
      const res = await request(app)
        .delete(`/api/planner/${user1PlanId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found or access denied/i);
    });

    it('Multi-tenant Check: User 2 document list does not contain User 1 documents', async () => {
      // User 1 creates a mock document in local store
      const doc1 = localStore.createDoc({
        user: user1Id,
        title: "User 1 Confidential Thesis",
        extractedText: "Proprietary research and findings.",
        status: "ready"
      });

      // User 2 requests their document list
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      const user2Docs = res.body.documents || [];
      const hasUser1Doc = user2Docs.some(d => (d._id === doc1._id || d.id === doc1.id));
      expect(hasUser1Doc).toBe(false);

      // User 2 attempts to directly access User 1's document by ID (IDOR test)
      const directAccess = await request(app)
        .get(`/api/documents/${doc1._id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(directAccess.status).toBe(404);
      expect(directAccess.body.error).toMatch(/not found or access denied/i);
    });
  });

  describe('4. File Upload & Security Headers', () => {
    it('Upload rejects non-PDF/image files (e.g. scripts or executables)', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('files', Buffer.from('malicious script content'), 'exploit.sh');

      expect([400, 500]).toContain(res.status);
    });

    it('Path traversal in static video route is blocked', async () => {
      const res = await request(app).get('/uploads/video/../../server.js');
      expect([400, 404]).toContain(res.status);
    });

    it('Direct unauthenticated access to /uploads/docs and /uploads/pdfs is blocked with 403 Forbidden', async () => {
      const resDocs = await request(app).get('/uploads/docs/confidential.pdf');
      expect(resDocs.status).toBe(403);
      expect(resDocs.body.error).toMatch(/forbidden/i);

      const resPdfs = await request(app).get('/uploads/pdfs/confidential.pdf');
      expect(resPdfs.status).toBe(403);
      expect(resPdfs.body.error).toMatch(/forbidden/i);
    });

    it('Upload rejects files with spoofed PDF extension but invalid magic bytes', async () => {
      const spoofedContent = Buffer.from('THIS_IS_NOT_A_REAL_PDF_BUT_PLAIN_TEXT_PAYLOAD');
      const res = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('files', spoofedContent, { filename: 'spoofed.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/genuine PDF or image|Security verification/i);
    });

    it('Authenticated document file route allows owner and blocks non-owner (IDOR)', async () => {
      // Create a genuine minimal PDF for User 1
      const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n99\n%%EOF');
      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('files', minimalPdf, { filename: 'owner_doc.pdf', contentType: 'application/pdf' });

      expect(uploadRes.status).toBe(201);
      const doc = uploadRes.body.documents[0];
      const docId = doc._id || doc.id;

      // Owner can access file
      const ownerGet = await request(app)
        .get(`/api/documents/${docId}/file`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(ownerGet.status).toBe(200);
      expect(ownerGet.headers['content-type']).toMatch(/pdf/);

      // Non-owner cannot access file (IDOR prevention)
      const nonOwnerGet = await request(app)
        .get(`/api/documents/${docId}/file`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(nonOwnerGet.status).toBe(404);
      expect(nonOwnerGet.body.error).toMatch(/not found or access denied/i);
    });

    it('Setup status does not hardcode hasTTS to true by default', async () => {
      const res = await request(app).get('/api/setup');
      expect(res.status).toBe(200);
      const expectedTTS = Boolean(process.env.GOOGLE_TTS_API_KEY && !process.env.GOOGLE_TTS_API_KEY.startsWith('your_')) ||
                          Boolean(process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.startsWith('your_'));
      expect(res.body.hasTTS).toBe(expectedTTS);
      expect(res.body.edgeTTS).toBe(true);
    });
  });

  describe('5. Media Routes Security & Multi-tenant Authorization', () => {
    it('GET /uploads/images/extracted/:docId/:fileName rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/uploads/images/extracted/fakeDoc123/diagram_1.png');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /uploads/images/extracted/:docId/:fileName rejects unauthorized non-owner with 403 or 404', async () => {
      const res = await request(app)
        .get('/uploads/images/extracted/fakeDoc123/diagram_1.png')
        .set('Authorization', `Bearer ${user2Token}`);
      expect([403, 404]).toContain(res.status);
    });

    it('GET /uploads/video/:filename rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/uploads/video/secret_lecture.mp4');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('POST /api/auth/logout succeeds cleanly', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('6. Migration Safety & Chunked Hashing', () => {
    const { syncLocalDataToMongo, ensureDbState } = require('../utils/dbSync');
    const { computeFileHash } = require('../services/ocr/textExtractionService');

    it('Migration dry-run executes safely without writing data', async () => {
      await ensureDbState(2000);
      const result = await syncLocalDataToMongo({ dryRun: true });
      expect(result).toHaveProperty('dryRun', true);
      expect(typeof result.userSyncCount).toBe('number');
      expect(typeof result.docSyncCount).toBe('number');
    }, 15000);

    it('computeFileHash computes valid SHA-256 hash using chunked streaming', () => {
      const testFilePath = path.join(__dirname, '../server.js');
      const hash = computeFileHash(testFilePath);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('7. Structured Notes & PowerPoint Presentation Generation', () => {
    const { handwrittenPDF } = require('../services/pdfGenerator');
    const { generatePPTX } = require('../services/officeGenerator');

    it('handwrittenPDF generates structured notebook PDF with chapters, topics, subtopics, tables, and exam tips', async () => {
      const structuredContent = `# Chapter 1: Introduction to Operating Systems

## Topic 1.1: Process Management & Scheduling

DEFINITION: A process is a program in execution requiring CPU time, memory, and I/O resources.

SUMMARY: The operating system manages concurrent processes to ensure optimal CPU utilization and throughput.

### Subtopic: Key Mechanisms & Architecture
EXPLANATION:
- State Machine: Processes transition through New, Ready, Running, Waiting, and Terminated states.
- Context Switching: The OS saves state to the Process Control Block (PCB) and restores the next scheduled thread.
- Preemption: High-priority processes preempt lower-priority tasks to preserve latency constraints.

### Subtopic: Comparative Specifications
| Metric / Aspect | Round Robin | Priority Scheduling | Multi-Level Feedback Queue |
|---|---|---|---|
| Preemptive | Yes (Time Quantum) | Configurable | Yes (Adaptive) |
| Starvation Risk | None | Possible | Mitigated via Aging |
| Overhead | Low | Minimal | Moderate |

### Subtopic: Practical Applications & Exam Pointers
EXAMPLE:
- Real-world Application 1: Linux Completely Fair Scheduler (CFS) managing multi-core server workloads.
- Real-world Application 2: Embedded automotive real-time microkernels.
- Exam Tip: University finals frequently ask you to trace a Gantt chart comparing SJF and Round Robin.

EXAM TIP: Thoroughly memorize the 5-state process lifecycle diagram and PCB field structure.
FORMULA: Turnaround Time = Completion Time - Arrival Time; Waiting Time = Turnaround Time - Burst Time.
---`;

      const result = await handwrittenPDF(structuredContent, {
        title: 'Operating Systems Coursework',
        subject: 'Computer Science',
        style: 'yellow',
        fontName: 'caveat'
      });

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('fileName');
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.fileSize).toBeGreaterThan(5000);
    });

    it('generatePPTX generates educational presentations with diverse layouts and editable elements', async () => {
      const testSlides = [
        {
          slideNumber: 1,
          layout: 'title',
          category: 'INTRODUCTION',
          title: 'Algorithms & Data Structures',
          keyTakeaway: 'Mastering algorithmic paradigms is essential for optimal computation.',
          bullets: [
            'Foundations: Big-O asymptotic analysis and space complexity.',
            'Core Structures: Trees, graphs, heaps, and hash tables.',
            'Practical Scope: Production caching and database query optimization.'
          ],
          analogy: 'A blueprint guides skyscraper construction before physical foundation pouring.',
          speakerNotes: 'Welcome students to today’s lecture on algorithms.'
        },
        {
          slideNumber: 2,
          layout: 'two-column',
          category: 'CORE PRINCIPLE',
          title: 'Asymptotic Analysis & Growth Bounds',
          keyTakeaway: 'Asymptotic notation classifies algorithm scaling independent of hardware clock speeds.',
          bullets: [
            'Worst-Case Big-O: Upper bound guaranteeing runtime cannot exceed f(n).',
            'Best-Case Big-Omega: Lower bound defining the minimum requisite work.',
            'Average-Case Big-Theta: Tight bound describing typical execution behavior.',
            'Practical Impact: Selecting O(n log n) sorts over O(n^2) transforms scale.'
          ],
          analogy: 'Comparing highway travel vs city driving under peak traffic conditions.',
          speakerNotes: 'Focus on explaining the tight bound Big-Theta on the chalkboard.'
        },
        {
          slideNumber: 3,
          layout: 'process',
          category: 'STEP-BY-STEP',
          title: 'Divide and Conquer Pipeline',
          keyTakeaway: 'Decomposing problems into sub-problems yields logarithmic recursion depth.',
          bullets: [
            'Divide: Split dataset into halves or equal partitions.',
            'Conquer: Recursively solve sub-problems until base cases.',
            'Combine: Merge partial solutions into final unified result.'
          ],
          analogy: 'Organizing a large library by delegating individual genres to team members.',
          speakerNotes: 'Walk through Merge Sort partitioning as a concrete implementation.'
        },
        {
          slideNumber: 4,
          layout: 'table',
          category: 'COMPARATIVE ANALYSIS',
          title: 'Sorting Algorithm Benchmark',
          keyTakeaway: 'Merge Sort guarantees deterministic O(n log n) at the cost of O(n) memory.',
          bullets: [
            'Quick Sort: In-place with O(n log n) average but O(n^2) worst case.',
            'Heap Sort: In-place with guaranteed O(n log n) runtime.',
            'Radix Sort: Non-comparative linear sort for bounded integers.'
          ],
          table: [
            ['Algorithm', 'Best Case', 'Worst Case', 'Space Complexity'],
            ['Quick Sort', 'O(n log n)', 'O(n^2)', 'O(log n)'],
            ['Merge Sort', 'O(n log n)', 'O(n log n)', 'O(n)'],
            ['Heap Sort', 'O(n log n)', 'O(n log n)', 'O(1)']
          ],
          analogy: 'Choosing between a high-speed sports car and an all-terrain cargo truck.',
          speakerNotes: 'Examine the table closely; students frequently mix up Heap Sort space complexity.'
        }
      ];

      const pptxResult = await generatePPTX(testSlides, {
        title: 'Algorithms & Data Structures',
        subject: 'Computer Science',
        theme: 'obsidian'
      });

      expect(pptxResult).toHaveProperty('filePath');
      expect(pptxResult).toHaveProperty('fileName');
      expect(pptxResult.fileName).toMatch(/\.pptx$/);
      expect(fs.existsSync(pptxResult.filePath)).toBe(true);
      expect(pptxResult.fileSize).toBeGreaterThan(10000);
    });

    it('POST /api/generate/export-pptx exports presentation cleanly via authenticated API', async () => {
      const res = await request(app)
        .post('/api/generate/export-pptx')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Distributed Systems',
          subject: 'Cloud Computing',
          theme: 'obsidian',
          slides: [
            {
              slideNumber: 1,
              layout: 'title',
              category: 'INTRODUCTION',
              title: 'CAP Theorem & Consistency Models',
              keyTakeaway: 'Trade-offs between consistency, availability, and partition tolerance.',
              bullets: [
                'Consistency: Every read receives the most recent write or an error.',
                'Availability: Every request receives a non-error response without guarantee.',
                'Partition Tolerance: The system continues to operate despite dropped network messages.'
              ],
              analogy: 'A telephone network during a severe storm.',
              speakerNotes: 'Introduce Eric Brewer’s formulation.'
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.downloadUrl).toMatch(/\.pptx$/);
    });
  });
});
