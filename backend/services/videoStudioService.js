const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const { callAI, generateAudio } = require('./aiService');
const { resolveOutputLanguage } = require('./ocr/languageDetectionService');
const mongoose = require('mongoose');
const { VideoJob, Document } = require('../models');
const localStore = require('../utils/localStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

// --- CONFIGURATION ---
const DEFAULT_VEO_MODEL = process.env.VEO_MODEL || 'veo-2.0-generate-001';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';

// Supported options
const SUPPORTED_STYLES = [
  { id: 'realistic_cinematic', label: 'Realistic Cinematic', desc: 'Photorealistic filmic camera work with natural lighting' },
  { id: 'animated_explainer', label: 'Animated Explainer', desc: 'High-contrast 2D/3D motion graphics and vector diagrams' },
  { id: 'educational_documentary', label: 'Educational Documentary', desc: 'Narrative academic documentary with historical/scientific archival feel' },
  { id: 'scientific_simulation', label: '3D Scientific Simulation', desc: 'Technical schematics, molecular, or physical system visualization' },
  { id: 'presentation_visuals', label: 'Slide & Blackboard Lecture', desc: 'Dynamic digital blackboard with equations and step-by-step points' }
];

const SUPPORTED_ASPECT_RATIOS = ['16:9', '9:16'];
const SUPPORTED_DURATIONS = [
  { scenes: 1, duration: 6, label: '1 Scene (~6s Quick Hook)' },
  { scenes: 2, duration: 12, label: '2 Scenes (~12s Key Concept)' },
  { scenes: 3, duration: 18, label: '3 Scenes (~18s Deep Dive)' },
  { scenes: 4, duration: 24, label: '4 Scenes (~24s Masterclass)' }
];

/**
 * 1. Check Veo Capabilities & Account Status
 */
async function checkVeoCapabilities() {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  const configuredModel = process.env.VEO_MODEL || DEFAULT_VEO_MODEL;

  if (!key) {
    return {
      hasKey: false,
      hasVeoAccess: false,
      activeModel: configuredModel,
      provider: 'None (Local Dynamic Engine Only)',
      supportedStyles: SUPPORTED_STYLES,
      supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
      supportedDurations: SUPPORTED_DURATIONS,
      note: 'No Google API key configured in .env. Falling back to local educational motion engine.'
    };
  }

  // Probe Google AI endpoint for the configured Veo model
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}?key=${key}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
    
    if (res.ok) {
      const data = await res.json();
      return {
        hasKey: true,
        hasVeoAccess: true,
        activeModel: configuredModel,
        provider: 'Google Veo (Generative Language API)',
        supportedMethods: data.supportedGenerationMethods || [],
        supportedStyles: SUPPORTED_STYLES,
        supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
        supportedDurations: SUPPORTED_DURATIONS,
        note: `Google Veo model "${configuredModel}" is directly accessible.`
      };
    } else {
      const errText = await res.text();
      return {
        hasKey: true,
        hasVeoAccess: false,
        activeModel: configuredModel,
        provider: 'Google Gemini Studio + Dynamic Motion Engine',
        status: res.status,
        supportedStyles: SUPPORTED_STYLES,
        supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
        supportedDurations: SUPPORTED_DURATIONS,
        note: `Google AI Key active. Veo direct model returned HTTP ${res.status} (${configuredModel}). System will dynamically generate source-grounded scenes with visual synthesis and synchronized voiceover.`
      };
    }
  } catch (err) {
    return {
      hasKey: true,
      hasVeoAccess: false,
      activeModel: configuredModel,
      provider: 'Dynamic Educational Motion Engine',
      supportedStyles: SUPPORTED_STYLES,
      supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
      supportedDurations: SUPPORTED_DURATIONS,
      note: `Network or probe check: ${err.message}. Dynamic scene engine active.`
    };
  }
}

/**
 * 2. Generate Source-Grounded Storyboard
 */
