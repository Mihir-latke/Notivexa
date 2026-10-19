const fs = require('fs');
const mongoose = require('mongoose');
const { Document, Flashcard, User } = require('../models');
const ai = require('../services/aiService');
const { notesPDF, handwrittenPDF, questionPaperPDF, slidePDF } = require('../services/pdfGenerator');
const { SAMPLE_DEMO_DOCS } = require('./documentController');
const localStore = require('../utils/localStore');
const { getExtractedImages, extractImagesFromPDF } = require('../services/pdfImageExtractor');

const isDbConnected = () => mongoose.connection.readyState === 1;

function resolveLocalPath(p) {
  if (!p || typeof p !== 'string') return null;
  if (fs.existsSync(p)) return p;
  const norm = p.replace(/\\/g, '/');
  const idx = norm.indexOf('uploads/');
  if (idx !== -1) {
    const rel = norm.slice(idx);
    const candidates = [
      path.join(__dirname, '..', rel),
      path.join(process.cwd(), rel),
      path.join(process.cwd(), 'backend', rel),
      path.join(__dirname, '../../', rel)
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

/**
 * Retrieve or extract authentic diagrams/images from source PDF.
 * Seamless across Windows and Linux, restoring from cloud DB (Atlas) if needed.
 */
async function resolveDocImages(doc) {
  if (!doc) return [];
  const docId = (doc._id || doc.id || '').toString();
  const outDir = path.join(__dirname, '../uploads/images/extracted', docId);

  // 1. If doc has base64 diagrams in DB/cloud store: restore them to local disk if needed!
  if (Array.isArray(doc.diagrams) && doc.diagrams.length > 0) {
    try {
      fs.mkdirSync(outDir, { recursive: true });
      const paths = [];
      for (const diag of doc.diagrams) {
        if (!diag.fileName || !diag.base64) continue;
        const targetPath = path.join(outDir, diag.fileName);
        if (!fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath, Buffer.from(diag.base64, 'base64'));
          console.log(`[ImgExtract] Restored diagram ${diag.fileName} from database to disk`);
        }
        paths.push(targetPath);
      }
      if (paths.length > 0) return paths;
    } catch (e) {
      console.warn('[ImgExtract] Restore from diagrams failed:', e.message);
    }
  }

  // 2. Check disk for previously extracted diagrams for this docId
  if (docId) {
    const onDisk = getExtractedImages(docId);
    if (onDisk.length > 0) return onDisk.map(o => o.filePath);
  }

  // 3. Check if doc record already contains imagePaths
  if (Array.isArray(doc.imagePaths) && doc.imagePaths.length > 0) {
    const valid = doc.imagePaths.map(resolveLocalPath).filter(Boolean);
    if (valid.length > 0) return valid;
  }

  // 4. If doc has filePath to original uploaded PDF, extract diagrams on-the-fly
  const realPdfPath = resolveLocalPath(doc.filePath);
  if (realPdfPath && fs.existsSync(realPdfPath) && doc.fileType !== 'image') {
    try {
      console.log(`[ImgExtract] Extracting diagrams on-the-fly for "${doc.title}" (${docId})...`);
      const extracted = await extractImagesFromPDF(realPdfPath, docId || 'doc_' + Date.now());
      if (extracted.length > 0) {
        const paths = extracted.map(e => e.filePath);
        const diagrams = extracted.slice(0, 6).map(img => ({
          page: img.page,
          fileName: img.fileName,
          base64: img.base64 || (fs.existsSync(img.filePath) ? fs.readFileSync(img.filePath).toString('base64') : null)
        })).filter(d => d.base64);

        const relPaths = extracted.map(e => 'uploads/images/extracted/' + docId + '/' + e.fileName);
        if (isDbConnected() && doc._id) {
          try { await Document.findByIdAndUpdate(doc._id, { imagePaths: relPaths, diagrams }); } catch {}
        } else if (docId) {
          try { localStore.updateDoc(docId, { imagePaths: relPaths, diagrams }); } catch {}
        }
        return paths;
      }
    } catch (err) {
      console.warn('[ImgExtract] On-the-fly extraction warning:', err.message);
    }
  }

  return [];
}

async function safeDocSave(doc) {
  if (doc && typeof doc.save === 'function' && isDbConnected()) {
    try { await doc.save(); } catch (err) { console.warn('Could not save document output to DB:', err.message); }
  } else if (doc && (doc._id || doc.id)) {
    try { localStore.updateDoc(doc._id || doc.id, { outputs: doc.outputs }); } catch (err) {}
  }
}

async function safeUserStatsUpdate(userId, updateObj) {
  if (isDbConnected() && userId) {
    try { await User.findByIdAndUpdate(userId, updateObj); } catch (err) {}
  } else if (userId) {
    try {
      const u = localStore.findUserById(userId);
      if (u) {
        u.studyStats = u.studyStats || {};
        if (updateObj['$inc']) {
          for (const [k, v] of Object.entries(updateObj['$inc'])) {
            const prop = k.replace('studyStats.', '');
            u.studyStats[prop] = (u.studyStats[prop] || 0) + v;
          }
        }
        localStore.updateUser(userId, { studyStats: u.studyStats });
      }
    } catch (err) {}
  }
}

// Get document text with fallback to sample demo docs
async function getDocText(docId, userId, secIdx) {
  if (!docId) throw Object.assign(new Error('Document ID is required.'), { status: 400 });
  
  let doc = null;
  if (isDbConnected()) {
    try {
      doc = await Document.findOne({ _id: docId, user: userId });
      if (!doc) doc = await Document.findById(docId);
    } catch {}
  }
  
  if (!doc) {
    doc = localStore.getDocById(docId);
  }
  
  if (!doc && SAMPLE_DEMO_DOCS?.length > 0) {
    doc = SAMPLE_DEMO_DOCS.find(d => (d._id && d._id.toString() === docId.toString()) || d.id === docId);
  }
  
  // If still not found and in demo/preview mode, fallback to the first sample doc
  if (!doc && SAMPLE_DEMO_DOCS?.length > 0) {
    doc = SAMPLE_DEMO_DOCS[0];
  }
  
  if (!doc) throw Object.assign(new Error('Document not found.'), { status: 404 });
  
  let text = '';
  if (secIdx !== undefined && secIdx !== null && doc.sections?.length > 0) {
    const s = doc.sections[parseInt(secIdx)];
    if (s?.content?.length > 30) {
      text = s.content;
      console.log(`[Content] Section ${secIdx}: "${s.title}" (${text.length}c)`);
    }
  }
  if (!text) {
    text = doc.extractedText || '';
    console.log(`[Content] Full doc: ${text.length}c`);
  }
  if (!text || text.trim().length < 30) throw new Error('No readable text. Please re-upload the PDF.');
  return { doc, text };
}

function injectDiagramsIntoMarkdown(content, docId, imagePaths) {
  if (!content || !Array.isArray(imagePaths) || imagePaths.length === 0 || !docId) {
    return content;
  }
  if (/!\[.*?\]\(/i.test(content)) {
    return content;
  }

  const diags = imagePaths.slice(0, 6).map((imgP, i) => {
    const fn = path.basename(imgP);
    const url = `/uploads/images/extracted/${docId}/${fn}`;
    return `\n\n![Figure ${i + 1}: Diagram from Document](${url})\n*Figure ${i + 1}: Diagram extracted from source document*\n\n`;
  });

  let remaining = [...diags];
  let updatedContent = content;

  // 1. If content contains DIAGRAM: placeholders, replace them with real images
  if (/^DIAGRAM:.*$/gmi.test(updatedContent)) {
    updatedContent = updatedContent.replace(/^DIAGRAM:.*$/gmi, () => {
      if (remaining.length > 0) return remaining.shift().trim();
      return '';
    });
  }

  // 2. If we still have remaining diagrams and content has '## ' headings, distribute them
  if (remaining.length > 0 && /##\s+/i.test(updatedContent)) {
    const parts = updatedContent.split(/(^##\s+[^\n]+)/m);
    let assembled = '';
    for (let i = 0; i < parts.length; i++) {
      assembled += parts[i];
      if (parts[i].startsWith('## ') && i + 1 < parts.length && remaining.length > 0) {
        i++;
        assembled += parts[i];
        assembled += remaining.shift();
      }
    }
    updatedContent = assembled;
  }

  // 3. Any still remaining diagrams, append under Figures & Diagrams
  if (remaining.length > 0) {
    updatedContent += '\n\n## Figures & Diagrams from Source Document\n\n';
    while (remaining.length > 0) {
      updatedContent += remaining.shift();
    }
  }

  return updatedContent;
}

exports.notes = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const subj = doc.subject || doc.title;
    console.log(`[GEN] Notes "${doc.title}" ${text.length}c lang=${language}`);
    const content = await ai.generateNotes(text, doc.title, subj, language);
    const imagePaths = await resolveDocImages(doc);
    const docId = (doc._id || doc.id || '').toString();
    const finalContent = injectDiagramsIntoMarkdown(content, docId, imagePaths);
    const pdf = await notesPDF(finalContent, { title: doc.title, subject: subj, imagePaths });
    if (doc.outputs) doc.outputs.push({ type:'notes', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await safeDocSave(doc);
    await safeUserStatsUpdate(req.user?.id, { $inc: { 'studyStats.notesGenerated': 1 } });
    res.json({ success:true, content: finalContent, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName, fileSize:pdf.fileSize, diagrams: doc.diagrams || [] });
  } catch(e) { next(e); }
};

exports.summary = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const content = await ai.generateSummary(text, doc.title, doc.subject || doc.title, language);
    res.json({ success:true, content });
  } catch(e) { next(e); }
};

exports.flashcards = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex, count = 10 } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const cards = await ai.generateFlashcards(text, doc.subject || doc.title, parseInt(count) || 10, language);
    if (!Array.isArray(cards) || cards.length === 0) throw new Error('No flashcards generated. Try again.');
    
    let set = null;
    if (isDbConnected()) {
      try {
        set = await Flashcard.create({
          user: req.user?.id, documentId: doc._id, documentTitle: doc.title,
          title: `${doc.title} — Flashcards`, subject: doc.subject || doc.title,
          language, cards, totalCards: cards.length
        });
      } catch (err) { console.warn('Flashcard.create:', err.message); }
    }
    if (!set) {
      set = {
        _id: 'fc_' + Date.now(),
        user: req.user?.id,
        documentId: doc._id || doc.id,
        documentTitle: doc.title,
        title: `${doc.title} — Flashcards`,
        subject: doc.subject || doc.title,
        language,
        cards,
        totalCards: cards.length,
        masteredCards: 0,
        createdAt: new Date().toISOString()
      };
      try {
        const existingSets = localStore.getFlashcards();
        existingSets.unshift(set);
        localStore.saveFlashcards(existingSets);
      } catch (err) {}
    }
    await safeUserStatsUpdate(req.user?.id, { $inc: { 'studyStats.flashcardsCreated': cards.length } });
    res.json({ success: true, flashcardSet: set });
  } catch(e) { next(e); }
};

