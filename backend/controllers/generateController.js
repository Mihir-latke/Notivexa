const { Document, Flashcard, User } = require('../models');
const ai = require('../services/aiService');
const { notesPDF, handwrittenPDF, allHandwrittenPDFs, questionPaperPDF, slidePDF } = require('../services/pdfGenerator');

// ── CORE: get document text ───────────────────────────────
async function getDocText(docId, userId, secIdx) {
  const doc = await Document.findOne({ _id: docId, user: userId });
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  let text = '';
  if (secIdx !== undefined && secIdx !== null && doc.sections?.length > 0) {
    const s = doc.sections[parseInt(secIdx)];
    if (s?.content?.length > 30) text = s.content;
  }
  if (!text) text = doc.extractedText || doc.imageAnalysis || '';
  if (!text || text.trim().length < 20) throw new Error('No readable text. Please re-upload the PDF.');
  console.log(`[GEN] "${doc.title}" ${text.length} chars`);
  return { doc, text };
}

// ── helper: safe push to doc.outputs ─────────────────────
function pushOutput(doc, kind, language, fileName, filePath, fileSize) {
  doc.outputs.push({ kind, language, fileName: fileName||'', filePath: filePath||'', fileSize: fileSize||0 });
}

// ── 1. NOTES ─────────────────────────────────────────────
exports.notes = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateNotes(text, doc.title, doc.subject||'General', language);
    const pdf = await notesPDF(content, { title: doc.title, subject: doc.subject||'General' });
    pushOutput(doc, 'notes', language, pdf.fileName, pdf.filePath, pdf.fileSize);
    await doc.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.notesGenerated': 1 } });
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName, fileSize:pdf.fileSize });
  } catch(e) { next(e); }
};

// ── 2. SUMMARY ───────────────────────────────────────────
exports.summary = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateSummary(text, doc.title, doc.subject||'General', language);
    res.json({ success:true, content });
  } catch(e) { next(e); }
};

// ── 3. FLASHCARDS ────────────────────────────────────────
exports.flashcards = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English', count = 10 } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const cards = await ai.generateFlashcards(text, doc.subject||doc.title, parseInt(count)||10, language);
    if (!Array.isArray(cards) || cards.length === 0) throw new Error('No flashcards generated. Try again.');
    const set = await Flashcard.create({
      user:req.user.id, documentId:doc._id, documentTitle:doc.title,
      title:`${doc.title} — Flashcards`, subject:doc.subject||doc.title,
      language, cards, totalCards:cards.length
    });
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.flashcardsCreated': cards.length } });
    res.json({ success:true, flashcardSet:set });
  } catch(e) { next(e); }
};

// ── 4. QUESTIONS ─────────────────────────────────────────
exports.questions = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateQuestions(text, doc.title, doc.subject||'General', language);
    const pdf = await notesPDF(content, { title:`${doc.title} — Questions`, subject:doc.subject||'General' });
    pushOutput(doc, 'questions', language, pdf.fileName, pdf.filePath, pdf.fileSize);
    await doc.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.questionsGenerated': 1 } });
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

// ── 5. UNIVERSITY QUESTION PAPER (20M / 60M) ─────────────
exports.paper = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English', examType = '60_MARKS',
            institution = 'University', sets = 3, className = 'FYMCA' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const paperSets = await ai.generateQuestionPaper(text, doc.subject||doc.title, examType, institution, className, language, parseInt(sets)||3);
    const pdfFiles = [];
    for (const set of paperSets) {
      const marks = examType === '20_MARKS' ? 20 : 60;
      const hours = examType === '20_MARKS' ? 1 : 2;
      const pdf = await questionPaperPDF(set.content, { title:doc.title, subject:doc.subject||doc.title, totalMarks:marks, timeHours:hours, institution, examType, className });
      pdfFiles.push({ setNumber:set.setNumber, fileName:pdf.fileName, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileSize:pdf.fileSize });
      pushOutput(doc, 'paper', language, pdf.fileName, pdf.filePath, pdf.fileSize);
    }
    await doc.save();
    res.json({ success:true, sets:paperSets, pdfFiles, message:`${paperSets.length} ${examType.replace('_',' ')} sets generated` });
  } catch(e) { next(e); }
};

// ── 6. HANDWRITTEN (4 styles) ────────────────────────────
exports.handwritten = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateHandwrittenNotes(text, doc.title, doc.subject||'General', language);
    const pdfs = await allHandwrittenPDFs(content, { title:doc.title, subject:doc.subject||'General' });
    pushOutput(doc, 'handwritten', language, pdfs[0].fileName, '', pdfs[0].fileSize);
    await doc.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.notesGenerated': 1 } });
    res.json({ success:true, content, styles:pdfs, defaultUrl:pdfs[0].downloadUrl, message:'Handwritten notes ready!' });
  } catch(e) { next(e); }
};

// ── 7. PODCAST (script + real audio) ────────────────────
exports.podcast = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English', voiceStyle = 'male' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const script = await ai.generatePodcast(text, doc.title, doc.subject||'General', language);
    const langMap = { English:'en-IN', Hindi:'hi-IN', Marathi:'mr-IN', Bengali:'bn-IN', Tamil:'ta-IN', Telugu:'te-IN' };
    const audio = await ai.generateAudio(script, { language:langMap[language]||'en-IN', voiceStyle });
    pushOutput(doc, 'podcast', language, audio.fileName, audio.filePath, audio.fileSize);
    await doc.save();
    res.json({ success:true, script, audioUrl:`/uploads/audio/${audio.fileName}`, fileName:audio.fileName, duration:audio.duration, provider:audio.provider, note:audio.note||null });
  } catch(e) { next(e); }
};