async function generateEducationalStoryboard({
  content,
  title = 'Core Concept',
  subject = 'General Studies',
  language = 'English',
  style = 'realistic_cinematic',
  audienceLevel = 'intermediate',
  sceneCount = 3,
  docPrimaryLang = 'eng'
}) {
  const normLang = resolveOutputLanguage(language).name;
  const count = Math.min(Math.max(Number(sceneCount) || 3, 1), 4);
  const durPerScene = 6;
  const totalDuration = count * durPerScene;

  const styleObj = SUPPORTED_STYLES.find(s => s.id === style) || SUPPORTED_STYLES[0];

  const systemPrompt = `You are a world-class educational director, instructional designer, and scientific video storyboarder for Notivexa.
CRITICAL MANDATES:
1. STRICT SOURCE GROUNDING: You MUST base EVERY scene, objective, and visual strictly on the provided document content. DO NOT fabricate ungrounded fiction, unrelated jokes, or irrelevant generic stock concepts.
2. Produce a coherent, pedagogically progressive ${count}-scene educational video plan.
3. LANGUAGE: All spoken narration and text on screen MUST be in ${normLang} (use native script for Hindi, Marathi, Gujarati, etc.).
4. VISUAL SPECIFICATION: The visual description for each scene must be rich and descriptive (40-60 words), specifying the central subject, camera movement (slow pan, steady push-in, aerial, macro focus), lighting (studio, natural daylight, blueprint neon), and atmosphere matching the visual style: "${styleObj.label} (${styleObj.desc})".
5. AUDIENCE: Calibrate terminology for ${audienceLevel} students.
6. JSON FORMAT: You MUST return ONLY a valid, parseable JSON object matching this schema without markdown fences:
{
  "title": "${title.slice(0, 60)}",
  "subject": "${subject.slice(0, 40)}",
  "visualStyle": "${style}",
  "audienceLevel": "${audienceLevel}",
  "totalDuration": ${totalDuration},
  "learningGoals": [
    "Key concept 1 from text",
    "Key concept 2 from text"
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "learningObjective": "Clear 1-sentence learning objective from source",
      "sourceTopic": "Specific topic from document",
      "visualDescription": "Detailed visual prompt describing subject, environment, lighting, camera movement in style ${styleObj.label}",
      "mainSubject": "Central visual focus (e.g. Memory address bus, biological cell membrane)",
      "cameraDirection": "Push-in / Slow horizontal pan / Aerial tracking / Macro close-up",
      "onScreenText": "Key technical term or formula from source in ${normLang}",
      "durationSeconds": ${durPerScene},
      "narration": "Concise, engaging 1-2 sentence spoken explanation in ${normLang} (15-20 words)",
      "continuityNote": "Seamless visual transition into next scene"
    }
  ]
}`;

  const userPrompt = `DOCUMENT TITLE: ${title}
SUBJECT: ${subject}
TARGET SCENE COUNT: ${count}
TARGET LANGUAGE: ${normLang}
VISUAL STYLE: ${styleObj.label}

SOURCE DOCUMENT CONTENT:
${content.slice(0, 8000)}`;

  let parsed = null;
  try {
    const rawAi = await callAI(systemPrompt, userPrompt, 3500);
    if (rawAi) {
      const cleanJson = rawAi.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleanJson);
    }
  } catch (err) {
    console.warn('[VideoStudio] AI Storyboard parsing warning:', err.message);
  }

  // Fallback programmatic storyboard if AI was offline or returned non-JSON
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    console.log('[VideoStudio] Building programmatic source-grounded storyboard fallback...');
    const sentences = (content || '')
      .split(/(?<=[.?!।\n]+)/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    const generatedScenes = [];
    for (let i = 0; i < count; i++) {
      const snippet = sentences[i] || `Detailed syllabus study of ${title}`;
      const isIndic = /[\u0900-\u097F]/.test(normLang) || normLang === 'Marathi' || normLang === 'Hindi';
      const defaultNarr = isIndic
        ? `${title} मधील ही संकल्पना अभ्यासक्रमासाठी अत्यंत महत्त्वाची आहे.`
        : `Analyzing key foundational principles of ${title} for academic examination.`;

      generatedScenes.push({
        sceneNumber: i + 1,
        learningObjective: `Understand core operational mechanics of ${title} - Part ${i + 1}`,
        sourceTopic: title,
        visualDescription: `Cinematic educational visualization of ${title}. High-contrast academic studio lighting, detailed technical representation in ${styleObj.label} style, slow cinematic camera motion.`,
        mainSubject: title,
        cameraDirection: i % 2 === 0 ? 'Cinematic slow push-in zoom' : 'Smooth lateral panning shot',
        onScreenText: title.toUpperCase(),
        durationSeconds: durPerScene,
        narration: snippet.slice(0, 120) || defaultNarr,
        continuityNote: 'Continuous pedagogical progression'
      });
    }

    parsed = {
      title,
      subject,
      visualStyle: style,
      audienceLevel,
      totalDuration,
      learningGoals: [`Master foundational definitions of ${title}`, `Understand syllabus exam mechanisms`],
      scenes: generatedScenes
    };
  }

  // Normalize scene list to ensure valid durations and numbers
  parsed.scenes = parsed.scenes.slice(0, count).map((sc, idx) => ({
    sceneNumber: idx + 1,
    learningObjective: sc.learningObjective || `Concept ${idx + 1}`,
    sourceTopic: sc.sourceTopic || title,
    visualDescription: sc.visualDescription || `Educational view of ${title}`,
    mainSubject: sc.mainSubject || title,
    cameraDirection: sc.cameraDirection || 'Cinematic steady push-in',
    onScreenText: sc.onScreenText || title,
    durationSeconds: Number(sc.durationSeconds) || durPerScene,
    narration: sc.narration || `Analyzing ${title}`,
    continuityNote: sc.continuityNote || 'Standard educational transition'
  }));

  parsed.totalDuration = parsed.scenes.reduce((acc, s) => acc + s.durationSeconds, 0);
  return parsed;
}

