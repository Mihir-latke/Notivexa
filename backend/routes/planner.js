const r = require('express').Router();
const mongoose = require('mongoose');
const { Plan } = require('../models');
const { authenticate } = require('../middleware/auth');
const localStore = require('../utils/localStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

const SAMPLE_PLAN = {
  _id: '6acd1272c42773e489b74f02',
  id: '6acd1272c42773e489b74f02',
  isDemo: true,
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
    const userId = req.user?.id || req.user?._id;

    if (!isDbConnected()) {
      const plans = localStore.getPlansByUser(userId).filter(p => p.isActive !== false);
      return res.json({ success: true, plans: plans.length ? plans : [SAMPLE_PLAN] });
    }

    const plans = await Plan.find({ user: userId, isActive: true }).sort({ createdAt: -1 });
    if (plans.length === 0) {
      return res.json({ success: true, plans: [SAMPLE_PLAN] });
    }
    res.json({ success: true, plans });
  } catch (e) {
    next(e);
  }
});

r.post('/generate', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { subjects = [], examDate, dailyHours = 6, title = 'Study Plan' } = req.body;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const tasks = [];
    let d = 0;
    for (let w = 1; w <= 2; w++) {
      days.forEach(day => {
        if (day === 'Saturday') {
          tasks.push({ day: `Week ${w} Saturday`, subject: 'Revision', task: 'Weekly revision of all subjects', duration: 120, priority: 'high', completed: false });
          return;
        }
        const sub = subjects.length > 0 ? subjects[d % subjects.length] : 'General';
        tasks.push({ day: `Week ${w} ${day}`, subject: sub, task: `Study ${sub} — Chapter ${d + 1}`, duration: dailyHours * 30, priority: d % 3 === 0 ? 'high' : 'medium', completed: false });
        d++;
      });
    }

    if (!isDbConnected()) {
      const plan = {
        _id: 'plan_' + Date.now(),
        id: 'plan_' + Date.now(),
        user: userId,
        title: title.trim(),
        examDate,
        subjects,
        dailyHours,
        isActive: true,
        tasks,
        createdAt: new Date().toISOString()
      };
      const plans = localStore.getPlans();
      plans.unshift(plan);
      localStore.savePlans(plans);
      return res.status(201).json({ success: true, plan });
    }

    const plan = await Plan.create({
      user: userId,
      title: title.trim(),
      examDate,
      subjects,
      dailyHours,
      isActive: true,
      tasks
    });
    res.status(201).json({ success: true, plan });
  } catch (e) {
    next(e);
  }
});

r.patch('/:planId/tasks/:taskId', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(req.params.planId)) {
        return res.status(404).json({ error: 'Plan not found.' });
      }
      const plan = await Plan.findOne({ _id: req.params.planId, user: userId });
      if (!plan) return res.status(404).json({ error: 'Plan not found or access denied.' });

      const task = plan.tasks.id(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found.' });

      if (req.body.completed !== undefined) task.completed = Boolean(req.body.completed);
      if (req.body.task) task.task = req.body.task;
      if (req.body.duration) task.duration = Number(req.body.duration);
      if (req.body.priority) task.priority = req.body.priority;

      await plan.save();
      return res.json({ success: true, plan });
    }

    const plans = localStore.getPlans();
    const plan = plans.find(p => ((p._id && p._id.toString() === req.params.planId) || (p.id && p.id.toString() === req.params.planId)) && (p.user && p.user.toString() === userId.toString()));
    if (plan) {
      const task = (plan.tasks || []).find((t, idx) => (t._id && t._id.toString() === req.params.taskId) || (t.id && t.id.toString() === req.params.taskId) || idx.toString() === req.params.taskId);
      if (task) {
        if (req.body.completed !== undefined) task.completed = Boolean(req.body.completed);
        if (req.body.task) task.task = req.body.task;
        if (req.body.duration) task.duration = Number(req.body.duration);
        if (req.body.priority) task.priority = req.body.priority;
      }
      localStore.savePlans(plans);
      return res.json({ success: true, plan });
    }

    return res.status(404).json({ error: 'Plan not found or access denied.' });
  } catch (e) {
    next(e);
  }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (isDbConnected()) {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ error: 'Plan not found.' });
      }
      const updated = await Plan.findOneAndUpdate({ _id: req.params.id, user: userId }, { isActive: false });
      if (!updated) return res.status(404).json({ error: 'Plan not found or access denied.' });
      return res.json({ success: true });
    }

    const success = localStore.deletePlan(req.params.id, userId);
    if (!success) return res.status(404).json({ error: 'Plan not found or access denied.' });
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = r;
