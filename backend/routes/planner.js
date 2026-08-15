const r = require('express').Router();
const { Plan } = require('../models');
const { authenticate } = require('../middleware/auth');
const ai = require('../services/aiService');
const { Document } = require('../models');
r.use(authenticate);

r.get('/', async (req, res, next) => {
  try { res.json({ success:true, plans: await Plan.find({ user:req.user.id, isActive:true }).sort({ createdAt:-1 }) }); }
  catch(e) { next(e); }
});

// Generate full syllabus-based plan
r.post('/generate', async (req, res, next) => {
  try {
    const { subjects=[], examDate, dailyHours=6, title='Study Plan', documentId, syllabus='' } = req.body;
    const startDate = new Date();
    const endDate = examDate ? new Date(examDate) : new Date(Date.now() + 30*86400000);
    const totalDays = Math.max(1, Math.ceil((endDate - startDate) / 86400000));
    
    let importantTopics = [];
    let docText = '';
    // If document provided, extract important topics
    if (documentId) {
      try {
        const doc = await Document.findOne({ _id: documentId, user: req.user.id });
        if (doc?.extractedText) {
          docText = doc.extractedText;
          const qData = await ai.generateImportantQuestions(docText, doc.subject||doc.title, examDate);
          importantTopics = qData.likelyQuestions || [];
        }
      } catch(e) {}
    }

    const tasks = [];
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    let taskDate = new Date(startDate);
    let topicIdx = 0;

    for (let d = 0; d < Math.min(totalDays, 42); d++) {
      const dayName = days[taskDate.getDay()];
      const isSunday = taskDate.getDay() === 0;
      const dateStr = taskDate.toISOString().split('T')[0];

      if (isSunday) {
        tasks.push({ day:`${dayName} (Revision)`, date:new Date(taskDate), subject:'Revision', topic:'Full Revision', task:'Revise all previous week topics. Solve 20 MCQs.', duration:180, priority:'high' });
      } else {
        const sub = subjects.length > 0 ? subjects[topicIdx % subjects.length] : 'General';
        const importantQ = importantTopics.filter(q => q.estimatedDay === (d+1)).map(q => q.question).slice(0,2);
        tasks.push({
          day:`${dayName} ${dateStr}`, date:new Date(taskDate),
          subject:sub, topic:`Week ${Math.ceil((d+1)/7)} Day ${(d%7)+1}`,
          task:`Study ${sub} — ${syllabus ? `[${syllabus}] ` : ''}Day ${d+1} content`,
          duration: dailyHours * 60, priority: d < 3 ? 'high' : d < 7 ? 'medium' : 'low',
          importantQuestions: importantQ
        });
        topicIdx++;
      }
      taskDate.setDate(taskDate.getDate() + 1);
    }

    const plan = await Plan.create({ user:req.user.id, title, examDate:endDate, subjects, dailyHours, isActive:true, tasks });
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
  try { await Plan.findOneAndUpdate({ _id:req.params.id, user:req.user.id }, { isActive:false }); res.json({ success:true }); }
  catch(e) { next(e); }
});

module.exports = r;
