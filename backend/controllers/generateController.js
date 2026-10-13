const { Document, Flashcard, User } = require('../models');
const ai = require('../services/aiService');
// FIXED: use correct function names from pdfGenerator
const { notesPDF, handwrittenPDF, questionPaperPDF, slidePDF } = require('../services/pdfGenerator');

// Get document text
async function getDocText(docId, userId, secIdx) {
  if (!docId) throw Object.assign(new Error('Document ID is required.'), { status: 400 });
  let doc = await Document.findOne({ _id: docId, user: userId });
  if (!doc) {
    // Fallback: check without user filter in case created in a different demo/test session
    doc = await Document.findById(docId);
  }
  if (!doc) throw Object.assign(new Error('Document not found.'), { status: 404 });
  let text = '';
  if (secIdx !== undefined && secIdx !== null && doc.sections?.length > 0) {
    const s = doc.sections[parseInt(secIdx)];
    if (s?.content?.length > 30) { text = s.content; console.log(`[Content] Section ${secIdx}: "${s.title}" (${text.length}c)`); }
  }
  if (!text) { text = doc.extractedText || ''; console.log(`[Content] Full doc: ${text.length}c`); }
  if (!text || text.trim().length < 30) throw new Error('No readable text. Please re-upload the PDF.');
  return { doc, text };
}

exports.notes = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const subj = doc.subject || doc.title;
    console.log(`[GEN] Notes "${doc.title}" ${text.length}c lang=${language}`);
    const content = await ai.generateNotes(text, doc.title, subj, language);
    const pdf = await notesPDF(content, { title: doc.title, subject: subj });
    doc.outputs.push({ type:'notes', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await doc.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { 'studyStats.notesGenerated': 1 } });
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName, fileSize:pdf.fileSize });
  } catch(e) { next(e); }
};

exports.summary = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateSummary(text, doc.title, doc.subject || doc.title, language);
    res.json({ success:true, content });
  } catch(e) { next(e); }
};

exports.flashcards = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex, count = 10 } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const cards = await ai.generateFlashcards(text, doc.subject || doc.title, parseInt(count) || 10, language);
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

exports.questions = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateQuestions(text, doc.title, doc.subject || doc.title, language);
    const pdf = await notesPDF(content, { title:`${doc.title} — Questions`, subject:doc.subject||doc.title });
    doc.outputs.push({ type:'questions', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await doc.save();
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

exports.paper = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const {
      sectionIndex,
      totalMarks = 20,
      timeHours = 1,
      institution = "Mahatma Education Society's",
      sets = 3,
      college,
      department,
      examType,
      className,
      date,
      time
    } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    console.log(`[GEN] Paper "${doc.title}" ${totalMarks}M ${sets} sets`);
    const paperSets = await ai.generateQuestionPaper(
      text,
      doc.subject || doc.title,
      parseInt(totalMarks),
      parseInt(timeHours),
      institution || "Mahatma Education Society's",
      language,
      parseInt(sets) || 3,
      { college, department, examType, class: className, date, time }
    );
    const pdfFiles = [];
    for (const set of paperSets) {
      const pdf = await questionPaperPDF(set.content, {
        title: `${doc.title} Set ${set.setNumber}`,
        subject: doc.subject || doc.title,
        totalMarks: parseInt(totalMarks),
        timeHours: parseInt(timeHours),
        institution: institution || "Mahatma Education Society's"
      });
      pdfFiles.push({ setNumber: set.setNumber, fileName: pdf.fileName, downloadUrl: `/uploads/generated/${pdf.fileName}`, fileSize: pdf.fileSize });
      doc.outputs.push({ type: 'paper', language, fileName: pdf.fileName, filePath: pdf.filePath, fileSize: pdf.fileSize });
    }
    await doc.save();
    res.json({
      success: true,
      sets: paperSets,
      pdfFiles,
      message: `${paperSets.length} question paper set${paperSets.length > 1 ? 's' : ''} generated!`
    });
  } catch(e) { next(e); }
};

exports.handwritten = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex, style = 'yellow', font = 'caveat' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const content = await ai.generateHandwrittenNotes(text, doc.title, doc.subject || doc.title, language);
    const pdf = await handwrittenPDF(content, { title:doc.title, subject:doc.subject||doc.title, style:style||'yellow', fontName:font });
    doc.outputs.push({ type:'handwritten', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await doc.save();
    res.json({ success:true, content, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName, fileSize:pdf.fileSize });
  } catch(e) { next(e); }
};

// Re-render handwritten PDF with a new font WITHOUT calling AI again.
// Accepts: { content, title, subject, font, style }
exports.handwrittenPdfOnly = async (req, res, next) => {
  try {
    const { content, title = 'Notes', subject = 'General', font = 'caveat', style = 'yellow' } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Content is required to re-render the PDF.' });
    }
    const pdf = await handwrittenPDF(content, { title, subject, style: style || 'yellow', fontName: font });
    res.json({ success: true, downloadUrl: `/uploads/generated/${pdf.fileName}`, fileName: pdf.fileName, fileSize: pdf.fileSize });
  } catch(e) { next(e); }
};

