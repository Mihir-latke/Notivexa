const r = require('express').Router();
const c = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');
r.use(authenticate);
r.post('/message',        c.message);
r.get('/sessions',        c.sessions);
r.get('/sessions/:id',    c.getSession);
r.delete('/sessions/:id', c.deleteSession);
module.exports = r;