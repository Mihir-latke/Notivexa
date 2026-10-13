const r = require('express').Router();
const { Plan } = require('../models');
const { authenticate } = require('../middleware/auth');
r.use(authenticate);
r.get('/', async (req, res, next) => {
  try { res.json({ success:true, plans: await Plan.find({ user:req.user.id, isActive:true }).sort({ createdAt:-1 }) }); } catch(e) { next(e); }
});
r.post('/generate', async (req, res, next) => {
  try {
    const { subjects=[], examDate, dailyHours=6, title='Study Plan' } = req.body;
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const tasks = [];
    let d = 0;
    for (let w=1;w<=2;w++) {
      days.forEach(day => {
        if (day==='Saturday') { tasks.push({ day:`Week ${w} Saturday`, subject:'Revision', task:'Weekly revision of all subjects', duration:120, priority:'high' }); return; }
        const sub = subjects.length>0 ? subjects[d%subjects.length] : 'General';
        tasks.push({ day:`Week ${w} ${day}`, subject:sub, task:`Study ${sub} — Chapter ${d+1}`, duration:dailyHours*30, priority:d%3===0?'high':'medium' });
        d++;
      });
    }
    const plan = await Plan.create({ user:req.user.id, title, examDate, subjects, dailyHours, isActive:true, tasks });
    res.status(201).json({ success:true, plan });
  } catch(e) { next(e); }
});
r.patch('/:planId/tasks/:taskId', async (req, res, next) => {
  try {
    const plan = await Plan.findOne({ _id:req.params.planId, user:req.user.id });
    if (!plan) return res.status(404).json({ error:'Not found.' });
    const task = plan.tasks.id(req.params.taskId);
    if (!task) return res.status(404).json({ error:'Task not found.' });
    Object.assign(task, req.body); await plan.save();
    res.json({ success:true, plan });
  } catch(e) { next(e); }
});
r.delete('/:id', async (req, res, next) => {
  try {
    await Plan.findOneAndUpdate({ _id:req.params.id, user:req.user.id }, { isActive:false });
    res.json({ success:true });
  } catch(e) { next(e); }
});
module.exports = r;