// ── 8. VIDEO LECTURE (20 min script + slides + audio) ────
exports.video = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const [script, pptData] = await Promise.all([
      ai.generateVideoScript(text, doc.title, doc.subject||'General', language),
      ai.generatePPT(text, doc.title, doc.subject||'General', language)
    ]);
    let slideFile = null;
    try { slideFile = await slidePDF(pptData, { title:doc.title }); } catch(e) { console.warn('[slides]', e.message); }
    const audio = await ai.generateAudio(script, { language:'en-IN', voiceStyle:'male' });
    pushOutput(doc, 'video', language, slideFile?.fileName||audio.fileName, slideFile?.filePath||'', slideFile?.fileSize||0);
    await doc.save();
    res.json({
      success:true, script, pptData,
      slidesUrl: slideFile ? `/uploads/generated/${slideFile.fileName}` : null,
      audioUrl: `/uploads/audio/${audio.fileName}`,
      audioProvider: audio.provider, audioDuration: audio.duration, audioNote: audio.note,
      message: '20-min lecture: complete script + slides PDF + narration audio'
    });
  } catch(e) { next(e); }
};

// ── 9. PPT / SLIDES ──────────────────────────────────────
exports.ppt = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const pptData = await ai.generatePPT(text, doc.title, doc.subject||'General', language);
    const pdf = await slidePDF(pptData, { title:doc.title });
    pushOutput(doc, 'ppt', language, pdf.fileName, pdf.filePath, pdf.fileSize);
    await doc.save();
    res.json({ success:true, pptData, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

// ── 10. MIND MAP ─────────────────────────────────────────
exports.mindmap = async (req, res, next) => {
  try {
    const { documentId, sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const data = await ai.generateMindmap(text, doc.title);
    res.json({ success:true, mindmapData:data });
  } catch(e) { next(e); }
};

// ── 11. VOCABULARY ───────────────────────────────────────
exports.vocabulary = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const vocab = await ai.generateVocabulary(text, doc.subject||'General', language);
    res.json({ success:true, vocabulary:vocab });
  } catch(e) { next(e); }
};

// ── 12. IMAGE ANALYSIS ───────────────────────────────────
exports.analyzeImage = async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image data.' });
    const analysis = await ai.analyzeImage(imageBase64);
    res.json({ success:true, analysis });
  } catch(e) { next(e); }
};

// ── 13. IMPORTANT QUESTIONS for planner ──────────────────
exports.importantQuestions = async (req, res, next) => {
  try {
    const { documentId, examDate } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, undefined);
    const data = await ai.generateImportantQuestions(text, doc.subject||doc.title, examDate);
    res.json({ success:true, ...data, subject:doc.subject||doc.title });
  } catch(e) { next(e); }
};

// ── 14. LESSON PLAN (teacher feature) ───────────────────
exports.lessonPlan = async (req, res, next) => {
  try {
    const { documentId, weeks = 4, hoursPerWeek = 3 } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, undefined);
    const plan = await ai.generateLessonPlan(text, doc.title, doc.subject||'General', parseInt(weeks), parseInt(hoursPerWeek));
    const pdf = await notesPDF(plan, { title:`Lesson Plan — ${doc.title}`, subject:doc.subject||'General' });
    res.json({ success:true, plan, downloadUrl:`/uploads/generated/${pdf.fileName}` });
  } catch(e) { next(e); }
};

// ── 15. ASSIGNMENT GENERATOR ─────────────────────────────
exports.assignment = async (req, res, next) => {
  try {
    const { documentId, sectionIndex, language = 'English' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateAssignment(text, doc.title, doc.subject||'General', language);
    const pdf = await notesPDF(content, { title:`Assignment — ${doc.title}`, subject:doc.subject||'General' });
    pushOutput(doc, 'assignment', language, pdf.fileName, pdf.filePath, pdf.fileSize);
    await doc.save();
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

// ── 16. MULTI-PDF FUSION (combine multiple docs) ─────────
exports.fuseDocs = async (req, res, next) => {
  try {
    const { documentIds, language = 'English', outputType = 'notes' } = req.body;
    if (!Array.isArray(documentIds) || documentIds.length < 2) return res.status(400).json({ error: 'Provide at least 2 document IDs.' });
    const docs = await Document.find({ _id: { $in: documentIds }, user: req.user.id });
    if (docs.length === 0) return res.status(404).json({ error: 'No documents found.' });
    const combined = docs.map(d => `=== ${d.title} ===\n${(d.extractedText||'').slice(0, 4000)}`).join('\n\n');
    const title = docs.map(d => d.title).join(' + ');
    let content, pdf;
    if (outputType === 'summary') content = await ai.generateSummary(combined, title, 'Combined', language);
    else content = await ai.generateNotes(combined, title, 'Combined', language);
    pdf = await notesPDF(content, { title:`[FUSED] ${title}`, subject:'Combined' });
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, docsUsed:docs.map(d=>d.title) });
  } catch(e) { next(e); }
};
