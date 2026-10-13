const r = require('express').Router();
const mongoose = require('mongoose');
const { Plan } = require('../models');
const { authenticate } = require('../middleware/auth');
const localStore = require('../utils/localStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

const SAMPLE_PLAN = {
  _id: '6acd1272c42773e489b74f02',
  title: 'Autonomous Exam Preparation (2-Week Sprint)',
  dailyHours: 6,
  isActive: true,
  subjects: ['Computer Networks', 'JDBC & Databases', 'Operating Systems'],
  tasks: [
    { day: 'Week 1 Monday', subject: 'JDBC & Databases', task: 'Study JDBC Architecture & Driver Types', duration: 180, priority: 'high', completed: true },
    { day: 'Week 1 Tuesday', subject: 'Computer Networks', task: 'Review OSI 7-Layer Model & TCP/IP Stack', duration: 180, priority: 'medium', completed: false },
    { day: 'Week 1 Wednesday', subject: 'Operating Systems', task: 'Process Synchronization & Semaphores', duration: 180, priority: 'high', completed: false },
    { day: 'Week 1 Saturday', subject: 'Revision', task: 'Weekly revision and practice question papers', duration: 120, priority: 'high', completed: false }
  ],
  createdAt: new Date().toISOString()
};

r.use(authenticate);

r.get('/', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      const plans = localStore.getPlans().filter(p => (!p.user || p.user === req.user?.id) && p.isActive !== false);
      return res.json({ success: true, plans: plans.length ? plans : [SAMPLE_PLAN] });
    }
    const plans = await Plan.find({ user: req.user.id, isActive: true }).sort({ createdAt: -1 });
    if (plans.length === 0) {
      return res.json({ success: true, plans: [SAMPLE_PLAN] });
    }
    res.json({ success: true, plans });
  } catch(e) { next(e); }
});

r.post('/generate', async (req, res, next) => {
  try {
    const { subjects=[], examDate, dailyHours=6, title='Study Plan' } = req.body;
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const tasks = [];
    let d = 0;
    for (let w=1;w<=2;w++) {
      days.forEach(day => {
        if (day==='Saturday') {
          tasks.push({ day:`Week ${w} Saturday`, subject:'Revision', task:'Weekly revision of all subjects', duration:120, priority:'high' });
          return;
        }
        const sub = subjects.length>0 ? subjects[d%subjects.length] : 'General';
        tasks.push({ day:`Week ${w} ${day}`, subject:sub, task:`Study ${sub} — Chapter ${d+1}`, duration:dailyHours*30, priority:d%3===0?'high':'medium' });
        d++;
      });
    }

    if (!isDbConnected()) {
      const plan = { _id: 'plan_' + Date.now(), id: 'plan_' + Date.now(), user: req.user.id, title, examDate, subjects, dailyHours, isActive: true, tasks, createdAt: new Date().toISOString() };
      const plans = localStore.getPlans();
      plans.unshift(plan);
      localStore.savePlans(plans);
      return res.status(201).json({ success: true, plan });
    }

    const plan = await Plan.create({ user: req.user.id, title, examDate, subjects, dailyHours, isActive: true, tasks });
    res.status(201).json({ success: true, plan });
  } catch(e) { next(e); }
});

r.patch('/:planId/tasks/:taskId', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      const plans = localStore.getPlans();
      const plan = plans.find(p => p._id === req.params.planId || p.id === req.params.planId);
      if (plan) {
        const task = (plan.tasks || []).find((t, idx) => (t._id && t._id.toString() === req.params.taskId) || (t.id && t.id.toString() === req.params.taskId) || idx.toString() === req.params.taskId);
        if (task) Object.assign(task, req.body);
        localStore.savePlans(plans);
        return res.json({ success: true, plan });
      }
      return res.json({ success: true, plan: SAMPLE_PLAN });
    }
    const plan = await Plan.findOne({ _id: req.params.planId, user: req.user.id });
    if (!plan) return res.status(404).json({ error: 'Not found.' });
    const task = plan.tasks.id(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    Object.assign(task, req.body);
    await plan.save();
    res.json({ success: true, plan });
  } catch(e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    if (!isDbConnected()) {
      const plans = localStore.getPlans();
      const plan = plans.find(p => p._id === req.params.id || p.id === req.params.id);
      if (plan) plan.isActive = false;
      localStore.savePlans(plans);
      return res.json({ success: true });
    }
    await Plan.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { isActive: false });
    res.json({ success: true });
  } catch(e) { next(e); }
});

module.exports = r;