/**
 * videoGenerationService.js
 * End-to-end orchestrator for the AI Animated Video Lecture Generation System.
 * Coordinates Scripting, Narration, Lip-Sync, Animation, Subtitles, Composition, and Caching.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const { generateEducationalScript } = require('./videoScriptService');
const { generateScriptNarration } = require('./narrationService');
const { generateLipSyncKeyframes } = require('./lipSyncService');
const { renderScene } = require('./animationService');
const { generateAssSubtitles } = require('./subtitleService');
const { composeVideoLecture } = require('./videoCompositionService');
const { resolveOutputLanguage } = require('./ocr/languageDetectionService');

const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Compute SHA-256 content hash to prevent duplicate re-renders and enable smart caching.
 */
function computeContentHash({
  userId = '',
  docId = '',
  sectionIndex = '',
  title = '',
  language = 'English',
  voice = 'auto',
  style = 'realistic_cinematic',
  mode = 'explainer'
}) {
  const normStr = `${userId}|${docId}|${sectionIndex}|${title}|${language}|${voice}|${style}|${mode}`.toLowerCase();
  return crypto.createHash('sha256').update(normStr).digest('hex');
}

/**
 * Orchestrate complete end-to-end generation of an AI Animated Video Lecture.
 */
async function generateAnimatedVideoLecture({
  content,
  title = 'Academic Topic',
  subject = 'General Studies',
  language = 'English',
  docPrimaryLang = 'eng',
  difficulty = 'intermediate',
  sceneCount = 3,
  mode = 'explainer', // 'explainer' (default) | 'presenter'
  voice = 'auto',
  voiceGender = 'male',
  speedMultiplier = 1.0,
  userId = null,
  docId = null,
  sectionIndex = null,
  jobId = null,
  onProgress = null
}) {
  const normLangInfo = resolveOutputLanguage(language, docPrimaryLang);
  const normLang = normLangInfo.name;
  const langCode = normLangInfo.code;

  const contentHash = computeContentHash({
    userId,
    docId,
    sectionIndex,
    title,
    language: normLang,
    voice,
    mode
  });

  const report = async (percent, message) => {
    console.log(`[VideoGeneration] [${percent}%] ${message}`);
    if (typeof onProgress === 'function') {
      try { await onProgress(percent, message); } catch {}
    }
  };

  // Step 1: Check cache for identical content hash
  await report(5, 'Checking cached video lectures...');
  if (isDbConnected()) {
    try {
      const { VideoJob } = require('../models');
      const cached = await VideoJob.findOne({ contentHash, status: 'completed' });
      if (cached && cached.finalVideoPath && fs.existsSync(cached.finalVideoPath)) {
        await report(100, 'Reused verified lecture from cache');
        return {
          cached: true,
          contentHash,
          videoUrl: cached.finalVideoUrl,
          videoPath: cached.finalVideoPath,
          audioUrl: cached.audioUrl,
          fileName: path.basename(cached.finalVideoPath),
          duration: cached.durationSeconds,
          fileSize: cached.fileSize,
          script: cached.storyboard ? JSON.stringify(cached.storyboard) : '',
          message: 'Video lecture retrieved from verified cache!'
        };
      }
    } catch {}
  } else {
    const localStore = require('../utils/localStore');
    if (localStore.findVideoJobByHash) {
      const cached = localStore.findVideoJobByHash(contentHash, userId);
      if (cached && cached.finalVideoPath && fs.existsSync(cached.finalVideoPath)) {
        await report(100, 'Reused verified lecture from local cache');
        return {
          cached: true,
          contentHash,
          videoUrl: cached.finalVideoUrl,
          videoPath: cached.finalVideoPath,
          audioUrl: cached.audioUrl,
          fileName: path.basename(cached.finalVideoPath),
          duration: cached.durationSeconds,
          fileSize: cached.fileSize,
          script: '',
          message: 'Video lecture retrieved from verified local cache!'
        };
      }
    }
  }

  // Step 2: Generate Structured Educational Script
  await report(15, `Generating structured educational script in ${normLang}...`);
  const scriptData = await generateEducationalScript({
    content,
    title,
    subject,
    language: normLang,
    difficulty,
    sceneCount,
    docPrimaryLang
  });

  // Step 3: Synthesize Scene-by-Scene Spoken Narration Audio
  await report(35, `Synthesizing neural voiceover narration in ${normLang}...`);
  const narrationResult = await generateScriptNarration({
    scenes: scriptData.scenes,
    language: normLang,
    languageCode: langCode,
    gender: voiceGender,
    speedMultiplier: Number(speedMultiplier) || 1.0
  });

  // Step 4: Audio-Driven Lip-Sync Analysis (if Presenter Mode)
  let lipSyncTimeline = null;
  if (mode === 'presenter') {
    await report(55, 'Analyzing speech phonemes & generating lip-sync keyframes...');
    try {
      lipSyncTimeline = await generateLipSyncKeyframes(narrationResult.masterAudioPath);
    } catch (lipErr) {
      console.warn('[VideoGeneration] Lip-sync analysis warning:', lipErr.message);
    }
  }

  // Step 5: Render Individual Animated Scene Clips at 25 FPS
  await report(65, `Rendering animated educational scenes (${mode} mode)...`);
  const sceneClips = [];
  const tempDir = path.join(__dirname, '../uploads/video');

  for (let i = 0; i < scriptData.scenes.length; i++) {
    const sc = scriptData.scenes[i];
    const scAudio = narrationResult.scenesWithTiming[i] || {};
    const sceneClipPath = path.join(tempDir, `clip_${i + 1}_${uuidv4().slice(0, 8)}.mp4`);

    await report(65 + Math.round((i / scriptData.scenes.length) * 15), `Rendering Scene ${i + 1}/${scriptData.scenes.length}...`);

    const clip = await renderScene({
      mode,
      scene: sc,
      sceneIndex: i + 1,
      totalScenes: scriptData.scenes.length,
      duration: sc.duration || 6,
      audioPath: scAudio.filePath || narrationResult.masterAudioPath,
      title: scriptData.title,
      subject: scriptData.subject,
      language: normLang,
      lipSyncTimeline,
      outputPath: sceneClipPath
    });

    sceneClips.push(clip);
  }

  // Step 6: Generate Synchronized ASS Subtitles
  await report(85, 'Mastering synchronized ASS subtitle track...');
  const assResult = generateAssSubtitles({
    scenes: scriptData.scenes,
    title: scriptData.title,
    subject: scriptData.subject,
    language: normLang,
    totalDuration: narrationResult.totalDuration,
    mode
  });

  // Step 7: Final MP4 Video Composition & Quality Verification
  await report(92, 'Compositing final MP4 video and verifying quality...');
  const masterVideo = await composeVideoLecture({
    sceneClips,
    masterAudioPath: narrationResult.masterAudioPath,
    assSubtitleResult: assResult,
    targetDuration: narrationResult.totalDuration
  });

  // Cleanup scene audio clips
  narrationResult.scenesWithTiming.forEach(a => {
    if (a.filePath && fs.existsSync(a.filePath)) {
      try { fs.unlinkSync(a.filePath); } catch {}
    }
  });

  await report(100, 'AI Animated Video Lecture generation complete!');

  // Prepare lecture markdown script for UI display
  const markdownScript = `# ${scriptData.title}\n\n` +
    scriptData.scenes.map((s, idx) => `### Scene ${idx + 1}: ${s.title}\n**Narration:** ${s.narration}\n\n${(s.boardPoints || []).map(p => `• ${p}`).join('\n')}`).join('\n\n') +
    (scriptData.quiz && scriptData.quiz.length > 0 ? `\n\n### 📝 Quick Review:\n${scriptData.quiz.map((q, i) => `**Q${i + 1}:** ${q.question}\n*Answer:* ${q.answer}`).join('\n\n')}` : '');

  return {
    cached: false,
    contentHash,
    mode,
    title: scriptData.title,
    subject: scriptData.subject,
    language: normLang,
    fileName: masterVideo.fileName,
    videoPath: masterVideo.filePath,
    videoUrl: masterVideo.videoUrl,
    audioUrl: narrationResult.masterAudioUrl,
    subtitlesUrl: assResult.subtitlesUrl,
    duration: masterVideo.duration,
    fileSize: masterVideo.fileSize,
    script: markdownScript,
    structuredScript: scriptData,
    qualityChecks: masterVideo.qualityChecks,
    message: `Animated ${mode === 'presenter' ? 'Presenter' : 'Explainer'} Video Lecture generated!`
  };
}

module.exports = {
  generateAnimatedVideoLecture,
  computeContentHash
};

