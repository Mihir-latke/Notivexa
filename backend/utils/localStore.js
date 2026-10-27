const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

function generateValidId() {
  return new mongoose.Types.ObjectId().toString();
}

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[LocalStore] Could not create data dir:', err.message);
  }
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DOCS_FILE = path.join(DATA_DIR, 'documents.json');
const FLASHCARDS_FILE = path.join(DATA_DIR, 'flashcards.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');

// Default initial demo users
const DEFAULT_USERS = [
  {
    _id: '507f191e810c19729de860ea',
    id: '507f191e810c19729de860ea',
    isDemo: true,
    name: 'Aryan Sharma',
    email: 'student@demo.com',
    passwordHash: bcrypt.hashSync('demo1234', 10),
    role: 'student',
    institution: 'Demo College, Mumbai',
    preferredLanguage: 'English',
    isActive: true,
    studyStats: { documentsUploaded: 1, notesGenerated: 4, flashcardsCreated: 12 },
    createdAt: new Date().toISOString()
  },
  {
    _id: '507f191e810c19729de860eb',
    id: '507f191e810c19729de860eb',
    isDemo: true,
    name: 'Prof. Meera Joshi',
    email: 'teacher@demo.com',
    passwordHash: bcrypt.hashSync('demo1234', 10),
    role: 'teacher',
    institution: 'Demo College, Mumbai',
    preferredLanguage: 'English',
    isActive: true,
    studyStats: { documentsUploaded: 5, notesGenerated: 16, flashcardsCreated: 36 },
    createdAt: new Date().toISOString()
  }
];