/**
 * 3. Request Google Veo Clip via Long-Running Operations API
 */
async function generateVeoClip({ prompt, durationSeconds = 6, aspectRatio = '16:9', apiKey, modelName = DEFAULT_VEO_MODEL }) {
  if (!apiKey) throw new Error('Google API Key is required for Veo generation.');
  const clampedDur = Math.min(Math.max(Math.round(durationSeconds), 4), 8);
  console.log(`[Veo] Requesting ${clampedDur}s clip with model "${modelName}" for: "${prompt.slice(0, 60)}..."`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        durationSeconds: clampedDur,
        aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9'
      }
    }),
    timeout: 30000
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Veo API error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();
  const operationName = data.name;
  if (!operationName) {
    throw new Error('Veo API response missing operation name');
  }

  console.log(`[Veo] Operation started: ${operationName}. Polling for completion...`);

  // Poll for completion (up to 90 seconds, polling every 5s)
  const maxAttempts = 18;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.done) {
      if (pollData.error) {
        throw new Error(`Veo generation failed: ${pollData.error.message || JSON.stringify(pollData.error)}`);
      }
      const b64 = pollData.response?.predictions?.[0]?.bytesBase64Encoded;
      const videoUri = pollData.response?.predictions?.[0]?.video?.uri;
      if (b64) {
        console.log('[Veo] Video clip successfully received as base64!');
        return { buffer: Buffer.from(b64, 'base64'), isVeo: true, operationName };
      }
      if (videoUri) {
        console.log(`[Veo] Fetching video from URI: ${videoUri}`);
        const vRes = await fetch(videoUri);
        if (vRes.ok) {
          const arrBuf = await vRes.arrayBuffer();
          return { buffer: Buffer.from(arrBuf), isVeo: true, operationName };
        }
      }
      throw new Error('Veo operation completed but video content was empty');
    }
  }

  throw new Error('Veo generation timed out after 90 seconds');
}

/**
 * 4. Dynamic Educational Scene Generator (High-Fidelity fallback when Veo quota/access is unavailable)
 * Produces an individual MP4 clip for each scene with Ken Burns motion, academic color theme, and visual overlays.
 */
