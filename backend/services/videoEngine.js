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

  // 1. Cap duration to a snappy 15s to 75s (ideal educational Shorts format)
  const targetDuration = Math.min(Math.max(Number(durationSeconds) || 45, 15), 75);

  // 2. Validate audio path; if missing or empty, create a temporary silent audio track
  let finalAudioPath = audioPath;
  let tempAudioCreated = false;
  if (!finalAudioPath || !fs.existsSync(finalAudioPath) || fs.statSync(finalAudioPath).size === 0) {
    console.warn('[Video] Provided audio file missing or empty. Generating fallback audio.');
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
    } catch(e) {
      console.warn('[Video] Fallback audio generation warning:', e.message);
    }
  }

  const customBgPath = path.join(__dirname, '../uploads/classroom_bg.png');
  const useBg = fs.existsSync(customBgPath) ? customBgPath : null;

  // 3. Build dynamic Short-style popup subtitles (ASS)
  const assName = `subs_${uuidv4()}.ass`;
  const assPath = path.join(OUT_DIR, assName);
  let hasAss = false;
  let relAssPath = '';

  try {
    const narrationMatches = [...(script || '').matchAll(/Narration:\s*(.*)/gi)];
    let fullText = narrationMatches.map(m => m[1].trim()).join(' ').replace(/["']/g, '');
    if (!fullText && script) {
      fullText = script.replace(/\[[^\]]*\]/g, '').replace(/Visual:[^\n]*/gi, '').replace(/["']/g, '').trim();
    }

    if (fullText) {
      // Split into 2-3 word energetic popup chunks
      const words = fullText.split(/\s+/).filter(Boolean);
      const phrases = [];
      for (let i = 0; i < words.length; i += 3) {
        phrases.push(words.slice(i, i + 3).join(' '));
      }

      if (phrases.length > 0) {
        const totalChars = phrases.join('').length || 1;
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
Style: Shorts,Arial,64,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,5,30,30,360,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        phrases.forEach(phrase => {
          const phraseDur = (phrase.replace(/\s/g, '').length / totalChars) * targetDuration;
          const start = currentTime;
          const end = Math.min(currentTime + phraseDur, targetDuration);
          assContent += `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Shorts,,0,0,0,,{\\fscx85\\fscy85\\t(0,80,\\fscx100\\fscy100)}${phrase}\n`;
          currentTime = end;
        });

        fs.writeFileSync(assPath, assContent);
        hasAss = true;
        // Escape path for ffmpeg filter parser (especially on Windows)
        relAssPath = path.relative(process.cwd(), assPath).replace(/\\/g, '/').replace(/:/g, '\\:');
      }
    }
  } catch(e) {
    console.warn('[Video] Subtitles generation warning:', e.message);
    hasAss = false;
  }

  // 4. Render Video using FFmpeg
  const renderJob = (withSubtitles = true) => {
    return new Promise((resolve, reject) => {
      console.log(`[Video] Rendering Shorts MP4 (${targetDuration}s, subs=${withSubtitles && hasAss})...`);
      let cmd = ffmpeg();

      // Input 0: Audio track
      cmd = cmd.input(finalAudioPath);

      // Input 1: Visual background
      if (useBg) {
        cmd = cmd.input(useBg).inputOptions(['-loop', '1', '-t', String(targetDuration)]);
      } else {
        cmd = cmd.input('color=c=#0f172a:s=720x1280:r=30').inputFormat('lavfi').inputOptions(['-t', String(targetDuration)]);
      }

      // Filtergraph:
      // a) Split audio into visual waveform generator and direct audio output stream
      // b) Generate waveform overlay
      // c) Apply subtitles
      const complexFilter = [
        '[0:a]asplit=2[a_wave][a_out]',
        '[a_wave]showwaves=s=720x220:colors=#06b6d4:mode=cline:rate=30,colorkey=black:0.1:0.1[wave]'
      ];

      if (useBg) {
        complexFilter.push(`[1:v]crop='floor((ih*9/16)/2)*2':ih,scale=720:1280,format=yuv420p[bg]`);
        complexFilter.push(`[bg][wave]overlay=0:H-h-160[out_wave]`);
      } else {
        complexFilter.push(`[1:v][wave]overlay=0:H-h-160[out_wave]`);
      }

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
          console.log(`[Video] Render complete: ${fileName} (${fileSize} bytes)`);
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