// Default sample document
const DEFAULT_DOCS = [
  {
    _id: '6acd1272c42773e489b74e48',
    id: '6acd1272c42773e489b74e48',
    user: '507f191e810c19729de860ea',
    isDemo: true,
    title: 'Java Database Connectivity (JDBC) & Architecture',
    originalName: 'JDBC_Architecture_Guide.pdf',
    fileType: 'pdf',
    size: 245800,
    filePath: 'uploads/pdfs/sample.pdf',
    status: 'ready',
    subject: 'Computer Science',
    pageCount: 12,
    wordCount: 3840,
    createdAt: new Date().toISOString(),
    sections: [
      {
        title: 'Introduction to JDBC Architecture',
        content: 'Java Database Connectivity (JDBC) is a Java API that manages connecting to a database, issuing SQL queries and commands, and handling result sets obtained from the database. Released as part of JDK 1.1 in 1997, JDBC was one of the earliest components of Java Enterprise Edition. The architecture comprises two layers: the JDBC API and the JDBC Driver API. The JDBC API provides application-to-JDBC Manager connection, while the Driver API provides JDBC Manager-to-Driver connection.',
        wordCount: 78
      },
      {
        title: 'JDBC Drivers and Types',
        content: 'There are four distinct types of JDBC Drivers:\nType 1: JDBC-ODBC Bridge Driver (Translates JDBC calls into ODBC calls).\nType 2: Native-API Driver (Partly Java Driver that converts JDBC calls into native database C/C++ API calls).\nType 3: Network-Protocol Driver (Pure Java driver for database middleware).\nType 4: Thin Driver (Direct-to-Database Pure Java Driver that converts JDBC calls directly into vendor-specific network protocol). Type 4 is most commonly used in modern enterprise production systems.',
        wordCount: 76
      },
      {
        title: 'Connection, Statements and ResultSets',
        content: 'The core workflow involves loading the driver class with Class.forName(), obtaining a connection via DriverManager.getConnection(url, username, password), creating a Statement or PreparedStatement, executing queries with executeQuery() or executeUpdate(), and iterating over ResultSet objects. PreparedStatement provides precompiled SQL queries and protection against SQL Injection attacks.',
        wordCount: 52
      },
      {
        title: 'Transaction Management & ACID Properties',
        content: 'JDBC supports transaction management through Connection methods. By default, auto-commit is enabled (setAutoCommit(true)). To group operations into an atomic transaction, setAutoCommit(false) is called, followed by executeUpdate() calls, and finally connection.commit() or connection.rollback() inside an exception catch block to preserve Atomicity, Consistency, Isolation, and Durability.',
        wordCount: 55
      }
    ],
    extractedText: 'Java Database Connectivity (JDBC) is a Java-based data access technology that provides a uniform interface to relational databases. It consists of JDBC API and JDBC Driver API. Four types of drivers exist: Type 1 JDBC-ODBC bridge, Type 2 Native API, Type 3 Network Protocol, and Type 4 100% Pure Java Thin Driver. Connecting requires loading the driver, DriverManager.getConnection, creating Statement or PreparedStatement, executing queries, and processing ResultSets. Proper transaction management uses setAutoCommit(false), commit(), and rollback() to ensure ACID compliance.',
    outputs: []
  }
];

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn(`[LocalStore] Read error for ${path.basename(file)}:`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    const tmpFile = `${file}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, file);
  } catch (e) {
    console.warn(`[LocalStore] Write error for ${path.basename(file)}:`, e.message);
  }
}

// In-memory caches backed by disk files
let memoryUsers = readJson(USERS_FILE, DEFAULT_USERS);
let memoryDocs = readJson(DOCS_FILE, DEFAULT_DOCS);
let memoryFlashcards = readJson(FLASHCARDS_FILE, []);
let memoryPlans = readJson(PLANS_FILE, []);

// Users store operations
exports.getUsers = () => memoryUsers;

exports.findUserByEmail = (email) => {
  if (!email) return null;
  const norm = email.toLowerCase().trim();
  return memoryUsers.find(u => u.email.toLowerCase() === norm) || null;
};

exports.findUserById = (id) => {
  if (!id) return null;
  const strId = id.toString();
  return memoryUsers.find(u => (u._id && u._id.toString() === strId) || (u.id && u.id.toString() === strId)) || null;
};

exports.createUser = async ({ name, email, password, role = 'student', institution = '', preferredLanguage = 'English' }) => {
  const normEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);
  const uid = generateValidId();
  const newUser = {
    _id: uid,
    id: uid,
    name: name.trim(),
    email: normEmail,
    passwordHash,
    role: 'student', // Enforce student role
    institution: institution.trim(),
    preferredLanguage: preferredLanguage || 'English',
    isActive: true,
    studyStats: { documentsUploaded: 0, notesGenerated: 0, flashcardsCreated: 0 },
    createdAt: new Date().toISOString()
  };
  memoryUsers.push(newUser);
  writeJson(USERS_FILE, memoryUsers);
  
  const userSafe = { ...newUser };
  delete userSafe.passwordHash;
  return userSafe;
};

exports.comparePassword = async (user, password) => {
  if (!user || !password) return false;
  const allowDemo = process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
  // Demo accounts bypass strictly gated behind development or explicit demo mode
  if (allowDemo && (user.email === 'student@demo.com' || user.email === 'teacher@demo.com') &&
      (password === 'demo1234' || password === 'student123' || password === 'teacher123')) {
    return true;
  }
  if (user.passwordHash) {
    return bcrypt.compare(password, user.passwordHash);
  }
  return false;
};

exports.updateUser = (id, updates) => {
  const user = exports.findUserById(id);
  if (!user) return null;
  // Disallow modifying critical security fields
  const safe = { ...updates };
  delete safe._id;
  delete safe.id;
  delete safe.email;
  delete safe.role;

  Object.assign(user, safe);
  writeJson(USERS_FILE, memoryUsers);
  const sanitized = { ...user };
  delete sanitized.passwordHash;
  return sanitized;
};

// Documents store operations
exports.getDocs = () => memoryDocs;

// SECURITY FIX: Strictly filter by userId. Never return other users' docs.
exports.getDocsByUser = (userId) => {
  if (!userId) return [];
  const strId = userId.toString();
  return memoryDocs.filter(d => d.user && d.user.toString() === strId);
};

exports.getDocById = (id, userId = null) => {
  if (!id) return null;
  const strId = id.toString();
  const doc = memoryDocs.find(d => (d._id && d._id.toString() === strId) || (d.id && d.id.toString() === strId));
  if (!doc) return null;
  if (userId) {
    const uStr = userId.toString();
    if (doc.user && doc.user.toString() !== uStr && !doc.isDemo) {
      return null; // IDOR prevention
    }
  }
  return doc;
};

exports.createDoc = (docData) => {
  const did = generateValidId();
  const newDoc = {
    _id: did,
    id: did,
    status: 'ready',
    createdAt: new Date().toISOString(),
    outputs: [],
    primaryLanguage: docData.primaryLanguage || 'en',
    detectedLanguages: docData.detectedLanguages || ['en'],
    isRTL: !!docData.isRTL,
    ...docData
  };
  memoryDocs.unshift(newDoc);
  writeJson(DOCS_FILE, memoryDocs);
  return newDoc;
};

exports.updateDoc = (id, updates, userId = null) => {
  const doc = exports.getDocById(id, userId);
  if (!doc) return null;
  Object.assign(doc, updates);
  writeJson(DOCS_FILE, memoryDocs);
  return doc;
};

exports.deleteDoc = (id, userId = null) => {
  const strId = id ? id.toString() : '';
  const initialLen = memoryDocs.length;
  memoryDocs = memoryDocs.filter(d => {
    const isTarget = (d._id && d._id.toString() === strId) || (d.id && d.id.toString() === strId);
    if (!isTarget) return true;
    if (userId && d.user && d.user.toString() !== userId.toString()) {
      return true; // Not owned by requesting user -> keep it
    }
    return false; // Matched and authorized -> delete it
  });

  if (memoryDocs.length !== initialLen) {
    writeJson(DOCS_FILE, memoryDocs);
    return true;
  }
  return false;
};

// Flashcards store operations
exports.getFlashcards = () => memoryFlashcards;

exports.getFlashcardsByUser = (userId) => {
  if (!userId) return [];
  const strId = userId.toString();
  return memoryFlashcards.filter(f => f.user && f.user.toString() === strId);
};

exports.saveFlashcards = (sets) => {
  memoryFlashcards = sets;
  writeJson(FLASHCARDS_FILE, memoryFlashcards);
};

exports.deleteFlashcard = (id, userId) => {
  const strId = id ? id.toString() : '';
  const uStr = userId ? userId.toString() : '';
  const initialLen = memoryFlashcards.length;
  memoryFlashcards = memoryFlashcards.filter(f => {
    const isTarget = (f._id && f._id.toString() === strId) || (f.id && f.id.toString() === strId);
    if (!isTarget) return true;
    if (uStr && f.user && f.user.toString() !== uStr) {
      return true; // Do not delete another user's flashcard set
    }
    return false;
  });
  if (memoryFlashcards.length !== initialLen) {
    writeJson(FLASHCARDS_FILE, memoryFlashcards);
    return true;
  }
  return false;
};

// Plans store operations
exports.getPlans = () => memoryPlans;

exports.getPlansByUser = (userId) => {
  if (!userId) return [];
  const strId = userId.toString();
  return memoryPlans.filter(p => p.user && p.user.toString() === strId);
};

exports.savePlans = (plans) => {
  memoryPlans = plans;
  writeJson(PLANS_FILE, memoryPlans);
};

exports.deletePlan = (id, userId) => {
  const strId = id ? id.toString() : '';
  const uStr = userId ? userId.toString() : '';
  const plan = memoryPlans.find(p => (p._id && p._id.toString() === strId) || (p.id && p.id.toString() === strId));
  if (!plan) return false;
  if (uStr && plan.user && plan.user.toString() !== uStr) {
    return false; // Unauthorized
  }
  plan.isActive = false;
  writeJson(PLANS_FILE, memoryPlans);
  return true;
};
