const r = require('express').Router();
const mongoose = require('mongoose');
const { Flashcard } = require('../models');
const { authenticate } = require('../middleware/auth');
const localStore = require('../utils/localStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

const SAMPLE_FLASHCARDS = [
  {
    _id: '6acd1272c42773e489b74f01',
    id: '6acd1272c42773e489b74f01',
    isDemo: true,
    title: 'JDBC Core Concepts & Architecture',
    subject: 'Computer Science',
    totalCards: 4,
    masteredCards: 1,
    cards: [
      { _id: 'c1', question: 'What is JDBC?', answer: 'Java Database Connectivity — a standard Java API that manages connecting to relational databases, executing SQL statements, and reading ResultSets.', difficulty: 'easy', isKnown: true },
      { _id: 'c2', question: 'What are the four JDBC Driver types?', answer: 'Type 1: JDBC-ODBC Bridge, Type 2: Native-API Driver, Type 3: Network-Protocol Driver, Type 4: Thin Direct Pure Java Driver.', difficulty: 'medium', isKnown: false },
      { _id: 'c3', question: 'Why use PreparedStatement over Statement?', answer: 'PreparedStatement precompiles SQL statements, improves repeated query performance, and protects against SQL Injection attacks.', difficulty: 'medium', isKnown: false },
      { _id: 'c4', question: 'How is transaction management handled in JDBC?', answer: 'By setting connection.setAutoCommit(false), executing batch operations, and calling commit() or rollback().', difficulty: 'hard', isKnown: false }
    ],
    createdAt: new Date().toISOString()
  }
];

r.use(authenticate);

r.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!isDbConnected()) {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_MODE !== 'true') {
        return res.status(503).json({ error: 'Database service unavailable.' });
      }
      const sets = localStore.getFlashcardsByUser(userId);
      return res.json({ success: true, flashcardSets: sets.length ? sets : SAMPLE_FLASHCARDS });
    }

    const sets = await Flashcard.find({ user: userId }).sort({ createdAt: -1 });
    if (sets.length === 0) {
      return res.json({ success: true, flashcardSets: SAMPLE_FLASHCARDS });
    }
    res.json({ success: true, flashcardSets: sets });
  } catch (e) {
    next(e);
  }
});

r.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    let s = null;

    if (isDbConnected() && mongoose.Types.ObjectId.isValid(req.params.id)) {
      s = await Flashcard.findOne({ _id: req.params.id, user: userId });
    }

    if (!s && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true')) {
      const sets = localStore.getFlashcardsByUser(userId);
      s = sets.find(f => (f._id && f._id.toString() === req.params.id) || (f.id && f.id.toString() === req.params.id));
    }

    if (!s) {
      s = SAMPLE_FLASHCARDS.find(f => f._id === req.params.id || f.id === req.params.id);
    }

    if (!s) {
      return res.status(404).json({ error: 'Flashcard set not found or access denied.' });
    }

    res.json({ success: true, flashcardSet: s });
  } catch (e) {
    next(e);
  }
});

r.patch('/:sid/cards/:cid', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(req.params.sid)) {
        return res.status(404).json({ error: 'Flashcard set not found.' });
      }
      const s = await Flashcard.findOne({ _id: req.params.sid, user: userId });
      if (!s) return res.status(404).json({ error: 'Flashcard set not found or access denied.' });

      const card = s.cards.id(req.params.cid);
      if (!card) return res.status(404).json({ error: 'Card not found.' });

      if (req.body.isKnown !== undefined) card.isKnown = Boolean(req.body.isKnown);
      if (req.body.difficulty) card.difficulty = req.body.difficulty;
      s.masteredCards = s.cards.filter(c => c.isKnown).length;
      await s.save();
      return res.json({ success: true, flashcardSet: s });
    }

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const sets = localStore.getFlashcards();
      const s = sets.find(f => ((f._id && f._id.toString() === req.params.sid) || (f.id && f.id.toString() === req.params.sid)) && (f.user && f.user.toString() === userId.toString()));
      if (s) {
        const card = (s.cards || []).find(c => (c._id && c._id.toString() === req.params.cid) || (c.id && c.id.toString() === req.params.cid));
        if (card) {
          if (req.body.isKnown !== undefined) card.isKnown = Boolean(req.body.isKnown);
          if (req.body.difficulty) card.difficulty = req.body.difficulty;
        }
        s.masteredCards = (s.cards || []).filter(c => c.isKnown).length;
        localStore.saveFlashcards(sets);
        return res.json({ success: true, flashcardSet: s });
      }
    }

    return res.status(404).json({ error: 'Flashcard set not found or access denied.' });
  } catch (e) {
    next(e);
  }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ error: 'Flashcard set not found.' });
      }
      const deleted = await Flashcard.findOneAndDelete({ _id: req.params.id, user: userId });
      if (!deleted) return res.status(404).json({ error: 'Flashcard set not found or access denied.' });
      return res.json({ success: true });
    }

    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_MODE === 'true') {
      const success = localStore.deleteFlashcard(req.params.id, userId);
      if (!success) return res.status(404).json({ error: 'Flashcard set not found or access denied.' });
      return res.json({ success: true });
    }

    res.status(503).json({ error: 'Database service unavailable.' });
  } catch (e) {
    next(e);
  }
});

module.exports = r;