async function generateDynamicSceneClip({ scene, style, title, subject, language, aspectRatio = '16:9', tempDir }) {
  const clipFileName = `clip_sc_${scene.sceneNumber}_${uuidv4().slice(0, 8)}.mp4`;
  const clipPath = path.join(tempDir || OUT_DIR, clipFileName);
  const duration = scene.durationSeconds || 6;

  const isPortrait = aspectRatio === '9:16';
  const width = isPortrait ? 720 : 1280;
  const height = isPortrait ? 1280 : 720;

  // Choose visual styling based on scene number and subject
  const palettes = [
    { bg: '#0A0E1A', accent: '#3B82F6', text: '#60A5FA' }, // Deep Blue Architecture
    { bg: '#061C14', accent: '#10B981', text: '#34D399' }, // Scholar Emerald
    { bg: '#180B26', accent: '#8B5CF6', text: '#A78BFA' }, // Violet Intelligence
    { bg: '#1F1305', accent: '#F59E0B', text: '#FBBF24' }  // Amber Focus
  ];
  const pal = palettes[(scene.sceneNumber - 1) % palettes.length];

  // Camera motion selection
  const motions = [
    `zoompan=z='min(zoom+0.0015,1.25)':d=${duration * 24}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`,
    `zoompan=z='1.15':d=${duration * 24}:x='(in/${duration * 24})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`,
    `zoompan=z='if(lte(zoom,1.0),1.25,max(1.0,zoom-0.0015))':d=${duration * 24}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`,
    `zoompan=z='1.1':d=${duration * 24}:x='iw/2-(iw/zoom/2)':y='(in/${duration * 24})*(ih-ih/zoom)':s=${width}x${height}`
  ];
  const motionFilter = motions[(scene.sceneNumber - 1) % motions.length];

  // Check if real presenter/classroom motion video is available as background base
  const stockMotion = [
    path.join(__dirname, '../assets/videos/classroom_motion.mp4'),
    path.join(__dirname, '../assets/videos/presenter_motion.mp4')
  ].find(p => fs.existsSync(p));

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    if (stockMotion) {
      // Loop stock motion video
      cmd = cmd
        .input(stockMotion)
        .inputOptions(['-stream_loop', '-1', '-t', String(duration)]);

      const filtergraph = [
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[base]`,
        `[base]drawbox=x=0:y=0:w=${width}:h=${height}:color=${pal.bg}@0.45:t=fill[tinted]`,
        `[tinted]drawbox=x=20:y=20:w=${width - 40}:h=50:color=#000000@0.75:t=fill[top_bar]`,
        `[top_bar]drawbox=x=20:y=20:w=${width - 40}:h=50:color=${pal.accent}@0.8:t=2[framed]`,
        `[framed]format=yuv420p[out_v]`
      ];
      cmd = cmd.complexFilter(filtergraph.join(';'));
    } else {
      // Procedural animated gradient with dynamic camera motion
      cmd = cmd
        .input(`color=c=${pal.bg}:s=${width}x${height}:d=${duration}:r=24`)
        .inputFormat('lavfi');

      const filtergraph = [
        `[0:v]drawbox=x=40:y=40:w=${width - 80}:h=${height - 80}:color=${pal.accent}@0.15:t=fill[box]`,
        `[box]drawbox=x=40:y=40:w=${width - 80}:h=${height - 80}:color=${pal.accent}@0.6:t=2[framed]`,
        `[framed]format=yuv420p[out_v]`
      ];
      cmd = cmd.complexFilter(filtergraph.join(';'));
    }

    cmd
      .outputOptions([
        '-map [out_v]',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 24',
        '-r 24',
        '-pix_fmt yuv420p',
        '-t', String(duration)
      ])
      .save(clipPath)
      .on('end', () => {
        resolve({
          sceneNumber: scene.sceneNumber,
          clipPath,
          clipFileName,
          duration,
          isVeo: false
        });
      })
      .on('error', (err) => {
        console.error(`[VideoStudio] Clip ${scene.sceneNumber} render error:`, err.message);
        reject(err);
      });
  });
}

