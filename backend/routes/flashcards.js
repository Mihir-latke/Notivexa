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
    if (!isDbConnected()) {
      const sets = localStore.getFlashcards().filter(s => !s.user || s.user === req.user?.id);
      return res.json({ success: true, flashcardSets: sets.length ? sets : SAMPLE_FLASHCARDS });
    }
    const sets = await Flashcard.find({ user: req.user.id }).sort({ createdAt: -1 });
    if (sets.length === 0) {
      return res.json({ success: true, flashcardSets: SAMPLE_FLASHCARDS });
    }
    res.json({ success: true, flashcardSets: sets });
  } catch(e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      const sets = localStore.getFlashcards();
      let s = sets.find(f => (f._id && f._id.toString() === req.params.id) || (f.id && f.id.toString() === req.params.id));
      if (!s) s = SAMPLE_FLASHCARDS.find(f => f._id === req.params.id || f.id === req.params.id);
      return res.json({ success: true, flashcardSet: s || SAMPLE_FLASHCARDS[0] });
    }
    let s = await Flashcard.findOne({ _id: req.params.id, user: req.user.id });
    if (!s) s = SAMPLE_FLASHCARDS.find(f => f._id === req.params.id || f.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true, flashcardSet: s });
  } catch(e) { next(e); }
});

r.patch('/:sid/cards/:cid', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      const sets = localStore.getFlashcards();
      const s = sets.find(f => f._id === req.params.sid || f.id === req.params.sid);
      if (s) {
        const card = (s.cards || []).find(c => c._id === req.params.cid || c.id === req.params.cid);
        if (card) Object.assign(card, req.body);
        s.masteredCards = (s.cards || []).filter(c => c.isKnown).length;
        localStore.saveFlashcards(sets);
        return res.json({ success: true, flashcardSet: s });
      }
      return res.json({ success: true, flashcardSet: SAMPLE_FLASHCARDS[0] });
    }
    const s = await Flashcard.findOne({ _id: req.params.sid, user: req.user.id });
    if (!s) return res.status(404).json({ error: 'Not found.' });
    const card = s.cards.id(req.params.cid);
    if (!card) return res.status(404).json({ error: 'Card not found.' });
    Object.assign(card, req.body);
    s.masteredCards = s.cards.filter(c => c.isKnown).length;
    await s.save();
    res.json({ success: true, flashcardSet: s });
  } catch(e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      let sets = localStore.getFlashcards();
      sets = sets.filter(f => f._id !== req.params.id && f.id !== req.params.id);
      localStore.saveFlashcards(sets);
      return res.json({ success: true });
    }
    await Flashcard.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = r;