const { Document, Chat } = require('../models');
const { answerChat } = require('../services/aiService');

exports.message = async (req, res, next) => {
  try {
    const { message, documentId, sessionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required.' });
    
    // Get document text
    let docText = '';
    let docTitle = '';
    if (documentId) {
      const doc = await Document.findOne({ _id: documentId, user: req.user.id });
      if (doc) {
        docText = doc.extractedText || '';
        docTitle = doc.title;
        console.log(`[Chat] Using doc "${docTitle}" (${docText.length} chars)`);
      }
    }
    
    // Get or create session
    let session = sessionId ? await Chat.findOne({ _id: sessionId, user: req.user.id }) : null;
    if (!session) session = await Chat.create({ user: req.user.id, docId: documentId || null, docTitle });
    
    // Get detailed answer
    const reply = await answerChat(message, docText, session.messages);
    
    // Save conversation
    session.messages.push({ role: 'user', content: message });
    session.messages.push({ role: 'assistant', content: reply });
    if (session.messages.length > 80) session.messages = session.messages.slice(-80);
    await session.save();
    
    res.json({ success: true, reply, sessionId: session._id });
  } catch(e) { next(e); }
};

exports.sessions = async (req, res, next) => {
  try {
    const sessions = await Chat.find({ user: req.user.id }).select('-messages').sort({ updatedAt: -1 }).limit(20);
    res.json({ success: true, sessions });
  } catch(e) { next(e); }
};

exports.getSession = async (req, res, next) => {
  try {
    const s = await Chat.findOne({ _id: req.params.id, user: req.user.id });
    if (!s) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true, session: s });
  } catch(e) { next(e); }
};

exports.deleteSession = async (req, res, next) => {
  try { await Chat.findOneAndDelete({ _id: req.params.id, user: req.user.id }); res.json({ success: true }); }
  catch(e) { next(e); }
};