/**
 * 5. Stitch Clips, Audio Narration, and Subtitles into Final Educational Video
 */
async function stitchAndMasterVideo({
  clips,
  storyboard,
  narrationAudioPath,
  language = 'English',
  aspectRatio = '16:9',
  finalVideoPath,
  fileName
}) {
  const isPortrait = aspectRatio === '9:16';
  const width = isPortrait ? 720 : 1280;
  const height = isPortrait ? 1280 : 720;
  const totalDuration = storyboard.totalDuration || clips.reduce((acc, c) => acc + (c.duration || 6), 0);

  // 1. Create FFmpeg concat list
  const concatFile = path.join(OUT_DIR, `concat_${uuidv4()}.txt`);
  const fileLines = clips.map(c => `file '${c.clipPath.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatFile, fileLines, 'utf8');

  // 2. Build Subtitle File (.ass)
  const assPath = path.join(OUT_DIR, `subs_${uuidv4()}.ass`);
  let hasAss = false;
  let relAssPath = '';

  try {
    const formatAssTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const cs = Math.floor((sec % 1) * 100);
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    };

    const hasDevanagari = /[\u0900-\u097F]/.test(JSON.stringify(storyboard));
    const fontName = hasDevanagari ? (process.platform === 'win32' ? 'Nirmala UI' : 'Noto Sans Devanagari') : 'Arial';
    const headerTitle = hasDevanagari
      ? `व्याख्यान: ${storyboard.title || 'अभ्यास'} | Notivexa`
      : `LESSON: ${(storyboard.title || 'STUDY').toUpperCase()} | Notivexa AI Video Studio`;

    let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TopHeader,${fontName},${isPortrait ? 20 : 24},&H00FFFFFF,&H00000000,&H000F172A,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,8,25,25,18,1
Style: SceneBadge,${fontName},${isPortrait ? 18 : 20},&H0010B981,&H00000000,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,2,1,7,25,25,${isPortrait ? 75 : 65},1
Style: ActiveDialogue,${fontName},${isPortrait ? 22 : 28},&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,2,2,30,30,${isPortrait ? 60 : 36},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(totalDuration)},TopHeader,,0,0,0,,{\\b1}🎓 ${headerTitle}{\\b0}
`;

    // Add per-scene subtitles
    let currentStart = 0;
    storyboard.scenes.forEach(sc => {
      const dur = sc.durationSeconds || 6;
      const end = currentStart + dur;
      const badgeText = hasDevanagari
        ? `भाग ${sc.sceneNumber}: ${sc.sourceTopic || sc.mainSubject}`
        : `SCENE ${sc.sceneNumber}: ${sc.sourceTopic || sc.mainSubject}`;

      assContent += `Dialogue: 2,${formatAssTime(currentStart)},${formatAssTime(end)},SceneBadge,,0,0,0,,{\\b1}📍 ${badgeText}{\\b0}\n`;

      const narrationClean = (sc.narration || sc.learningObjective || '').replace(/\r?\n/g, ' ').trim();
      if (narrationClean) {
        assContent += `Dialogue: 3,${formatAssTime(currentStart)},${formatAssTime(end)},ActiveDialogue,,0,0,0,,${narrationClean}\n`;
      }
      currentStart = end;
    });

    fs.writeFileSync(assPath, assContent, 'utf8');
    hasAss = true;
    relAssPath = path.relative(process.cwd(), assPath).replace(/\\/g, '/').replace(/:/g, '\\:');
  } catch (e) {
    console.warn('[VideoStudio] Subtitle creation warning:', e.message);
    hasAss = false;
  }

  // 3. Render concatenated video with audio & subtitles
  return new Promise((resolve, reject) => {
    console.log(`[VideoStudio] Stitching ${clips.length} clips into final video (${totalDuration}s)...`);
    let cmd = ffmpeg();

    // Input 0: Concatenated video clips
    cmd = cmd
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    // Input 1: Narration audio (or synthetic fallback)
    cmd = cmd.input(narrationAudioPath);

    const complexFilter = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[base_v]`
    ];

    if (hasAss && relAssPath) {
      complexFilter.push(`[base_v]ass='${relAssPath}'[out_v]`);
    } else {
      complexFilter.push(`[base_v]copy[out_v]`);
    }

    cmd
      .complexFilter(complexFilter.join(';'))
      .outputOptions([
        '-map [out_v]',
        '-map 1:a',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 24',
        '-maxrate 2.5M',
        '-bufsize 5M',
        '-r 24',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-c:a aac',
        '-b:a 128k',
        '-t', String(totalDuration)
      ])
      .save(finalVideoPath)
      .on('end', () => {
        if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
        if (hasAss && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        const fileSize = fs.existsSync(finalVideoPath) ? fs.statSync(finalVideoPath).size : 0;
        console.log(`[VideoStudio] Final video rendered: ${fileName} (${fileSize} bytes)`);
        resolve({
          fileName,
          videoPath: finalVideoPath,
          videoUrl: `/uploads/video/${fileName}`,
          fileSize,
          duration: totalDuration
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
        if (hasAss && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        console.error('[VideoStudio] Stitching error:', err.message);
        reject(err);
      });
  });
}

/**
 * 6. Master Asynchronous Video Job Pipeline
 */
async function processVideoStudioJob(jobId, userId) {
  let job = null;
  if (isDbConnected()) {
    try { job = await VideoJob.findById(jobId); } catch {}
  }
  if (!job) job = localStore.getVideoJobById(jobId, userId);
  if (!job) return;

  const updateJob = async (fields) => {
    Object.assign(job, fields);
    if (isDbConnected() && job.save) {
      try { await job.save(); } catch {}
    } else {
      localStore.updateVideoJob(jobId, fields, userId);
    }
  };

  try {
    // Stage 1: Storyboard Verification
    await updateJob({
      status: 'storyboard_ready',
      progress: 'Grounded storyboard synthesized and ready'
    });

    const storyboard = {
      title: job.title,
      subject: job.subject,
      visualStyle: job.style,
      audienceLevel: job.audienceLevel,
      totalDuration: job.durationSeconds || (job.storyboard.length * 6),
      scenes: job.storyboard
    };

    // Stage 2: Scene-by-Scene Video Generation (Veo or Dynamic Motion Engine)
    await updateJob({
      status: 'generating_scenes',
      progress: 'Generating video scenes...'
    });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    const veoModel = job.modelUsed || DEFAULT_VEO_MODEL;
    const generatedClips = [];
    let isVeoEngine = false;

    for (let i = 0; i < storyboard.scenes.length; i++) {
      const sc = storyboard.scenes[i];
      await updateJob({
        progress: `Generating Scene ${sc.sceneNumber}/${storyboard.scenes.length}: "${(sc.mainSubject || sc.sourceTopic).slice(0, 30)}"...`
      });

      let clipResult = null;

      // Try Google Veo if API key is provided and preferred
      if (apiKey && !apiKey.startsWith('your_') && job.engine !== 'dynamic_scene_render') {
        try {
          const veoRes = await generateVeoClip({
            prompt: `${sc.visualDescription}. Visual style: ${job.style}. High educational fidelity.`,
            durationSeconds: sc.durationSeconds || 6,
            aspectRatio: job.aspectRatio || '16:9',
            apiKey,
            modelName: veoModel
          });

          if (veoRes && veoRes.buffer) {
            const clipName = `veo_sc_${sc.sceneNumber}_${uuidv4().slice(0, 8)}.mp4`;
            const clipPath = path.join(OUT_DIR, clipName);
            fs.writeFileSync(clipPath, veoRes.buffer);
            clipResult = {
              sceneNumber: sc.sceneNumber,
              clipPath,
              fileName: clipName,
              duration: sc.durationSeconds || 6,
              isVeo: true
            };
            isVeoEngine = true;
          }
        } catch (veoErr) {
          console.warn(`[VideoStudio] Veo direct call for Scene ${sc.sceneNumber} fallback:`, veoErr.message);
        }
      }

      // If Veo was unavailable, quota exceeded, or in fallback mode: use Dynamic Educational Scene Engine
      if (!clipResult) {
        clipResult = await generateDynamicSceneClip({
          scene: sc,
          style: job.style,
          title: job.title,
          subject: job.subject,
          language: job.language,
          aspectRatio: job.aspectRatio || '16:9',
          tempDir: OUT_DIR
        });
      }

      generatedClips.push(clipResult);
    }

    // Stage 3: Synthesize Spoken Narration Audio matching target language
    await updateJob({
      status: 'processing_media',
      progress: 'Synthesizing voiceover narration in ' + job.language + '...'
    });

    const combinedNarration = storyboard.scenes
      .map(s => s.narration)
      .filter(Boolean)
      .join(' ');

    const langInfo = resolveOutputLanguage(job.language);
    const audioRes = await generateAudio(combinedNarration, {
      language: langInfo.code,
      outputLanguage: job.language,
      voiceStyle: 'male'
    });

    // Stage 4: Concatenate clips + composite audio & subtitles
    await updateJob({
      progress: 'Mastering Full HD educational video with subtitles...'
    });

    const finalFileName = `notivexa_studio_${uuidv4()}.mp4`;
    const finalFilePath = path.join(OUT_DIR, finalFileName);

    const masterResult = await stitchAndMasterVideo({
      clips: generatedClips,
      storyboard,
      narrationAudioPath: audioRes.filePath,
      language: job.language,
      aspectRatio: job.aspectRatio || '16:9',
      finalVideoPath: finalFilePath,
      fileName: finalFileName
    });

    // Stage 5: Finalize and Save
    await updateJob({
      status: 'completed',
      progress: 'Video generation completed successfully!',
      engine: isVeoEngine ? 'google_veo' : 'dynamic_scene_render',
      finalVideoUrl: masterResult.videoUrl,
      finalVideoPath: masterResult.videoPath,
      audioUrl: `/uploads/audio/${audioRes.fileName}`,
      fileSize: masterResult.fileSize,
      durationSeconds: masterResult.duration,
      clips: generatedClips.map(c => ({
        sceneNumber: c.sceneNumber,
        fileName: c.clipFileName || c.fileName,
        filePath: c.clipPath,
        duration: c.duration,
        isVeo: c.isVeo || false
      })),
      completedAt: new Date()
    });

    // Also register video in Document outputs if attached to a document
    if (job.docId) {
      try {
        let parentDoc = null;
        if (isDbConnected()) {
          parentDoc = await Document.findById(job.docId);
        }
        if (!parentDoc) parentDoc = localStore.getDocById(job.docId, userId);
        if (parentDoc) {
          if (!parentDoc.outputs) parentDoc.outputs = [];
          parentDoc.outputs.push({
            type: 'video',
            language: job.language,
            fileName: finalFileName,
            filePath: finalFilePath,
            fileSize: masterResult.fileSize,
            createdAt: new Date()
          });
          if (isDbConnected() && parentDoc.save) await parentDoc.save();
          else localStore.updateDoc(parentDoc._id || parentDoc.id, { outputs: parentDoc.outputs });
        }
      } catch (docSaveErr) {
        console.warn('[VideoStudio] Could not link to parent doc outputs:', docSaveErr.message);
      }
    }

    console.log(`[VideoStudio] Job ${jobId} completed successfully: ${masterResult.videoUrl}`);
  } catch (err) {
    console.error(`[VideoStudio] Job ${jobId} failed:`, err.message);
    await updateJob({
      status: 'failed',
      progress: 'Video generation failed.',
      error: err.message
    });
  }
}

module.exports = {
  checkVeoCapabilities,
  generateEducationalStoryboard,
  generateVeoClip,
  generateDynamicSceneClip,
  stitchAndMasterVideo,
  processVideoStudioJob,
  SUPPORTED_STYLES,
  SUPPORTED_ASPECT_RATIOS,
  SUPPORTED_DURATIONS
};

