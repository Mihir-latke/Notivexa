/**
 * test_animated_video_pipeline.js
 * Comprehensive automated test suite for Notivexa's AI Animated Video Lecture System.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { generateEducationalScript } = require('../services/videoScriptService');
const { generateScriptNarration, resolveVoice } = require('../services/narrationService');
const { generateLipSyncKeyframes } = require('../services/lipSyncService');
const { renderScene } = require('../services/animationService');
const { generateAssSubtitles } = require('../services/subtitleService');
const { composeVideoLecture, probeVideoFile } = require('../services/videoCompositionService');
const { generateAnimatedVideoLecture, computeContentHash } = require('../services/videoGenerationService');

async function runPipelineTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING NOTIVEXA AI ANIMATED VIDEO LECTURE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: Content Hash Uniqueness & Anti-Duplication
  // -------------------------------------------------------------
  console.log('--- Test 1: Anti-Duplication & Hash Uniqueness ---');
  const hash1 = computeContentHash({
    userId: 'user_1',
    docId: 'doc_algorithms',
    title: 'Algorithms & Data Structures',
    language: 'Marathi',
    mode: 'explainer'
  });

  const hash2 = computeContentHash({
    userId: 'user_1',
    docId: 'doc_algorithms',
    title: 'Algorithms & Data Structures',
    language: 'Marathi',
    mode: 'presenter' // different mode
  });

  const hash3 = computeContentHash({
    userId: 'user_1',
    docId: 'doc_databases',
    title: 'Database Management Systems',
    language: 'Marathi',
    mode: 'explainer' // different document/topic
  });

  assert(hash1 !== hash2, 'Explainer mode and Presenter mode produce distinct hashes');
  assert(hash1 !== hash3, 'Different topics produce distinct hashes');
  assert(hash1 === computeContentHash({ userId: 'user_1', docId: 'doc_algorithms', title: 'Algorithms & Data Structures', language: 'Marathi', mode: 'explainer' }), 'Identical request produces identical hash for deterministic caching');

  // -------------------------------------------------------------
  // Test 2: Grounded Script Generation in Marathi
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Grounded Script Generation in Marathi ---');
  const sampleDocText = `
अल्गोरिदम (Algorithm) ही संगणक विज्ञानातील सर्वात महत्त्वाची संकल्पना आहे.
कोणतीही समस्या सोडवण्यासाठी दिलेल्या पायरी-दर-पायरी सूचनांच्या संचाला अल्गोरिदम म्हणतात.
यात प्रामुख्याने तीन गुणधर्म असतात: इनपुट (Input), प्रक्रिया (Processing), आणि आउटपुट (Output).
अल्गोरिदमची कार्यक्षमता Time Complexity आणि Space Complexity या दोन घटकांवर मोजली जाते.
  `.trim();

  const scriptMarathi = await generateEducationalScript({
    content: sampleDocText,
    title: 'अल्गोरिदम संकल्पना',
    subject: 'संगणक शास्त्र',
    language: 'Marathi',
    sceneCount: 3
  });

  assert(scriptMarathi && scriptMarathi.scenes && scriptMarathi.scenes.length >= 2, 'Marathi script has valid scenes');
  assert(scriptMarathi.language === 'Marathi', 'Script language is marked as Marathi');
  assert(scriptMarathi.scenes[0].diagram && scriptMarathi.scenes[0].diagram.nodes.length > 0, 'Scene includes structured diagram nodes for visual renderer');

  // -------------------------------------------------------------
  // Test 3: Voiceover Narration Synthesis in Marathi
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Marathi Voiceover Synthesis with Duration Probing ---');
  const narrationResult = await generateScriptNarration({
    scenes: scriptMarathi.scenes,
    language: 'Marathi',
    languageCode: 'mr',
    gender: 'male',
    speedMultiplier: 1.0
  });

  assert(narrationResult && fs.existsSync(narrationResult.masterAudioPath), 'Master narration audio file exists');
  assert(narrationResult.totalDuration > 5, `Audio duration is valid (${narrationResult.totalDuration}s)`);
  assert(narrationResult.fileSize > 20000, `Audio filesize is non-zero (${narrationResult.fileSize} bytes)`);

  // -------------------------------------------------------------
  // Test 4: Audio-Driven Lip-Sync Analysis
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Audio-Driven Lip-Sync Analysis (PCM Energy & ZCR) ---');
  const lipSync = await generateLipSyncKeyframes(narrationResult.masterAudioPath);

  assert(lipSync && lipSync.totalFrames > 50, `Extracted 25 FPS lip-sync frames (${lipSync.totalFrames} frames)`);
  const validVisemes = ['closed', 'slightly_open', 'open', 'wide', 'round'];
  const hasValidVisemes = lipSync.keyframes.every(v => validVisemes.includes(v));
  assert(hasValidVisemes, 'All generated visemes are valid educational viseme categories');
  assert(lipSync.keyframes.includes('closed'), 'Speech pauses and closed mouth states detected');

  // -------------------------------------------------------------
  // Test 5: Explainer Mode Scene Animation Rendering
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Explainer Mode Scene Animation (Diagram + Waveform) ---');
  const explainerClipPath = path.join(__dirname, '../uploads/video/test_explainer_clip.mp4');
  const explainerClip = await renderScene({
    mode: 'explainer',
    scene: scriptMarathi.scenes[0],
    sceneIndex: 1,
    totalScenes: scriptMarathi.scenes.length,
    duration: 6,
    audioPath: narrationResult.masterAudioPath,
    title: scriptMarathi.title,
    subject: scriptMarathi.subject,
    language: 'Marathi',
    outputPath: explainerClipPath
  });

  assert(fs.existsSync(explainerClipPath), 'Explainer mode MP4 clip generated');
  const explainerProbe = await probeVideoFile(explainerClipPath);
  assert(explainerProbe.hasVideo && explainerProbe.hasAudio, 'Explainer clip contains valid video and audio streams');

  // -------------------------------------------------------------
  // Test 6: Presenter Mode Scene Animation (Teacher Character Lip-Sync)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Presenter Mode Scene Animation (Teacher + Synchronized Mouth) ---');
  const presenterClipPath = path.join(__dirname, '../uploads/video/test_presenter_clip.mp4');
  const presenterClip = await renderScene({
    mode: 'presenter',
    scene: scriptMarathi.scenes[0],
    sceneIndex: 1,
    totalScenes: scriptMarathi.scenes.length,
    duration: 6,
    audioPath: narrationResult.masterAudioPath,
    title: scriptMarathi.title,
    subject: scriptMarathi.subject,
    language: 'Marathi',
    lipSyncTimeline: lipSync,
    outputPath: presenterClipPath
  });

  assert(fs.existsSync(presenterClipPath), 'Presenter mode MP4 clip generated');
  const presenterProbe = await probeVideoFile(presenterClipPath);
  assert(presenterProbe.hasVideo && presenterProbe.hasAudio, 'Presenter clip contains valid video and audio streams');

  // -------------------------------------------------------------
  // Test 7: Synchronized ASS Subtitle Generation in Marathi
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Synchronized ASS Subtitle Generation ---');
  const subs = generateAssSubtitles({
    scenes: scriptMarathi.scenes,
    title: scriptMarathi.title,
    subject: scriptMarathi.subject,
    language: 'Marathi',
    totalDuration: narrationResult.totalDuration,
    mode: 'explainer'
  });

  assert(fs.existsSync(subs.assFilePath), 'ASS subtitle file exists');
  const subContent = fs.readFileSync(subs.assFilePath, 'utf8');
  assert(subContent.includes('Nirmala UI') || subContent.includes('Noto Sans Devanagari'), 'Devanagari font safe style applied without commas');

  // -------------------------------------------------------------
  // Test 8: Final MP4 Video Composition & Quality Verification
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Final MP4 Video Composition ---');
  const finalVideo = await composeVideoLecture({
    sceneClips: [explainerClip],
    masterAudioPath: narrationResult.masterAudioPath,
    assSubtitleResult: subs,
    targetDuration: 6,
    outputFileName: 'test_final_marathi_lecture.mp4'
  });

  assert(fs.existsSync(finalVideo.filePath), 'Final composite MP4 file exists');
  assert(finalVideo.qualityChecks.mp4Exists, 'MP4 existence quality check verified');
  assert(finalVideo.qualityChecks.audioPresent, 'Audio presence verified');
  assert(finalVideo.qualityChecks.durationVerified, 'Duration alignment verified');
  assert(finalVideo.fileSize > 50000, `Final MP4 file size is healthy (${finalVideo.fileSize} bytes)`);

  // Cleanup temporary test files
  try {
    if (fs.existsSync(explainerClipPath)) fs.unlinkSync(explainerClipPath);
    if (fs.existsSync(presenterClipPath)) fs.unlinkSync(presenterClipPath);
  } catch {}

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

runPipelineTests().catch(err => {
  console.error('\n❌ Test pipeline encountered an error:', err);
  process.exit(1);
});