exports.questions = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const content = await ai.generateQuestions(text, doc.title, doc.subject || doc.title, language);
    const pdf = await notesPDF(content, { title:`${doc.title} — Questions`, subject:doc.subject||doc.title });
    if (doc.outputs) doc.outputs.push({ type:'questions', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await safeDocSave(doc);
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
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
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
      if (doc.outputs) doc.outputs.push({ type: 'paper', language, fileName: pdf.fileName, filePath: pdf.filePath, fileSize: pdf.fileSize });
    }
    await safeDocSave(doc);
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
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const content = await ai.generateHandwrittenNotes(text, doc.title, doc.subject || doc.title, language);
    const imagePaths = await resolveDocImages(doc);
    const docId = (doc._id || doc.id || '').toString();
    const finalContent = injectDiagramsIntoMarkdown(content, docId, imagePaths);
    const pdf = await handwrittenPDF(finalContent, { title:doc.title, subject:doc.subject||doc.title, style:style||'yellow', fontName:font, imagePaths });
    if (doc.outputs) doc.outputs.push({ type:'handwritten', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await safeDocSave(doc);
    res.json({ success:true, content: finalContent, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName, fileSize:pdf.fileSize, diagrams: doc.diagrams || [] });
  } catch(e) { next(e); }
};

// Re-render handwritten PDF with a new font WITHOUT calling AI again.
// Accepts: { content, title, subject, font, style, documentId, docId }
exports.handwrittenPdfOnly = async (req, res, next) => {
  try {
    const { content, title = 'Notes', subject = 'General', font = 'caveat', style = 'yellow', documentId, docId } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Content is required to re-render the PDF.' });
    }
    let imagePaths = [];
    const dId = documentId || docId;
    let doc = null;
    if (dId) {
      try {
        const result = await getDocText(dId, req.user?.id);
        doc = result.doc;
        imagePaths = await resolveDocImages(doc);
      } catch {}
    }
    const finalContent = (doc && dId) ? injectDiagramsIntoMarkdown(content, (doc._id || doc.id || dId).toString(), imagePaths) : content;
    const pdf = await handwrittenPDF(finalContent, { title, subject, style: style || 'yellow', fontName: font, imagePaths });
    res.json({ success: true, downloadUrl: `/uploads/generated/${pdf.fileName}`, fileName: pdf.fileName, fileSize: pdf.fileSize });
  } catch(e) { next(e); }
};

