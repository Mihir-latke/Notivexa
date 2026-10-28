const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const promoDir = path.join(__dirname, 'assets/promo');
const outputVideo = path.join(__dirname, 'uploads/video/notivexa_promotional_video_1080p.mp4');

// Ensure output dir exists
fs.mkdirSync(path.join(__dirname, 'uploads/video'), { recursive: true });

const scenes = [
  {
    id: 1,
    img: path.join(promoDir, 'scene1.jpg'),
    duration: 6.5,
    frames: 195,
    zoompan: "zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=195:s=1920x1080:fps=30",
    text: "Too many notes. Too many distractions."
  },
  {
    id: 2,
    img: path.join(promoDir, 'scene2.jpg'),
    duration: 5.5,
    frames: 165,
    zoompan: "zoompan=z='1.06':x='(iw-iw/zoom)*(on/165)':y='ih/2-(ih/zoom/2)':d=165:s=1920x1080:fps=30",
    text: "Meet Notivexa — Your knowledge, organized."
  },
  {
    id: 3,
    img: path.join(promoDir, 'scene3.jpg'),
    duration: 6.5,
    frames: 195,
    zoompan: "zoompan=z='min(zoom+0.0006,1.12)':x='iw*0.45-(iw/zoom*0.45)':y='ih*0.5-(ih/zoom*0.5)':d=195:s=1920x1080:fps=30",
    text: "Create. Organize. Remember."
  },
  {
    id: 4,
    img: path.join(promoDir, 'scene4.jpg'),
    duration: 6.5,
    frames: 195,
    zoompan: "zoompan=z='1.05':x='(iw-iw/zoom)*(1-on/195)':y='ih/2-(ih/zoom/2)':d=195:s=1920x1080:fps=30",
    text: "Collaborate seamlessly. Share effortlessly."
  },
  {
    id: 5,
    img: path.join(promoDir, 'scene5.jpg'),
    duration: 7.0,
    frames: 210,
    zoompan: "zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='ih*0.4-(ih/zoom*0.4)':d=210:s=1920x1080:fps=30",
    text: "Work smarter with intelligent tools."
  },
  {
    id: 6,
    img: path.join(promoDir, 'scene6.jpg'),
    duration: 6.0,
    frames: 180,
    zoompan: "zoompan=z='1.05':x='(iw-iw/zoom)*(on/180)':y='ih/2-(ih/zoom/2)':d=180:s=1920x1080:fps=30",
    text: "Your notes. Your workflow. Wherever you are."
  },
  {
    id: 7,
    img: path.join(promoDir, 'scene7.jpg'),
    duration: 7.0,
    frames: 210,
    zoompan: "zoompan=z='max(1.10-0.0005*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=210:s=1920x1080:fps=30",
    text: "NOTIVEXA"
  }
];

