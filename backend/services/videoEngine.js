const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function createVideoFromAudio(audioPath, script = '', durationSeconds = 60) {
  const fileName = `video_${uuidv4()}.mp4`;
  const videoPath = path.join(OUT_DIR, fileName);

  // 1. Target duration capped to 30s - 75s (ideal educational Shorts format)
  const targetDuration = Math.min(Math.max(Number(durationSeconds) || 45, 20), 75);

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

  // Visual Assets (committed in assets/cartoon with fallback to uploads/)
  const customBgPath = [
    path.join(__dirname, '../assets/cartoon/classroom_bg.png'),
    path.join(__dirname, '../uploads/classroom_bg.png')
  ].find(p => fs.existsSync(p)) || null;

  const teacherImgPath = [
    path.join(__dirname, '../assets/cartoon/cartoon_teacher.png'),
    path.join(__dirname, '../uploads/cartoon_teacher.png')
  ].find(p => fs.existsSync(p)) || null;

  const studentImgPath = [
    path.join(__dirname, '../assets/cartoon/cartoon_student.png'),
    path.join(__dirname, '../uploads/cartoon_student.png')
  ].find(p => fs.existsSync(p)) || null;

  const useBg = customBgPath;
  const useTeacher = teacherImgPath;
  const useStudent = studentImgPath;

  // 3. Parse Script into Dialogue & Blackboard points
  const rawScript = script || '';
  const lines = rawScript.split('\n').map(l => l.trim()).filter(Boolean);

  let topicName = 'Core Academic Concept';
  const points = [];

  lines.forEach(l => {
    if (l.toLowerCase().includes('topic:') || l.toLowerCase().includes('title:')) {
      const extracted = l.replace(/.*(?:topic|title):\s*/i, '').replace(/["'\[\]]/g, '').trim();
      if (extracted.length > 2) topicName = extracted.slice(0, 34);
    }
    if (l.match(/^[-•*\d.]+\s+/)) {
      const p = l.replace(/^[-•*\d.]+\s*/, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
      if (p.length > 3) points.push(p.slice(0, 34));
    }
  });

  if (points.length === 0) {
    points.push('1. Foundational Architecture');
    points.push('2. Process Control & Execution');
    points.push('3. University Exam Key Rules');
  }

  // Build dialogue phrases for ASS Subtitles
  const dialogueLines = [];
  lines.forEach(l => {
    if (l.startsWith('[') || l.toLowerCase().includes('visual:') || l.toLowerCase().startsWith('topic:')) return;
    const isStudent = /^(?:student|bunty|learner|class):\s*/i.test(l);
    const speaker = isStudent ? 'student' : 'teacher';
    const cleanL = l.replace(/^(?:professor|teacher|student|bunty|sir|instructor|narrator|narration):\s*/i, '').trim();
    if (cleanL) {
      // Break into 3-4 word popup chunks
      const words = cleanL.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 4) {
        dialogueLines.push({
          speaker,
          isFirstChunk: i === 0,
          text: words.slice(i, i + 4).join(' ')
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
  const teacherIntervals = [];
  const studentIntervals = [];

  dialogueLines.forEach(item => {
    const phraseDur = Math.max(1.1, (item.text.length / totalChars) * targetDuration);
    const start = currentTime;
    const end = Math.min(currentTime + phraseDur, targetDuration);
    item.start = start;
    item.end = end;
    if (item.speaker === 'teacher') {
      teacherIntervals.push({ start, end });
    } else {
      studentIntervals.push({ start, end });
    }
    currentTime = end;
  });

  const mergeIntervals = (invs) => {
    if (!invs.length) return [];
    const sorted = [...invs].sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = sorted[i];
      if (curr.start <= prev.end + 0.15) {
        prev.end = Math.max(prev.end, curr.end);
      } else {
        merged.push({ ...curr });
      }
    }
    return merged;
  };

  const mTeacher = mergeIntervals(teacherIntervals);
  const mStudent = mergeIntervals(studentIntervals);

  const teacherCond = mTeacher.length > 0
    ? `gte(${mTeacher.map(inv => `between(t,${inv.start.toFixed(2)},${inv.end.toFixed(2)})`).join('+')},1)`
    : '1';

  const studentCond = mStudent.length > 0
    ? `gte(${mStudent.map(inv => `between(t,${inv.start.toFixed(2)},${inv.end.toFixed(2)})`).join('+')},1)`
    : '0';

  // 4. Build Professional Academic ASS Subtitle File
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

    let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TopHeader,Arial,25,&H00FFFFFF,&H00000000,&H000F172A,&HFF000000,-1,0,0,0,100,100,0,0,1,8,2,8,20,20,30,1
Style: BoardTitle,Arial,25,&H0022D3EE,&H00000000,&H000F172A,&HFF000000,-1,0,0,0,100,100,0,0,1,7,2,8,45,45,78,1
Style: BoardBullets,Arial,22,&H00F0FDF4,&H00000000,&H000F172A,&HFF000000,-1,0,0,0,100,100,0,0,1,7,2,8,45,45,118,1
Style: BottomPill,Arial,24,&H00FFFFFF,&H00000000,&H000F172A,&HFF000000,-1,0,0,0,100,100,0,0,1,6,2,2,20,20,30,1
Style: ActiveDialogue,Arial,38,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,1,8,3,8,25,25,315,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},TopHeader,,0,0,0,,{\\b1}🎓 LECTURE: ${topicName.toUpperCase()} | CORE EXAM REVISION{\\b0}
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},BoardTitle,,0,0,0,,{\\b1}📌 KEY SYLLABUS PRINCIPLES:{\\b0}
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},BoardBullets,,0,0,0,,{\\b1}• 1. ${points[0] || 'Core Architecture'}\\N• 2. ${points[1] || 'Process Workflow'}\\N• 3. ${points[2] || 'Exam Takeaway'}{\\b0}
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},BottomPill,,0,0,0,,{\\b1}📚 Notivexa Smart Study | Verified Document Lecture{\\b0}
`;

    dialogueLines.forEach(item => {
      const isTeacher = item.speaker === 'teacher';
      const prefix = item.isFirstChunk
        ? (isTeacher ? '{\\c&H00D7FF&\\b1}[PROFESSOR]: {\\c&HFFFFFF&\\b0}' : '{\\c&HFFE259&\\b1}[STUDENT]: {\\c&HFFFFFF&\\b0}')
        : (isTeacher ? '{\\c&H00D7FF&\\b1}• {\\c&HFFFFFF&\\b0}' : '{\\c&HFFE259&\\b1}• {\\c&HFFFFFF&\\b0}');
      assContent += `Dialogue: 2,${formatAssTime(item.start)},${formatAssTime(item.end)},ActiveDialogue,,0,0,315,,{\\fscx90\\fscy90\\t(0,70,\\fscx100\\fscy100)}${prefix}${item.text}\n`;
    });

    fs.writeFileSync(assPath, assContent);
    hasAss = true;
    relAssPath = path.relative(process.cwd(), assPath).replace(/\\/g, '/').replace(/:/g, '\\:');
  } catch (e) {
    console.warn('[Video] Subtitles warning:', e.message);
    hasAss = false;
  }

  // 5. Render Video using FFmpeg
  const renderJob = (withSubtitles = true) => {
    return new Promise((resolve, reject) => {
      console.log(`[Video] Rendering Cartoon Classroom Short (${targetDuration}s, subs=${withSubtitles && hasAss})...`);
      let cmd = ffmpeg();

      // Input 0: Audio track
      cmd = cmd.input(finalAudioPath);
      let nextInputIdx = 1;

      // Input 1: Visual background
      const bgInputIdx = nextInputIdx++;
      if (useBg) {
        cmd = cmd.input(useBg).inputOptions(['-loop', '1', '-framerate', '30', '-t', String(targetDuration)]);
      } else {
        cmd = cmd.input('color=c=#0f172a:s=720x1280:r=30').inputFormat('lavfi').inputOptions(['-t', String(targetDuration)]);
      }

      // Input 2: Cartoon Teacher
      let teacherInputIdx = -1;
      if (useTeacher) {
        teacherInputIdx = nextInputIdx++;
        cmd = cmd.input(useTeacher).inputOptions(['-loop', '1', '-framerate', '30', '-t', String(targetDuration)]);
      }

      // Input 3: Cartoon Student
      let studentInputIdx = -1;
      if (useStudent) {
        studentInputIdx = nextInputIdx++;
        cmd = cmd.input(useStudent).inputOptions(['-loop', '1', '-framerate', '30', '-t', String(targetDuration)]);
      }

      // Filtergraph construction
      const complexFilter = [
        '[0:a]asplit=2[a_wave][a_out]'
      ];

      // Format background: crop & scale to vertical 9:16 (720x1280)
      if (useBg) {
        complexFilter.push(`[${bgInputIdx}:v]crop=ih*9/16:ih:iw/2-ih*9/32:0,scale=720:1280,format=rgba[bg]`);
      } else {
        complexFilter.push(`[${bgInputIdx}:v]format=rgba[bg]`);
      }

      // Add elegant classroom chalkboard frame on top
      complexFilter.push(`[bg]drawbox=x=25:y=65:w=670:h=235:color=#061c14@0.90:t=fill[bg_board]`);
      complexFilter.push(`[bg_board]drawbox=x=25:y=65:w=670:h=235:color=#10b981@0.85:t=3[bg_board_framed]`);

      let currentScene = '[bg_board_framed]';

      // Overlay Teacher on left side with speaker-synchronized realistic gestures
      if (useTeacher) {
        complexFilter.push(`[${teacherInputIdx}:v]scale=-1:490,format=rgba[teacher]`);
        complexFilter.push(`${currentScene}[teacher]overlay=x='18+if(${teacherCond}, 4*sin(3.5*PI*t), 0)':y='430+if(${teacherCond}, 7*sin(6*PI*t)+3*cos(12*PI*t), 2*sin(1.2*PI*t))':format=auto[scene_t]`);
        currentScene = '[scene_t]';
      }

      // Overlay Student at desk with speaker-synchronized inquisitive head/body movements
      if (useStudent) {
        complexFilter.push(`[${studentInputIdx}:v]scale=460:-1,format=rgba[student]`);
        complexFilter.push(`${currentScene}[student]overlay=x='230+if(${studentCond}, 5*sin(3.5*PI*t), 0)':y='645+if(${studentCond}, 7*sin(5.5*PI*t)+3*cos(11*PI*t), 2*sin(1.0*PI*t))':format=auto[scene_s]`);
        currentScene = '[scene_s]';
      }

      // Add audio visualizer waveform across bottom desk line
      complexFilter.push(`[a_wave]showwaves=s=720x120:colors=#10b981:mode=cline:rate=30,colorkey=black:0.1:0.1[wave]`);
      complexFilter.push(`${currentScene}[wave]overlay=0:H-h-110[out_wave]`);

      if (withSubtitles && hasAss && relAssPath) {
        complexFilter.push(`[out_wave]ass='${relAssPath}'[out_final]`);
      } else {
        complexFilter.push(`[out_wave]copy[out_final]`);
      }

      cmd
        .complexFilter(complexFilter.join(';'))
        .outputOptions([
          '-map [out_final]',
          '-map [a_out]',
          '-c:v libx264',
          '-preset veryfast',
          '-profile:v main',
          '-level 4.0',
          '-crf 24',
          '-r 30',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-c:a aac',
          '-b:a 128k',
          '-shortest'
        ])
        .save(videoPath)
        .on('end', () => {
          const fileSize = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0;
          console.log(`[Video] Cartoon Classroom Short rendered: ${fileName} (${fileSize} bytes)`);
          if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
          if (tempAudioCreated && fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
          resolve({ fileName, videoPath, videoUrl: `/uploads/video/${fileName}`, fileSize });
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
