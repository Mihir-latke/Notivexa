const r = require('express').Router();
const { Flashcard } = require('../models');
const { authenticate } = require('../middleware/auth');
r.use(authenticate);
r.get('/', async (req, res, next) => {
  try { res.json({ success:true, flashcardSets: await Flashcard.find({ user:req.user.id }).sort({ createdAt:-1 }) }); } catch(e) { next(e); }
});
r.get('/:id', async (req, res, next) => {
  try {
    const s = await Flashcard.findOne({ _id:req.params.id, user:req.user.id });
    if (!s) return res.status(404).json({ error:'Not found.' });
    res.json({ success:true, flashcardSet:s });
  } catch(e) { next(e); }
});
r.patch('/:sid/cards/:cid', async (req, res, next) => {
  try {
    const s = await Flashcard.findOne({ _id:req.params.sid, user:req.user.id });
    if (!s) return res.status(404).json({ error:'Not found.' });
    const card = s.cards.id(req.params.cid);
    if (!card) return res.status(404).json({ error:'Card not found.' });
    Object.assign(card, req.body);
    s.masteredCards = s.cards.filter(c=>c.isKnown).length;
    await s.save();
    res.json({ success:true, flashcardSet:s });
  } catch(e) { next(e); }
});
r.delete('/:id', async (req, res, next) => {
  try { await Flashcard.findOneAndDelete({ _id:req.params.id, user:req.user.id }); res.json({ success:true }); } catch(e) { next(e); }
});
module.exports = r;