/**
 * security_isolation.test.js
 * Comprehensive automated security test suite verifying:
 * 1. MongoDB isolation & clone protection (No fallback to developer's DB)
 * 2. Missing MONGODB_URI prevents production startup
 * 3. Authentication requirement for all private endpoints
 * 4. Multi-tenant IDOR protection (User A cannot access User B's records)
 * 5. Privilege escalation prevention (Admin/Teacher self-assignment blocked)
 * 6. Media & static upload storage lockdown
 */

const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = require('../server');
const { signToken, getJwtSecret, requireRole } = require('../middleware/auth');
const { resolveMongoUri, isDatabaseConfigured } = require('../utils/dbSync');
const localStore = require('../utils/localStore');
const { User, Document, Flashcard, Plan, VideoJob } = require('../models');

describe('Notivexa Security, Isolation & Multi-tenant Authorization Suite', () => {
  jest.setTimeout(30000);
  let userAToken;
  let userBToken;
  let userAId;
  let userBId;
  let userADocId;
  let userAFlashcardId;
  let userAPlanId;
  const userAVideoFile = 'userA_confidential_lecture.mp4';
  const userAAudioFile = 'userA_confidential_podcast.mp3';
  const userAGeneratedFile = 'userA_exam_paper.pdf';

  beforeAll(async () => {
    // Register User A
    const resA = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Alice Security',
        email: `alice_${Date.now()}@college.edu`,
        password: 'Password123!',
        institution: 'Cybersecurity Institute'
      });
    expect(resA.status).toBe(201);
    userAToken = resA.body.token;
    userAId = resA.body.user._id || resA.body.user.id;

    // Register User B
    const resB = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bob Attacker',
        email: `bob_${Date.now()}@college.edu`,
        password: 'Password123!',
        institution: 'Independent Lab'
      });
    expect(resB.status).toBe(201);
    userBToken = resB.body.token;
    userBId = resB.body.user._id || resB.body.user.id;

    // Create Document for User A
    let docA;
    if (mongoose.connection.readyState === 1) {
      docA = await Document.create({
        user: userAId,
        title: 'Alice Private Research Paper',
        originalName: 'alice_research.pdf',
        fileType: 'pdf',
        filePath: 'uploads/pdfs/alice_research.pdf',
        status: 'ready',
        extractedText: 'CONFIDENTIAL RESEARCH: Quantum Cryptography and Zero-Trust Architectures.',
        outputs: [
          { type: 'video', fileName: userAVideoFile, filePath: `uploads/video/${userAVideoFile}` },
          { type: 'podcast', fileName: userAAudioFile, filePath: `uploads/audio/${userAAudioFile}` },
          { type: 'paper', fileName: userAGeneratedFile, filePath: `uploads/generated/${userAGeneratedFile}` }
        ]
      });
      userADocId = docA._id.toString();
    } else {
      docA = localStore.createDoc({
        user: userAId,
        title: 'Alice Private Research Paper',
        originalName: 'alice_research.pdf',
        fileType: 'pdf',
        filePath: 'uploads/pdfs/alice_research.pdf',
        status: 'ready',
        extractedText: 'CONFIDENTIAL RESEARCH: Quantum Cryptography and Zero-Trust Architectures.',
        outputs: [
          { type: 'video', fileName: userAVideoFile, filePath: `uploads/video/${userAVideoFile}` },
          { type: 'podcast', fileName: userAAudioFile, filePath: `uploads/audio/${userAAudioFile}` },
          { type: 'paper', fileName: userAGeneratedFile, filePath: `uploads/generated/${userAGeneratedFile}` }
        ]
      });
      userADocId = docA._id.toString();
    }

    // Create Flashcard for User A
    if (mongoose.connection.readyState === 1) {
      const fc = await Flashcard.create({
        user: userAId,
        title: 'Alice Private Flashcards',
        subject: 'Cryptography',
        cards: [{ question: 'What is zero trust?', answer: 'Never trust, always verify.' }]
      });
      userAFlashcardId = fc._id.toString();
    } else {
      const fc = {
        _id: 'fc_' + Date.now(),
        id: 'fc_' + Date.now(),
        user: userAId,
        title: 'Alice Private Flashcards',
        subject: 'Cryptography',
        cards: [{ question: 'What is zero trust?', answer: 'Never trust, always verify.' }]
      };
      const all = localStore.getFlashcards();
      all.push(fc);
      localStore.saveFlashcards(all);
      userAFlashcardId = fc._id;
    }

    // Create Study Plan for User A
    const planRes = await request(app)
      .post('/api/planner/generate')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Alice Confidential Exam Plan',
        examDate: '2026-12-01',
        subjects: ['Quantum Security'],
        dailyHours: 4
      });
    userAPlanId = planRes.body.plan._id || planRes.body.plan.id;

    // Create dummy files on disk to test authorized vs unauthorized downloads
    ['video', 'audio', 'generated'].forEach(d => {
      fs.mkdirSync(path.join(__dirname, '../uploads', d), { recursive: true });
    });
    fs.writeFileSync(path.join(__dirname, '../uploads/video', userAVideoFile), 'fake video binary data');
    fs.writeFileSync(path.join(__dirname, '../uploads/audio', userAAudioFile), 'fake audio binary data');
    fs.writeFileSync(path.join(__dirname, '../uploads/generated', userAGeneratedFile), 'fake generated binary data');
  });

  afterAll(() => {
    // Clean up test files
    try { fs.unlinkSync(path.join(__dirname, '../uploads/video', userAVideoFile)); } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../uploads/audio', userAAudioFile)); } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../uploads/generated', userAGeneratedFile)); } catch {}
  });

  // ============================================================================
  // 1. CLONE ISOLATION & MONGODB CREDENTIAL PROTECTION
  // ============================================================================
  describe('1. Clone Isolation & Database Safeguards', () => {
    it('isDatabaseConfigured returns false when MONGODB_URI is not set or is empty', () => {
      const orig = process.env.MONGODB_URI;
      try {
        delete process.env.MONGODB_URI;
        expect(isDatabaseConfigured()).toBe(false);

        process.env.MONGODB_URI = '';
        expect(isDatabaseConfigured()).toBe(false);

        process.env.MONGODB_URI = '   ';
        expect(isDatabaseConfigured()).toBe(false);
      } finally {
        process.env.MONGODB_URI = orig;
      }
    });

    it('isDatabaseConfigured rejects common placeholder values', () => {
      const placeholders = [
        'mongodb+srv://user:<password>@cluster0.xxx.mongodb.net/notivexa',
        'mongodb+srv://<username>:<db_password>@cluster0.xxxxx.mongodb.net/notivexa',
        'mongodb+srv://YOUR_USER:YOUR_PASS@cluster0.mongodb.net',
        'mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/notivexa'
      ];
      const orig = process.env.MONGODB_URI;
      try {
        for (const ph of placeholders) {
          process.env.MONGODB_URI = ph;
          expect(isDatabaseConfigured()).toBe(false);
        }
      } finally {
        process.env.MONGODB_URI = orig;
      }
    });

    it('resolveMongoUri in production returns null if MONGODB_URI is unconfigured (Enforces Fail-Safe)', () => {
      const origEnv = process.env.NODE_ENV;
      const origUri = process.env.MONGODB_URI;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.MONGODB_URI;
        expect(resolveMongoUri()).toBeNull();

        process.env.MONGODB_URI = 'mongodb+srv://user:<password>@cluster0.xxxxx.mongodb.net/notivexa';
        expect(resolveMongoUri()).toBeNull();
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.MONGODB_URI = origUri;
      }
    });

    it('resolveMongoUri in development returns local MongoDB or DEV_MONGODB_URI, NEVER developer Atlas credentials', () => {
      const origEnv = process.env.NODE_ENV;
      const origUri = process.env.MONGODB_URI;
      try {
        process.env.NODE_ENV = 'development';
        delete process.env.MONGODB_URI;
        const uri = resolveMongoUri();
        expect(uri).toContain('127.0.0.1');
        expect(uri).not.toContain('cluster0');
        expect(uri).not.toContain('mongodb.net');
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.MONGODB_URI = origUri;
      }
    });
  });

  // ============================================================================
  // 2. AUTHENTICATION ENFORCEMENT ON PRIVATE APIS
  // ============================================================================
  describe('2. Authentication Requirement for Private Endpoints', () => {
    it('GET /api/documents rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /api/library rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/library');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /api/planner rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/planner');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('POST /api/generate/notes rejects unauthenticated request with 401', async () => {
      const res = await request(app).post('/api/generate/notes').send({ documentId: userADocId });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /uploads/video/:filename rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/uploads/video/${userAVideoFile}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /uploads/audio/:filename rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/uploads/audio/${userAAudioFile}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('GET /uploads/generated/:filename rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/uploads/generated/${userAGeneratedFile}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('Direct access to /uploads/docs/any.pdf is blocked with 403 Forbidden', async () => {
      const res = await request(app).get('/uploads/docs/any.pdf');
      expect(res.status).toBe(403);
    });

    it('Direct access to /uploads/pdfs/any.pdf is blocked with 403 Forbidden', async () => {
      const res = await request(app).get('/uploads/pdfs/any.pdf');
      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 3. MULTI-TENANT IDOR (INSECURE DIRECT OBJECT REFERENCE) PREVENTION
  // ============================================================================
  describe('3. Multi-tenant IDOR Protection (User A vs User B Isolation)', () => {
    it('User B CANNOT access User A\'s document metadata (GET /api/documents/:id)', async () => {
      const res = await request(app)
        .get(`/api/documents/${userADocId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect([403, 404]).toContain(res.status);
      expect(res.body.document).toBeUndefined();
    });

    it('User B CANNOT read User A\'s extracted document text (GET /api/documents/:id/extracted-text)', async () => {
      const res = await request(app)
        .get(`/api/documents/${userADocId}/extracted-text`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect([403, 404]).toContain(res.status);
      expect(res.body.extractedText).toBeUndefined();
    });

    it('User B CANNOT delete User A\'s document (DELETE /api/documents/:id)', async () => {
      const res = await request(app)
        .delete(`/api/documents/${userADocId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect([403, 404]).toContain(res.status);
    });

    it('User B CANNOT access User A\'s flashcards (GET /api/flashcards/:id)', async () => {
      const res = await request(app)
        .get(`/api/flashcards/${userAFlashcardId}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect([403, 404]).toContain(res.status);
    });

    it('User B CANNOT modify User A\'s study plan task (PATCH /api/planner/:planId/tasks/:taskId)', async () => {
      const res = await request(app)
        .patch(`/api/planner/${userAPlanId}/tasks/0`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ completed: true });
      expect([403, 404]).toContain(res.status);
    });

    it('User B CANNOT stream or download User A\'s video (GET /uploads/video/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/video/${userAVideoFile}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    it('User A CAN stream and download their own video (GET /uploads/video/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/video/${userAVideoFile}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/video\/mp4/);
    });

    it('User B CANNOT access User A\'s audio (GET /uploads/audio/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/audio/${userAAudioFile}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    it('User A CAN access their own audio (GET /uploads/audio/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/audio/${userAAudioFile}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    });

    it('User B CANNOT access User A\'s generated notes/exam paper (GET /uploads/generated/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/generated/${userAGeneratedFile}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    it('User A CAN access their own generated document (GET /uploads/generated/:filename)', async () => {
      const res = await request(app)
        .get(`/uploads/generated/${userAGeneratedFile}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(res.status).toBe(200);
    });
  });

  // ============================================================================
  // 4. PRIVILEGE ESCALATION & ROLE PROTECTION
  // ============================================================================
  describe('4. Privilege Escalation Prevention', () => {
    it('Registration forcing role: "admin" is overridden to "student"', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Hacker Admin',
          email: `admin_hack_${Date.now()}@college.edu`,
          password: 'Password123!',
          role: 'admin'
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('student');
    });

    it('Registration forcing role: "teacher" is overridden to "student"', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Fake Teacher',
          email: `teacher_hack_${Date.now()}@college.edu`,
          password: 'Password123!',
          role: 'teacher'
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('student');
    });

    it('Profile update cannot modify user role (PUT /api/auth/profile)', async () => {
      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ role: 'admin', institution: 'Updated College' });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('student');
      expect(res.body.user.institution).toBe('Updated College');
    });

    it('requireRole middleware blocks users without authorized role', async () => {
      const reqMock = { user: { role: 'student' } };
      const resMock = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const nextMock = jest.fn();

      const adminGate = requireRole('admin');
      adminGate(reqMock, resMock, nextMock);

      expect(resMock.status).toHaveBeenCalledWith(403);
      expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/insufficient/i) }));
      expect(nextMock).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 5. AUTHENTICATION BYPASS PREVENTION
  // ============================================================================
  describe('5. Authentication Bypass Safeguards', () => {
    it('Demo account rejects incorrect passwords without backdoors', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@demo.com', password: 'wrongPassword999!' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('No plain-text bypass passwords ("student123") work unless matching actual password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@demo.com', password: 'random_unhashed_string' });
      expect(res.status).toBe(401);
    });
  });
});

