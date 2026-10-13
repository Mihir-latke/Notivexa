const mongoose = require('mongoose');
const { Document, Chat } = require('../models');
const { answerChat } = require('../services/aiService');
const { SAMPLE_DEMO_DOCS } = require('./documentController');

const isDbConnected = () => mongoose.connection.readyState === 1;

exports.message = async (req, res, next) => {
  try {
    const { message, documentId, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required.' });
    
    // Get document text
    let docText = '';
    let docTitle = '';
    if (documentId) {
      let doc = null;
      if (isDbConnected()) {
        try { doc = await Document.findOne({ _id: documentId, user: req.user.id }); } catch {}
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
      let session = sessionId ? await Chat.findOne({ _id: sessionId, user: req.user.id }) : null;
      if (!session) session = await Chat.create({ user: req.user.id, docId: documentId || null, docTitle });
      
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
  } catch(e) { next(e); }
};

exports.sessions = async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      return res.json({
        success: true,
        sessions: [
          { _id: 'demo_chat_session', docTitle: 'Java Database Connectivity (JDBC) & Architecture', updatedAt: new Date().toISOString() }
        ]
      });
    }
    const sessions = await Chat.find({ user: req.user.id }).select('-messages').sort({ updatedAt: -1 }).limit(20);
    res.json({ success: true, sessions });
  } catch(e) { next(e); }
};

exports.getSession = async (req, res, next) => {
  try {
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
    const s = await Chat.findOne({ _id: req.params.id, user: req.user.id });
    if (!s) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true, session: s });
  } catch(e) { next(e); }
};

exports.deleteSession = async (req, res, next) => {
  try {
    if (isDbConnected()) {
      await Chat.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    }
    res.json({ success: true });
  } catch(e) { next(e); }
};