exports.podcast = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex, voiceStyle = 'male' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    console.log(`[GEN] Podcast "${doc.title}" ${text.length}c`);
    const script = await ai.generatePodcast(text, doc.title, doc.subject || doc.title, language);
    const langMap = { English:'en-IN', Hindi:'hi-IN', Marathi:'mr-IN', Bengali:'bn-IN', Tamil:'ta-IN' };
    const audio = await ai.generateAudio(script, { language:langMap[language]||'en-IN', voiceStyle:voiceStyle||'male' });
    doc.outputs.push({ type:'podcast', language, fileName:audio.fileName, filePath:audio.filePath, fileSize:audio.fileSize });
    await doc.save();
    res.json({ success:true, script, audioUrl:`/uploads/audio/${audio.fileName}`, fileName:audio.fileName, duration:audio.duration, provider:audio.provider, note:audio.note||null });
  } catch(e) { next(e); }
};

exports.ppt = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const pptData = await ai.generatePPT(text, doc.title, doc.subject || doc.title, language);
    const pdf = await slidePDF(pptData, { title:doc.title });
    doc.outputs.push({ type:'ppt', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await doc.save();
    res.json({ success:true, pptData, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

const { createVideoFromAudio } = require('../services/videoEngine');

exports.video = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const [script, pptData] = await Promise.all([
      ai.generateVideoScript(text, doc.title, doc.subject || doc.title, language),
      ai.generatePPT(text, doc.title, doc.subject || doc.title, language)
    ]);
    let slideFile = null;
    try { slideFile = await slidePDF(pptData, { title:doc.title }); } catch(e) { console.warn('[Video slides]', e.message); }
    const audio = await ai.generateAudio(script, { language:'en-IN', voiceStyle:'male' });
    
    // Generate actual MP4 video with subtitles
    const videoResult = await createVideoFromAudio(audio.filePath, script, audio.duration);
    
    doc.outputs.push({ type:'video', language, fileName:videoResult.fileName, filePath:videoResult.videoPath, fileSize:0 });
    await doc.save();
    res.json({ success:true, script, pptData, slidesUrl:slideFile?`/uploads/generated/${slideFile.fileName}`:null, audioUrl:`/uploads/audio/${audio.fileName}`, videoUrl: videoResult.videoUrl, audioProvider:audio.provider, audioDuration:audio.duration, audioNote:audio.note, message:'Video generation complete: script + slides + video' });
  } catch(e) { next(e); }
};

exports.mindmap = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const data = await ai.generateMindmap(text, doc.title);
    res.json({ success:true, mindmapData:data });
  } catch(e) { next(e); }
};

exports.vocabulary = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user.id, sectionIndex);
    const vocab = await ai.generateVocabulary(text, doc.subject || doc.title, language);
    res.json({ success:true, vocabulary:vocab });
  } catch(e) { next(e); }
};

const { generateDocx, generatePPTX } = require('../services/officeGenerator');

exports.exportDocx = async (req, res, next) => {
  try {
    const { content, title = 'Academic Notes', subject = 'General' } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required for Word export.' });
    }
    const result = await generateDocx(content, { title, subject });
    res.json({ success: true, downloadUrl: `/uploads/generated/${result.fileName}`, fileName: result.fileName, fileSize: result.fileSize });
  } catch(e) { next(e); }
};

exports.exportPptx = async (req, res, next) => {
  try {
    const { slides, title = 'Presentation', subject = 'Academic Lecture', theme = 'indigo' } = req.body;
    const slidesData = slides || req.body.pptData?.slides || [];
    if (!slidesData || slidesData.length === 0) {
      return res.status(400).json({ error: 'Slides data is required for PPTX export.' });
    }
    const result = await generatePPTX(slidesData, { title, subject, theme });
    res.json({ success: true, downloadUrl: `/uploads/generated/${result.fileName}`, fileName: result.fileName, fileSize: result.fileSize });
  } catch(e) { next(e); }
};

exports.exportPdf = async (req, res, next) => {
  try {
    const { content, title = 'Notes', subject = 'General', type = 'notes', theme = 'indigo', font = 'caveat', style = 'yellow', totalMarks = 60, timeHours = 2 } = req.body;
    let pdf;
    if (type === 'ppt' || type === 'slides') {
      const slidesData = Array.isArray(content) ? content : (content?.slides || req.body.slides || []);
      pdf = await slidePDF(slidesData, { title, theme });
    } else if (type === 'handwritten') {
      pdf = await handwrittenPDF(content, { title, subject, style, fontName: font });
    } else if (type === 'paper') {
      pdf = await questionPaperPDF(content, { title, subject, totalMarks, timeHours });
    } else {
      pdf = await notesPDF(content, { title, subject });
    }
    res.json({ success: true, downloadUrl: `/uploads/generated/${pdf.fileName}`, fileName: pdf.fileName, fileSize: pdf.fileSize });
  } catch(e) { next(e); }
};