// Build Master ASS Subtitle File for Full HD 1080p
const assFile = path.join(promoDir, 'promo_subtitles.ass');
const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: PromoCard,Segoe UI,38,&H00FFFFFF,&H00000000,&H00000000,&HB00F0E1A,-1,0,0,0,100,100,0,0,1,3,2,2,100,100,90,1
Style: BrandTitle,Segoe UI,68,&H00FFFFFF,&H00000000,&H004F46E5,&H80000000,-1,0,0,0,100,100,2,0,1,4,3,8,100,100,280,1
Style: BrandTagline,Segoe UI,36,&H00E0E7FF,&H00000000,&H00000000,&HB00F0E1A,-1,0,0,0,100,100,1,0,1,3,2,8,100,100,380,1
Style: BrandPill,Segoe UI,28,&H0022D3EE,&H00000000,&H00000000,&HB00F0E1A,-1,0,0,0,100,100,1,0,1,2,1,8,100,100,455,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.60,0:00:05.90,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Too many notes. Too many distractions.{\\b0}
Dialogue: 1,0:00:07.10,0:00:11.50,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Meet Notivexa — Your knowledge, organized.{\\b0}
Dialogue: 1,0:00:12.70,0:00:17.90,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Create. Organize. Remember.{\\b0}
Dialogue: 1,0:00:19.10,0:00:24.40,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Collaborate seamlessly. Share effortlessly.{\\b0}
Dialogue: 1,0:00:25.70,0:00:31.40,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Work smarter with intelligent tools.{\\b0}
Dialogue: 1,0:00:32.70,0:00:37.40,PromoCard,,0,0,90,,{\\fad(400,400)\\b1}Your notes. Your workflow. Wherever you are.{\\b0}
Dialogue: 1,0:00:38.60,0:00:44.40,BrandTitle,,0,0,280,,{\\fad(500,500)\\b1}NOTIVEXA{\\b0}
Dialogue: 1,0:00:39.00,0:00:44.40,BrandTagline,,0,0,380,,{\\fad(500,500)\\b1}Organize your knowledge. Empower your ideas.{\\b0}
Dialogue: 1,0:00:39.40,0:00:44.40,BrandPill,,0,0,455,,{\\fad(500,500)\\b1}✦ Create  ✦ Collaborate  ✦ Achieve{\\b0}
`;
fs.writeFileSync(assFile, assContent);

async function renderSceneClip(scene) {
  const outClip = path.join(promoDir, `clip_${scene.id}.mp4`);
  console.log(`Rendering Scene ${scene.id} clip (${scene.duration}s)...`);

  return new Promise((resolve, reject) => {
    let complexFilter = [
      `[0:v]${scene.zoompan},format=yuv420p[zoomed]`
    ];

    if (scene.id <= 6) {
      // Lower third banner card for text readability
      complexFilter.push(`[zoomed]drawbox=x=120:y=910:w=1680:h=90:color=#061c14@0.80:t=fill[b1]`);
      complexFilter.push(`[b1]drawbox=x=120:y=910:w=1680:h=90:color=#10b981@0.75:t=2[out_v]`);
    } else {
      // Center card for final brand showcase
      complexFilter.push(`[zoomed]drawbox=x=260:y=240:w=1400:h=320:color=#061c14@0.85:t=fill[b1]`);
      complexFilter.push(`[b1]drawbox=x=260:y=240:w=1400:h=320:color=#6366f1@0.80:t=3[out_v]`);
    }

    ffmpeg()
      .input(scene.img)
      .inputOptions(['-loop', '1', '-t', String(scene.duration)])
      .complexFilter(complexFilter.join(';'))
      .outputOptions([
        '-map [out_v]',
        '-c:v libx264',
        '-preset fast',
        '-crf 20',
        '-pix_fmt yuv420p',
        '-r 30',
        '-t', String(scene.duration)
      ])
      .save(outClip)
      .on('end', () => {
        console.log(`Scene ${scene.id} rendered: ${outClip} (${fs.statSync(outClip).size} bytes)`);
        resolve(outClip);
      })
      .on('error', reject);
  });
}

async function renderAll() {
  const clips = [];
  for (const scene of scenes) {
    const c = await renderSceneClip(scene);
    clips.push(c);
  }

  // Write concat file
  const concatFile = path.join(promoDir, 'concat_list.txt');
  const fileLines = clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatFile, fileLines);

  const rawConcatVideo = path.join(promoDir, 'video_no_audio.mp4');
  console.log('Concatenating clips...');

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .save(rawConcatVideo)
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Raw concatenated video done (${fs.statSync(rawConcatVideo).size} bytes).`);

  // Final Mux: Video + Master Soundtrack + Subtitles
  console.log('Final Muxing with Master Audio and Subtitles...');
  const relAss = path.relative(process.cwd(), assFile).replace(/\\/g, '/').replace(/:/g, '\\:');
  const masterAudio = path.join(promoDir, 'master_soundtrack.wav');

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(rawConcatVideo)
      .input(masterAudio)
      .complexFilter([
        `[0:v]ass='${relAss}'[v_sub]`
      ])
      .outputOptions([
        '-map [v_sub]',
        '-map 1:a',
        '-c:v libx264',
        '-preset fast',
        '-crf 20',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-t 45'
      ])
      .save(outputVideo)
      .on('end', () => {
        console.log(`PROMO VIDEO COMPLETE! Saved to: ${outputVideo} (${fs.statSync(outputVideo).size} bytes)`);
        resolve();
      })
      .on('error', (err) => {
        console.warn('Mux with ASS failed, falling back without ASS filter:', err.message);
        // Fallback mux without ASS
        ffmpeg()
          .input(rawConcatVideo)
          .input(masterAudio)
          .outputOptions([
            '-map 0:v',
            '-map 1:a',
            '-c:v copy',
            '-c:a aac',
            '-b:a 192k',
            '-movflags +faststart',
            '-t 45'
          ])
          .save(outputVideo)
          .on('end', () => {
            console.log(`PROMO VIDEO COMPLETE (fallback)! Saved to: ${outputVideo}`);
            resolve();
          })
          .on('error', reject);
      });
  });
}

renderAll().catch(err => {
  console.error('Render error:', err);
  process.exit(1);
});

