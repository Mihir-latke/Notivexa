const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { VideoJob, Document } = require('../models');
const localStore = require('../utils/localStore');
const videoStudioService = require('../services/videoStudioService');
const { resolveOutputLanguage } = require('../services/ocr/languageDetectionService');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper: resolve document text or custom text
async function resolveContent(req) {
  const { docId, sectionIndex, sourceType = 'book', customText } = req.body;

  if (sourceType === 'custom' && customText && customText.trim()) {
    return {
      text: customText.trim(),
      title: req.body.title || 'Custom Educational Topic',
      subject: req.body.subject || 'General Studies',
      primaryLanguage: 'eng',
      doc: null
    };
  }

  if (!docId) {
    if (customText && customText.trim()) {
      return {
        text: customText.trim(),
        title: req.body.title || 'Educational Topic',
        subject: req.body.subject || 'General Studies',
        primaryLanguage: 'eng',
        doc: null
      };
    }
    throw Object.assign(new Error('Please select an uploaded document or provide custom educational text.'), { status: 400 });
  }

  let doc = null;
  const userId = req.user?.id;

  if (isDbConnected()) {
    try {
      if (mongoose.Types.ObjectId.isValid(docId)) {
        doc = await Document.findOne({ _id: docId, user: userId });
      }
    } catch {}
  }

  if (!doc) {
    doc = localStore.getDocById(docId, userId);
  }

  if (!doc) {
    throw Object.assign(new Error('Document not found or access denied.'), { status: 404 });
  }

  let contentText = '';

  if (sectionIndex !== undefined && sectionIndex !== null && sectionIndex !== '' && Array.isArray(doc.sections) && doc.sections[sectionIndex]) {
    contentText = doc.sections[sectionIndex].content || '';
  } else if (sourceType === 'notes') {
    // Check if doc has generated notes in outputs
    const notesOutput = (doc.outputs || []).find(o => o.type === 'notes');
    if (notesOutput && notesOutput.filePath && fs.existsSync(notesOutput.filePath)) {
      contentText = doc.extractedText || '';
    } else {
      contentText = doc.extractedText || '';
    }
  } else if (sourceType === 'summary') {
    const summaryOutput = (doc.outputs || []).find(o => o.type === 'summary');
    if (summaryOutput && summaryOutput.filePath && fs.existsSync(summaryOutput.filePath)) {
      contentText = doc.extractedText || '';
    } else {
      contentText = doc.extractedText || '';
    }
  } else {
    contentText = doc.extractedText || (Array.isArray(doc.sections) ? doc.sections.map(s => s.content).join('\n\n') : '');
  }

  if (!contentText.trim()) {
    throw Object.assign(new Error('The selected document has no readable text content. Please run OCR or upload a valid document.'), { status: 400 });
  }

  return {
    text: contentText,
    title: doc.title,
    subject: doc.subject || 'General Studies',
    primaryLanguage: doc.primaryLanguage || 'eng',
    doc
  };
}

// 1. Get Studio Capabilities
exports.getCapabilities = async (req, res, next) => {
  try {
    const capabilities = await videoStudioService.checkVeoCapabilities();
    res.json({
      success: true,
      capabilities,
      styles: videoStudioService.SUPPORTED_STYLES,
      aspectRatios: videoStudioService.SUPPORTED_ASPECT_RATIOS,
      durations: videoStudioService.SUPPORTED_DURATIONS
    });
  } catch (err) {
    next(err);
  }
};

// 2. Draft / Preview Storyboard
exports.generateStoryboard = async (req, res, next) => {
  try {
    const { text, title, subject, primaryLanguage, doc } = await resolveContent(req);
    const {
      style = 'realistic_cinematic',
      audienceLevel = 'intermediate',
      language = 'English',
      sceneCount = 3
    } = req.body;

    const langInfo = resolveOutputLanguage(language, primaryLanguage);

    const storyboard = await videoStudioService.generateEducationalStoryboard({
      content: text,
      title: req.body.title || title,
      subject: req.body.subject || subject,
      language: langInfo.name,
      style,
      audienceLevel,
      sceneCount: Number(sceneCount) || 3,
      docPrimaryLang: primaryLanguage
    });

    res.json({
      success: true,
      title: storyboard.title,
      subject: storyboard.subject,
      language: langInfo.name,
      visualStyle: style,
      audienceLevel,
      storyboard
    });
  } catch (err) {
    next(err);
  }
};

// 3. Create & Start Video Generation Job
exports.createVideoJob = async (req, res, next) => {
  try {
    const { text, title, subject, primaryLanguage, doc } = await resolveContent(req);
    const {
      style = 'realistic_cinematic',
      audienceLevel = 'intermediate',
      language = 'English',
      aspectRatio = '16:9',
      sceneCount = 3,
      storyboard: customStoryboard,
      engine = 'google_veo'
    } = req.body;

    const langInfo = resolveOutputLanguage(language, primaryLanguage);
    let finalStoryboard = customStoryboard;

    if (!finalStoryboard || !Array.isArray(finalStoryboard.scenes) || finalStoryboard.scenes.length === 0) {
      finalStoryboard = await videoStudioService.generateEducationalStoryboard({
        content: text,
        title: req.body.title || title,
        subject: req.body.subject || subject,
        language: langInfo.name,
        style,
        audienceLevel,
        sceneCount: Number(sceneCount) || 3,
        docPrimaryLang: primaryLanguage
      });
    }

    const jobData = {
      user: req.user?.id,
      docId: doc ? (doc._id || doc.id) : null,
      docTitle: doc ? doc.title : (req.body.title || 'Custom Video'),
      sourceType: req.body.sourceType || (doc ? 'book' : 'custom'),
      chapter: req.body.chapter || '',
      sectionIndex: req.body.sectionIndex !== undefined ? req.body.sectionIndex : null,
      title: finalStoryboard.title || req.body.title || title,
      subject: finalStoryboard.subject || req.body.subject || subject,
      language: langInfo.name,
      style,
      audienceLevel,
      aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
      durationSeconds: finalStoryboard.totalDuration || (finalStoryboard.scenes.length * 6),
      storyboard: finalStoryboard.scenes,
      status: 'pending',
      progress: 'Job created. Preparing generation pipeline...',
      engine: engine || 'google_veo',
      modelUsed: process.env.VEO_MODEL || 'veo-2.0-generate-001'
    };

    let createdJob = null;
    if (isDbConnected()) {
      createdJob = await VideoJob.create(jobData);
    } else {
      createdJob = localStore.createVideoJob(jobData);
    }

    const jobId = (createdJob._id || createdJob.id).toString();

    // Spawn asynchronous background worker (non-blocking)
    setImmediate(() => {
      videoStudioService.processVideoStudioJob(jobId, req.user?.id)
        .catch(err => console.error('[VideoStudio Controller Background Err]', err));
    });

    res.json({
      success: true,
      message: 'Video generation job started.',
      jobId,
      status: createdJob.status,
      job: createdJob
    });
  } catch (err) {
    next(err);
  }
};

