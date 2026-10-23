const mongoose = require('mongoose');
const { Document, Chat } = require('../models');
const { answerChat } = require('../services/aiService');
const { SAMPLE_DEMO_DOCS } = require('./documentController');
const localStore = require('../utils/localStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

exports.message = async (req, res, next) => {
  try {
    const { message, documentId, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required.' });
    const userId = req.user?.id || req.user?._id;

    // Get document text with strict multi-tenant ownership check
    let docText = '';
    let docTitle = '';
    if (documentId) {
      let doc = null;
      if (isDbConnected() && mongoose.Types.ObjectId.isValid(documentId)) {
        try {
          doc = await Document.findOne({ _id: documentId, user: userId });
        } catch (err) {
          console.warn('[Chat Document Lookup Error]', err.message);
        }
      }
      if (!doc) {
        doc = localStore.getDocById(documentId, userId);
      }
      if (!doc && SAMPLE_DEMO_DOCS?.length > 0) {
        doc = SAMPLE_DEMO_DOCS.find(d => (d._id && d._id.toString() === documentId.toString()) || d.id === documentId);
      }
      if (doc) {
        docText = doc.extractedText || '';
        docTitle = doc.title;
        console.log(`[Chat] Using doc "${docTitle}" (${docText.length} chars)`);
      }
    }

    // In DB mode, save session
    if (isDbConnected()) {
      let session = null;
      if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
        session = await Chat.findOne({ _id: sessionId, user: userId });
      }
      if (!session) {
        session = await Chat.create({ user: userId, docId: documentId && mongoose.Types.ObjectId.isValid(documentId) ? documentId : null, docTitle });
      }

      const reply = await answerChat(message, docText, session.messages || []);

      session.messages.push({ role: 'user', content: message });
      session.messages.push({ role: 'assistant', content: reply });
      if (session.messages.length > 80) session.messages = session.messages.slice(-80);
      await session.save();

      return res.json({ success: true, reply, sessionId: session._id });
    }

    // Offline / Demo mode
    const reply = await answerChat(message, docText, []);
    res.json({ success: true, reply, sessionId: 'demo_chat_session' });
  } catch (e) {
    next(e);
  }
};

exports.sessions = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!isDbConnected()) {
      return res.json({
        success: true,
        sessions: [
          { _id: 'demo_chat_session', docTitle: 'Java Database Connectivity (JDBC) & Architecture', updatedAt: new Date().toISOString() }
        ]
      });
    }
    const sessions = await Chat.find({ user: userId }).select('-messages').sort({ updatedAt: -1 }).limit(20);
    res.json({ success: true, sessions });
  } catch (e) {
    next(e);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!isDbConnected()) {
      return res.json({
        success: true,
        session: {
          _id: 'demo_chat_session',
          docTitle: 'Java Database Connectivity (JDBC) & Architecture',
          messages: [
            { role: 'assistant', content: 'Hello! I can answer questions directly based on your JDBC document. Ask me anything!' }
          ]
        }
      });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Chat session not found.' });
    }
    const s = await Chat.findOne({ _id: req.params.id, user: userId });
    if (!s) return res.status(404).json({ error: 'Chat session not found or access denied.' });
    res.json({ success: true, session: s });
  } catch (e) {
    next(e);
  }
};

exports.deleteSession = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (isDbConnected() && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const result = await Chat.findOneAndDelete({ _id: req.params.id, user: userId });
      if (!result) return res.status(404).json({ error: 'Chat session not found or access denied.' });
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