exports.podcast = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex, voiceStyle = 'male' } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    console.log(`[GEN] Podcast "${doc.title}" ${text.length}c`);
    const script = await ai.generatePodcast(text, doc.title, doc.subject || doc.title, language);
    const langMap = { English:'en-IN', Hindi:'hi-IN', Marathi:'mr-IN', Bengali:'bn-IN', Tamil:'ta-IN' };
    const audio = await ai.generateAudio(script, { language:langMap[language]||'en-IN', voiceStyle:voiceStyle||'male' });
    if (doc.outputs) doc.outputs.push({ type:'podcast', language, fileName:audio.fileName, filePath:audio.filePath, fileSize:audio.fileSize });
    await safeDocSave(doc);
    res.json({ success:true, script, audioUrl:`/uploads/audio/${audio.fileName}`, fileName:audio.fileName, duration:audio.duration, provider:audio.provider, note:audio.note||null });
  } catch(e) { next(e); }
};

exports.ppt = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const pptData = await ai.generatePPT(text, doc.title, doc.subject || doc.title, language);
    const pdf = await slidePDF(pptData, { title:doc.title });
    if (doc.outputs) doc.outputs.push({ type:'ppt', language, fileName:pdf.fileName, filePath:pdf.filePath, fileSize:pdf.fileSize });
    await safeDocSave(doc);
    res.json({ success:true, pptData, downloadUrl:`/uploads/generated/${pdf.fileName}`, fileName:pdf.fileName });
  } catch(e) { next(e); }
};