// 4. Get Job Status & Result
exports.getJobStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id;

    let job = null;
    if (isDbConnected()) {
      try { job = await VideoJob.findOne({ _id: jobId, user: userId }); } catch {}
    }
    if (!job) {
      job = localStore.getVideoJobById(jobId, userId);
    }

    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

    const formattedJob = typeof job.toObject === 'function' ? job.toObject() : { ...job };
    if (formattedJob.finalVideoUrl) {
      formattedJob.finalVideoUrl = `${formattedJob.finalVideoUrl}${tokenParam}`;
    }
    if (formattedJob.audioUrl) {
      formattedJob.audioUrl = `${formattedJob.audioUrl}${tokenParam}`;
    }

    res.json({
      success: true,
      job: formattedJob
    });
  } catch (err) {
    next(err);
  }
};

// 5. List User's Video Jobs
exports.listUserJobs = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    let jobs = [];

    if (isDbConnected()) {
      try {
        jobs = await VideoJob.find({ user: userId }).sort({ createdAt: -1 }).lean();
      } catch {}
    }

    if (!jobs || jobs.length === 0) {
      jobs = localStore.getVideoJobsByUser(userId) || [];
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

    const withTokens = jobs.map(j => {
      const obj = { ...j };
      if (obj.finalVideoUrl) obj.finalVideoUrl = `${obj.finalVideoUrl}${tokenParam}`;
      if (obj.audioUrl) obj.audioUrl = `${obj.audioUrl}${tokenParam}`;
      return obj;
    });

    res.json({
      success: true,
      jobs: withTokens
    });
  } catch (err) {
    next(err);
  }
};

// 6. Delete Video Job
exports.deleteJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id;

    let job = null;
    if (isDbConnected()) {
      job = await VideoJob.findOne({ _id: jobId, user: userId });
      if (job) await VideoJob.deleteOne({ _id: jobId });
    }
    if (!job) {
      job = localStore.getVideoJobById(jobId, userId);
      if (job) localStore.deleteVideoJob(jobId, userId);
    }

    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }

    // Clean up video files from disk
    if (job.finalVideoPath && fs.existsSync(job.finalVideoPath)) {
      try { fs.unlinkSync(job.finalVideoPath); } catch {}
    }
    if (Array.isArray(job.clips)) {
      job.clips.forEach(c => {
        if (c.filePath && fs.existsSync(c.filePath)) {
          try { fs.unlinkSync(c.filePath); } catch {}
        }
      });
    }

    res.json({ success: true, message: 'Video job deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

// 7. Regenerate Video Job
exports.regenerateJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.id;

    let oldJob = null;
    if (isDbConnected()) {
      oldJob = await VideoJob.findOne({ _id: jobId, user: userId });
    }
    if (!oldJob) {
      oldJob = localStore.getVideoJobById(jobId, userId);
    }

    if (!oldJob) {
      return res.status(404).json({ error: 'Original video job not found.' });
    }

    const {
      style = oldJob.style,
      audienceLevel = oldJob.audienceLevel,
      language = oldJob.language,
      aspectRatio = oldJob.aspectRatio,
      storyboard = oldJob.storyboard
    } = req.body;

    const newJobData = {
      user: userId,
      docId: oldJob.docId,
      docTitle: oldJob.docTitle,
      sourceType: oldJob.sourceType,
      chapter: oldJob.chapter,
      sectionIndex: oldJob.sectionIndex,
      title: oldJob.title,
      subject: oldJob.subject,
      language,
      style,
      audienceLevel,
      aspectRatio,
      durationSeconds: storyboard.length * 6,
      storyboard,
      status: 'pending',
      progress: 'Regenerating video with updated settings...',
      engine: oldJob.engine || 'google_veo',
      modelUsed: oldJob.modelUsed || process.env.VEO_MODEL || 'veo-2.0-generate-001'
    };

    let newJob = null;
    if (isDbConnected()) {
      newJob = await VideoJob.create(newJobData);
    } else {
      newJob = localStore.createVideoJob(newJobData);
    }

    const newJobId = (newJob._id || newJob.id).toString();

    setImmediate(() => {
      videoStudioService.processVideoStudioJob(newJobId, userId)
        .catch(err => console.error('[VideoStudio Regenerate Background Err]', err));
    });

    res.json({
      success: true,
      message: 'Video regeneration started.',
      jobId: newJobId,
      job: newJob
    });
  } catch (err) {
    next(err);
  }
};

