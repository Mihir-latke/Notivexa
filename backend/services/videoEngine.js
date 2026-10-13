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

  const customBgPath = path.join(__dirname, '../uploads/classroom_bg.png');
  let useBg = fs.existsSync(customBgPath) ? customBgPath : null;

  // Generate ASS subtitles for YouTube Shorts style
  const assName = `subs_${uuidv4()}.ass`;
  const assPath = path.join(OUT_DIR, assName);
  let hasAss = false;
  let relAssPath = '';

  if (script) {
    const narrationMatches = [...script.matchAll(/Narration:\s*(.*)/gi)];
    let fullText = narrationMatches.map(m => m[1].trim()).join(' ').replace(/["']/g, '');
    
    if (!fullText && script.length > 0) fullText = script.replace(/["']/g, '');

    if (fullText) {
      // Split into 2-3 word chunks for dynamic short-style popups
      const words = fullText.split(/\s+/);
      const phrases = [];
      for (let i = 0; i < words.length; i += 3) {
        phrases.push(words.slice(i, i + 3).join(' '));
      }
      
      const totalChars = phrases.join('').length;
      let currentTime = 0;
      
      const formatAssTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const cs = Math.floor((sec % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
      };

      // Bold, yellow, large text with thick outline
      let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Shorts,Arial,90,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,4,5,20,20,400,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

      phrases.forEach(phrase => {
        const phraseDur = (phrase.replace(/\s/g, '').length / Math.max(totalChars, 1)) * durationSeconds;
        const start = currentTime;
        const end = currentTime + phraseDur;
        // Basic pop effect using \t and \fscx
        assContent += `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Shorts,,0,0,0,,{\\fscx80\\fscy80\\t(0,100,\\fscx100\\fscy100)}${phrase}\n`;
        currentTime = end;
      });
      
      fs.writeFileSync(assPath, assContent);
      hasAss = true;
      relAssPath = path.relative(process.cwd(), assPath).replace(/\\/g, '/');
    }
  }

  return new Promise((resolve, reject) => {
    console.log('[Video] Starting FFmpeg render (Animated Shorts Style)...');
    
    let cmd = ffmpeg();
    
    cmd = cmd.input(audioPath); // Input 0: Audio

    if (useBg) {
      cmd = cmd.input(useBg).inputOptions(['-loop', '1']); // Input 1: Image
    } else {
      cmd = cmd.input('color=c=#1c1b29:s=720x1280:d=10').inputFormat('lavfi'); // Input 1: Color
    }

    const totalFrames = Math.ceil(durationSeconds * 30);
    const zoomSpeed = 0.001;

    // Complex filtergraph
    const complexFilter = [];
    
    // 1. Process background (Zoom and crop to 9:16)
    if (useBg) {
      complexFilter.push(`[1:v]zoompan=z='min(zoom+${zoomSpeed},1.5)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',crop='floor((ih*9/16)/2)*2':ih,scale=720:1280,format=yuv420p[bg]`);
    } else {
      complexFilter.push(`[1:v]crop='floor((ih*9/16)/2)*2':ih,scale=720:1280,format=yuv420p[bg]`);
    }

    // 2. Audio Visualizer (Waveform)
    // showwaves gives an alpha channel so it can be overlaid cleanly
    complexFilter.push(`[0:a]showwaves=s=720x250:colors=#00ffcc:mode=cline:rate=30,colorkey=black:0.1:0.1[wave]`);

    // 3. Overlay Waveform on BG
    complexFilter.push(`[bg][wave]overlay=0:H-h-200[out_wave]`);

    // 4. Subtitles
    if (hasAss) {
      complexFilter.push(`[out_wave]ass='${relAssPath}'[out_final]`);
    } else {
      complexFilter.push(`[out_wave]copy[out_final]`);
    }

    cmd
      .complexFilter(complexFilter.join(';'), 'out_final')
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-b:a 128k',
        '-pix_fmt yuv420p',
        '-shortest'
      ])
      .save(videoPath)
      .on('end', () => {
        console.log('[Video] Render complete!', videoPath);
        if (hasAss && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        resolve({ fileName, videoPath, videoUrl: `/uploads/video/${fileName}` });
      })
      .on('error', (err) => {
        console.error('[Video] FFmpeg error:', err);
        if (hasAss && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        reject(err);
      });
  });
}

module.exports = { createVideoFromAudio };