const { createVideoFromAudio } = require('../services/videoEngine');

exports.video = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const [script, pptData] = await Promise.all([
      ai.generateVideoScript(text, doc.title, doc.subject || doc.title, language),
      ai.generatePPT(text, doc.title, doc.subject || doc.title, language)
    ]);
    let slideFile = null;
    try { slideFile = await slidePDF(pptData, { title:doc.title }); } catch(e) { console.warn('[Video slides]', e.message); }
    const audio = await ai.generateAudio(script, { language:'en-IN', voiceStyle:'male' });
    
    // Generate actual MP4 video with subtitles
    const videoResult = await createVideoFromAudio(audio.filePath, script, audio.duration);
    
    if (doc.outputs) doc.outputs.push({ type:'video', language, fileName:videoResult.fileName, filePath:videoResult.videoPath, fileSize:0 });
    await safeDocSave(doc);
    res.json({ success:true, script, pptData, slidesUrl:slideFile?`/uploads/generated/${slideFile.fileName}`:null, audioUrl:`/uploads/audio/${audio.fileName}`, videoUrl: videoResult.videoUrl, audioProvider:audio.provider, audioDuration:audio.duration, audioNote:audio.note, message:'Video generation complete: script + slides + video' });
  } catch(e) { next(e); }
};

exports.mindmap = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
    const data = await ai.generateMindmap(text, doc.title);
    res.json({ success:true, mindmapData:data });
  } catch(e) { next(e); }
};

exports.vocabulary = async (req, res, next) => {
  try {
    const documentId = req.body.documentId || req.body.docId || req.body.id;
    const language = req.body.language || req.body.lang || 'English';
    const { sectionIndex } = req.body;
    const { doc, text } = await getDocText(documentId, req.user?.id, sectionIndex);
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
    const { content, title = 'Notes', subject = 'General', type = 'notes', theme = 'indigo', font = 'caveat', style = 'yellow', totalMarks = 60, timeHours = 2, documentId, docId } = req.body;
    let imagePaths = [];
    const dId = documentId || docId;
    let doc = null;
    if (dId) {
      try {
        const result = await getDocText(dId, req.user?.id);
        doc = result.doc;
        imagePaths = await resolveDocImages(doc);
      } catch {}
    }
    const finalContent = (doc && dId && typeof content === 'string') ? injectDiagramsIntoMarkdown(content, (doc._id || doc.id || dId).toString(), imagePaths) : content;
    let pdf;
    if (type === 'ppt' || type === 'slides') {
      const slidesData = Array.isArray(content) ? content : (content?.slides || req.body.slides || []);
      pdf = await slidePDF(slidesData, { title, theme });
    } else if (type === 'handwritten') {
      pdf = await handwrittenPDF(finalContent, { title, subject, style, fontName: font, imagePaths });
    } else if (type === 'paper') {
      pdf = await questionPaperPDF(content, { title, subject, totalMarks, timeHours });
    } else {
      pdf = await notesPDF(finalContent, { title, subject, imagePaths });
    }
    res.json({ success: true, downloadUrl: `/uploads/generated/${pdf.fileName}`, fileName: pdf.fileName, fileSize: pdf.fileSize });
  } catch(e) { next(e); }
};
