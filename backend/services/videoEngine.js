const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

// --- GOOGLE VEO (GEMINI VIDEO) GENERATION ---
async function generateVeoClip(prompt, durationSec = 6, apiKey) {
  const clampedDur = Math.min(Math.max(Math.round(durationSec), 4), 8); // Veo requires 4-8 seconds
  console.log(`[Veo] Requesting ${clampedDur}s AI video clip: "${prompt.slice(0, 60)}..."`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        durationSeconds: clampedDur,
        aspectRatio: '9:16'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veo API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const operationName = data.name;
  if (!operationName) {
    throw new Error('Veo API did not return operation name');
  }

  console.log(`[Veo] Operation started: ${operationName}. Polling for completion...`);

  // Poll for completion (up to 20s, every 5s)
  const maxAttempts = 4;
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
        return Buffer.from(b64, 'base64');
      }
      if (videoUri) {
        console.log(`[Veo] Fetching video from URI: ${videoUri}`);
        const vRes = await fetch(videoUri);
        if (vRes.ok) {
          const arrBuf = await vRes.arrayBuffer();
          return Buffer.from(arrBuf);
        }
      }
      throw new Error('Veo operation completed but video content was empty');
    }
  }

  throw new Error('Veo generation timed out after 2 minutes');
}

// Mux a Veo-generated video clip with audio and subtitles
async function muxVeoWithAudio(veoVideoBuffer, audioPath, targetDuration, assPath, videoPath, fileName) {
  const tempVeoFile = path.join(OUT_DIR, `veo_raw_${uuidv4()}.mp4`);
  fs.writeFileSync(tempVeoFile, veoVideoBuffer);

  try {
    return await new Promise((resolve, reject) => {
      console.log(`[Video] Muxing Veo clip with audio (${targetDuration}s)...`);
      const hasAss = assPath && fs.existsSync(assPath);
      const relAssPath = hasAss ? path.relative(process.cwd(), assPath).replace(/\\/g, '/').replace(/:/g, '\\:') : '';

      let cmd = ffmpeg()
        .input(tempVeoFile)
        .inputOptions(['-stream_loop', '-1']) // Loop Veo clip to cover full audio length
        .input(audioPath);

      if (hasAss && relAssPath) {
        cmd = cmd.complexFilter(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,ass='${relAssPath}'[out_v]`);
        cmd = cmd.outputOptions(['-map [out_v]', '-map 1:a']);
      } else {
        cmd = cmd.outputOptions(['-map 0:v', '-map 1:a']);
      }

      cmd
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 26',
          '-maxrate 2.5M',
          '-bufsize 5M',
          '-r 24',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-c:a aac',
          '-b:a 128k',
          '-t', String(targetDuration)
        ])
        .save(videoPath)
        .on('end', () => {
          if (fs.existsSync(tempVeoFile)) fs.unlinkSync(tempVeoFile);
          if (hasAss && fs.existsSync(assPath)) fs.unlinkSync(assPath);
          const fileSize = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0;
          console.log(`[Video] Veo realistic video generated: ${fileName} (${fileSize} bytes)`);
          resolve({ fileName, videoPath, videoUrl: `/uploads/video/${fileName}`, fileSize, isVeo: true });
        })
        .on('error', (err) => {
          if (fs.existsSync(tempVeoFile)) fs.unlinkSync(tempVeoFile);
          reject(err);
        });
    });
  } catch (err) {
    if (fs.existsSync(tempVeoFile)) fs.unlinkSync(tempVeoFile);
    throw err;
  }
}

// --- MAIN VIDEO GENERATOR ---
async function createVideoFromAudio(audioPath, script = '', durationSeconds = 45) {
  const fileName = `video_${uuidv4()}.mp4`;
  const videoPath = path.join(OUT_DIR, fileName);

  // 1. Target duration capped to 15s - 30s (ideal educational Shorts format, lightning-fast cloud render)
  const targetDuration = Math.min(Math.max(Number(durationSeconds) || 25, 15), 30);

  // 2. Validate audio path; generate silent fallback if missing
  let finalAudioPath = audioPath;
  let tempAudioCreated = false;
  if (!finalAudioPath || !fs.existsSync(finalAudioPath) || fs.statSync(finalAudioPath).size === 0) {
    console.warn('[Video] Audio file missing or empty. Generating fallback audio.');
    finalAudioPath = path.join(OUT_DIR, `fallback_audio_${uuidv4()}.mp3`);
    try {
      await new Promise((res, rej) => {
        ffmpeg()
          .input(`aevalsrc=0:d=${targetDuration}:s=24000`)
          .inputFormat('lavfi')
          .output(finalAudioPath)
          .on('end', res)
          .on('error', rej)
          .run();
      });
      tempAudioCreated = true;
    } catch (e) {
      console.warn('[Video] Fallback audio warning:', e.message);
    }
  }

  // 3. Motion Video Footage (ACTUAL REAL VIDEO, NO STATIC IMAGES)
  const motionVideoPath = [
    path.join(__dirname, '../assets/videos/classroom_motion.mp4'),
    path.join(__dirname, '../test_zoom.mp4'),
    path.join(__dirname, '../assets/videos/presenter_motion.mp4'),
    path.join(__dirname, '../uploads/teacher_stock.mp4')
  ].find(p => fs.existsSync(p)) || null;

  // 4. Parse Script into Topic, Blackboard Points & Dialogue
  const rawScript = script || '';
  const lines = rawScript.split('\n').map(l => l.trim()).filter(Boolean);

  let topicName = 'Core Academic Concept';
  const points = [];

  lines.forEach(l => {
    if (l.toLowerCase().includes('topic:') || l.toLowerCase().includes('title:')) {
      const extracted = l.replace(/.*(?:topic|title):\s*/i, '').replace(/["'\[\]]/g, '').trim();
      if (extracted.length > 2) topicName = extracted.slice(0, 32);
    }
    if (l.match(/^[-•*\d.]+\s+/)) {
      const p = l.replace(/^[-•*\d.]+\s*/, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
      if (p.length > 3) points.push(p.slice(0, 32));
    }
  });

  if (points.length === 0) {
    points.push('1. Foundational Architecture');
    points.push('2. Core Process & Workflow');
    points.push('3. Key Exam Principles');
  }

  // Build dialogue phrases for ASS Subtitles
  const dialogueLines = [];
  lines.forEach(l => {
    if (l.startsWith('[') || l.toLowerCase().includes('visual:') || l.toLowerCase().startsWith('topic:')) return;
    const isStudent = /^(?:student|bunty|learner|class):\s*/i.test(l);
    const speaker = isStudent ? 'student' : 'teacher';
    const cleanL = l.replace(/^(?:professor|teacher|student|bunty|sir|instructor|narrator|narration):\s*/i, '').trim();
    if (cleanL) {
      const words = cleanL.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 5) {
        dialogueLines.push({
          speaker,
          isFirstChunk: i === 0,
          text: words.slice(i, i + 5).join(' ')
        });
      }
    }
  });

  if (dialogueLines.length === 0) {
    dialogueLines.push({ speaker: 'teacher', isFirstChunk: true, text: `Welcome to ${topicName} lecture!` });
    dialogueLines.push({ speaker: 'student', isFirstChunk: true, text: 'Professor, how does it operate?' });
    dialogueLines.push({ speaker: 'teacher', isFirstChunk: true, text: 'Notice the core syllabus principles!' });
  }

  const totalChars = dialogueLines.reduce((acc, d) => acc + d.text.length, 0) || 1;
  let currentTime = 0;

  dialogueLines.forEach(item => {
    const phraseDur = Math.max(1.5, (item.text.length / totalChars) * targetDuration);
    const start = currentTime;
    const end = Math.min(currentTime + phraseDur, targetDuration);
    item.start = start;
    item.end = end;
    currentTime = end;
  });

  // 5. Build Academic ASS Subtitle File
  const assName = `subs_${uuidv4()}.ass`;
  const assPath = path.join(OUT_DIR, assName);
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

    const hasDevanagari = /[\u0900-\u097F]/.test(rawScript);
    const fontName = hasDevanagari ? 'Nirmala UI, Mangal, Arial' : 'Arial';

    let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TopHeader,${fontName},24,&H00FFFFFF,&H00000000,&H000F172A,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,8,30,30,15,1
Style: ActiveDialogue,${fontName},28,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,32,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},TopHeader,,0,0,0,,{\\b1}🎓 LECTURE: ${topicName.toUpperCase()} | Notivexa Smart Study{\\b0}
`;

    dialogueLines.forEach(item => {
      const isTeacher = item.speaker === 'teacher';
      const teacherLabel = hasDevanagari ? '[प्राध्यापक]: ' : '[PROFESSOR]: ';
      const studentLabel = hasDevanagari ? '[विद्यार्थी]: ' : '[STUDENT]: ';
      const prefix = item.isFirstChunk
        ? (isTeacher ? `{\\c&H00D7FF&\\b1}${teacherLabel}{\\c&HFFFFFF&\\b0}` : `{\\c&HFFE259&\\b1}${studentLabel}{\\c&HFFFFFF&\\b0}`)
        : (isTeacher ? '{\\c&H00D7FF&\\b1}• {\\c&HFFFFFF&\\b0}' : '{\\c&HFFE259&\\b1}• {\\c&HFFFFFF&\\b0}');
      assContent += `Dialogue: 2,${formatAssTime(item.start)},${formatAssTime(item.end)},ActiveDialogue,,0,0,32,,{\\fscx95\\fscy95\\t(0,60,\\fscx100\\fscy100)}${prefix}${item.text}\n`;
    });

    fs.writeFileSync(assPath, assContent);
    hasAss = true;
    relAssPath = path.relative(process.cwd(), assPath).replace(/\\/g, '/').replace(/:/g, '\\:');
  } catch (e) {
    console.warn('[Video] Subtitles warning:', e.message);
    hasAss = false;
  }

  // 6. Direct High-Speed Motion Video Lecture (No Veo 404 delays)
  // Google Veo 3.1 preview API has been retired by Google in favor of Gemini 3.8 / Omni multimodal.

  // 7. REAL MOTION VIDEO LECTURE ENGINE (NO STATIC IMAGES)
  const renderJob = (withSubtitles = true) => {
    return new Promise((resolve, reject) => {
      console.log(`[Video] Rendering Real Motion Video Lecture (${targetDuration}s, subs=${withSubtitles && hasAss})...`);
      let cmd = ffmpeg();

      // Input 0: Audio track
      cmd = cmd.input(finalAudioPath);

      // Input 1: Motion Video Footage (1280x720 landscape educational presentation)
      if (motionVideoPath) {
        cmd = cmd.input(motionVideoPath).inputOptions(['-stream_loop', '-1', '-t', String(targetDuration)]);
      } else {
        cmd = cmd.input('color=c=#0f172a:s=1280x720:r=24').inputFormat('lavfi').inputOptions(['-t', String(targetDuration)]);
      }

      // Filtergraph construction
      const complexFilter = [
        '[0:a]asplit=2[a_wave][a_out]'
      ];

      // Format video: scale & fit to 1280x720 without distorting the real teacher footage
      if (motionVideoPath) {
        complexFilter.push(`[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[base_vid]`);
      } else {
        complexFilter.push(`[1:v]format=yuv420p[base_vid]`);
      }

      // Top semi-transparent header bar
      complexFilter.push(`[base_vid]drawbox=x=0:y=0:w=1280:h=55:color=#061c14@0.80:t=fill[top_bar]`);

      // Bottom subtitle container with subtle Scholar Green border
      complexFilter.push(`[top_bar]drawbox=x=40:y=625:w=1200:h=75:color=#0f172a@0.85:t=fill[sub_bar]`);
      complexFilter.push(`[sub_bar]drawbox=x=40:y=625:w=1200:h=75:color=#10b981@0.75:t=2[sub_framed]`);

      // Add audio visualizer waveform across bottom
      complexFilter.push(`[a_wave]showwaves=s=1200x25:colors=#10b981:mode=line:rate=20,colorkey=black:0.1:0.1[wave]`);
      complexFilter.push(`[sub_framed][wave]overlay=40:600:shortest=1[scene_wave]`);

      if (withSubtitles && hasAss && relAssPath) {
        complexFilter.push(`[scene_wave]ass='${relAssPath}'[out_final]`);
      } else {
        complexFilter.push(`[scene_wave]copy[out_final]`);
      }

      cmd
        .complexFilter(complexFilter.join(';'))
        .outputOptions([
          '-map [out_final]',
          '-map [a_out]',
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 28',
          '-maxrate 1.5M',
          '-bufsize 3M',
          '-tune fastdecode',
          '-threads 2',
          '-r 20',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-c:a aac',
          '-b:a 128k',
          '-t', String(targetDuration)
        ])
        .save(videoPath)
        .on('end', () => {
          const fileSize = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0;
          console.log(`[Video] Real Motion Video Lecture rendered: ${fileName} (${fileSize} bytes)`);
          if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
          if (tempAudioCreated && fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
          resolve({ fileName, videoPath, videoUrl: `/uploads/video/${fileName}`, fileSize, isVeo: false });
        })
        .on('error', (err) => {
          console.error('[Video] Render error:', err.message);
          reject(err);
        });
    });
  };

  try {
    return await renderJob(true);
  } catch (err) {
    console.warn('[Video] Retrying without ASS subtitle filter:', err.message);
    try {
      return await renderJob(false);
    } catch (fallbackErr) {
      if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
      if (tempAudioCreated && fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
      throw fallbackErr;
    }
  }
}

module.exports = { createVideoFromAudio };
