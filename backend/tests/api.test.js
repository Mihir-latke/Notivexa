const request = require('supertest');
const path = require('path');
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
});
