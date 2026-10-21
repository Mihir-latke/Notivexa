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

  let topicName = 'Quick Concept';
  const points = [];

  lines.forEach(l => {
    if (l.toLowerCase().includes('topic:') || l.toLowerCase().includes('title:')) {
      topicName = l.replace(/.*(?:topic|title):\s*/i, '').replace(/["']/g, '').trim().slice(0, 32);
    }
    if (l.match(/^[-•*\d.]+\s+/)) {
      points.push(l.replace(/^[-•*\d.]+\s*/, '').replace(/\*\*/g, '').replace(/__/g, '').trim().slice(0, 30));
    }
  });

  if (points.length === 0) {
    points.push('1. Core Architecture');
    points.push('2. Process Workflow');
    points.push('3. Exam Success Hack');
  }

  const boardText = `TOPIC: ${topicName.toUpperCase()}\\N\\N• ${points.slice(0, 3).join('\\N• ')}`;

  // Build dialogue phrases for ASS Subtitles
  const dialogueLines = [];
  lines.forEach(l => {
    if (l.startsWith('[') || l.toLowerCase().includes('visual:')) return;
    const cleanL = l.replace(/^(?:teacher|bunty|student|narration):\s*/i, '').trim();
    if (cleanL) {
      const isBunty = l.toLowerCase().startsWith('bunty') || l.toLowerCase().startsWith('student');
      const prefix = isBunty ? 'Bunty: ' : 'Teacher: ';
      // Break into 2-4 word popup chunks
      const words = cleanL.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += 3) {
        dialogueLines.push({
          speaker: isBunty ? 'bunty' : 'teacher',
          text: (i === 0 ? prefix : '') + words.slice(i, i + 3).join(' ')
        });
      }
    }
  });

  if (dialogueLines.length === 0) {
    dialogueLines.push({ speaker: 'teacher', text: 'Teacher: Listen Class!' });
    dialogueLines.push({ speaker: 'bunty', text: 'Bunty: Ready Sir!' });
    dialogueLines.push({ speaker: 'teacher', text: 'Teacher: Master this Topic!' });
  }

  // 4. Build Cartoon Shorts ASS Subtitle File
  const assName = `subs_${uuidv4()}.ass`;
  const assPath = path.join(OUT_DIR, assName);
  let hasAss = false;
  let relAssPath = '';

  try {
    const totalChars = dialogueLines.reduce((acc, d) => acc + d.text.length, 0) || 1;
    let currentTime = 0;

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
Style: TopBanner,Arial,32,&H00000000,&H00000000,&H00FFFFFF,&HFFFFFFFF,-1,0,0,0,100,100,0,0,1,10,4,8,20,20,50,1
Style: BottomBanner,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,-1,0,0,0,100,100,0,0,1,8,3,2,20,20,35,1
Style: BoardText,Arial,24,&H00F0FDF4,&H00000000,&H0014532D,&HB00F291E,-1,0,0,0,100,100,0,0,1,6,3,9,30,40,240,1
Style: TeacherSpeech,Arial,56,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,5,25,25,410,1
Style: BuntySpeech,Arial,56,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,5,25,25,410,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},TopBanner,,0,0,0,,{\\b1}Ek aisa teacher hum bhi deserve krte hai 😅😜{\\b0}
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},BottomBanner,,0,0,0,,{\\b1}Wait for End 🤣📚 | Like & Share 🔥{\\b0}
Dialogue: 1,0:00:00.00,${formatAssTime(targetDuration)},BoardText,,0,0,0,,{\\b1}${boardText}{\\b0}
`;

    dialogueLines.forEach(item => {
      const phraseDur = Math.max(1.0, (item.text.length / totalChars) * targetDuration);
      const start = currentTime;
      const end = Math.min(currentTime + phraseDur, targetDuration);
      const styleName = item.speaker === 'bunty' ? 'BuntySpeech' : 'TeacherSpeech';
      assContent += `Dialogue: 2,${formatAssTime(start)},${formatAssTime(end)},${styleName},,0,0,0,,{\\fscx85\\fscy85\\t(0,80,\\fscx100\\fscy100)}${item.text}\n`;
      currentTime = end;
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
        cmd = cmd.input(useBg).inputOptions(['-loop', '1', '-t', String(targetDuration)]);
      } else {
        cmd = cmd.input('color=c=#0f172a:s=720x1280:r=30').inputFormat('lavfi').inputOptions(['-t', String(targetDuration)]);
      }

      // Input 2: Cartoon Teacher
      let teacherInputIdx = -1;
      if (useTeacher) {
        teacherInputIdx = nextInputIdx++;
        cmd = cmd.input(useTeacher).inputOptions(['-loop', '1', '-t', String(targetDuration)]);
      }

      // Input 3: Cartoon Student
      let studentInputIdx = -1;
      if (useStudent) {
        studentInputIdx = nextInputIdx++;
        cmd = cmd.input(useStudent).inputOptions(['-loop', '1', '-t', String(targetDuration)]);
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

      let currentScene = '[bg]';

      // Overlay Teacher on left side of classroom with animated idle breathing motion
      if (useTeacher) {
        complexFilter.push(`[${teacherInputIdx}:v]scale=-1:490,format=rgba[teacher]`);
        complexFilter.push(`${currentScene}[teacher]overlay=x=15:y='440+4*sin(4*PI*t)':format=auto[scene_t]`);
        currentScene = '[scene_t]';
      }

      // Overlay Student at desk in front right foreground with subtle motion
      if (useStudent) {
        complexFilter.push(`[${studentInputIdx}:v]scale=460:-1,format=rgba[student]`);
        complexFilter.push(`${currentScene}[student]overlay=x=230:y='650+3*cos(3*PI*t)':format=auto[scene_s]`);
        currentScene = '[scene_s]';
      }

      // Add audio visualizer waveform across bottom desk line
      complexFilter.push(`[a_wave]showwaves=s=720x130:colors=#06b6d4:mode=cline:rate=30,colorkey=black:0.1:0.1[wave]`);
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
          '-preset ultrafast',
          '-tune fastdecode',
          '-crf 26',
          '-c:a aac',
          '-b:a 128k',
          '-pix_fmt yuv420p',
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
