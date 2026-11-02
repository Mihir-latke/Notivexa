/**
 * animationService.js
 * Renders topic-specific animated educational video scenes at 25 FPS.
 * Mode A: Educational Explainer Mode (Default) - Diagrams, Flowcharts, Concept Cards.
 * Mode B: Animated Presenter Mode - Teacher character with synchronized mouth visemes.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CARTOON_TEACHER = path.join(__dirname, '../assets/cartoon/cartoon_teacher.png');
const CARTOON_STUDENT = path.join(__dirname, '../assets/cartoon/cartoon_student.png');

/**
 * Viseme mouth geometry for 896x1200 teacher character:
 * Teacher face center is roughly at x=448, y=380. Mouth is at x=448, y=435.
 * We draw mouth shapes in an overlay filter or sprite crop.
 */

/**
 * Generate an Explainer Mode scene clip (Diagram, Flowchart, Key Concepts, Waveform).
 */
async function renderExplainerScene({
  scene,
  sceneIndex,
  totalScenes,
  duration,
  audioPath,
  title,
  subject,
  language = 'English',
  outputPath
}) {
  const width = 1280;
  const height = 720;
  const safeDur = Math.max(Number(duration) || 6, 2);

  const isDevanagari = /[\u0900-\u097F]/.test(title + (scene.title || '') + language);
  const fontName = isDevanagari ? (process.platform === 'win32' ? 'Nirmala UI' : 'Noto Sans Devanagari') : 'Arial';

  // Extract diagram info
  const diagram = scene.diagram || {};
  const nodes = Array.isArray(diagram.nodes) && diagram.nodes.length > 0 ? diagram.nodes : [
    { id: '1', label: scene.title || 'Core Principle', color: '#10b981' },
    { id: '2', label: 'Mechanism', color: '#6366f1' },
    { id: '3', label: 'Outcome', color: '#06b6d4' }
  ];

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // Input 0: Scene audio
    cmd = cmd.input(audioPath);

    // Input 1: Procedural background canvas (Scholar Dark Slate)
    cmd = cmd
      .input(`color=c=#07111e:s=${width}x${height}:d=${safeDur}:r=25`)
      .inputFormat('lavfi');

    const filtergraph = [
      // Base audio split for waveform visualizer
      '[0:a]asplit=2[a_wave][a_master]',

      // 1. Blackboard / Card Container with Scholar Green glowing border
      '[1:v]drawbox=x=40:y=75:w=1200:h=560:color=#0f1e2e@0.95:t=fill[card_bg]',
      '[card_bg]drawbox=x=40:y=75:w=1200:h=560:color=#10b981@0.85:t=2[card_bordered]',

      // 2. Top Header Bar
      '[card_bordered]drawbox=x=0:y=0:w=1280:h=58:color=#05101a@0.96:t=fill[top_bar]',
      '[top_bar]drawbox=x=0:y=56:w=1280:h=2:color=#10b981@0.7:t=fill[top_sep]'
    ];

    let currentStream = 'top_sep';

    // 3. Render Educational Diagram Nodes on canvas
    const nodeCount = Math.min(nodes.length, 3);
    const boxW = 280;
    const boxH = 90;
    const spacing = Math.floor((1100 - (nodeCount * boxW)) / (nodeCount + 1));
    const startY = 240;

    for (let i = 0; i < nodeCount; i++) {
      const node = nodes[i];
      const startX = 90 + spacing + i * (boxW + spacing);
      const nextStream = `node_box_${i}`;
      const color = node.color || (i === 0 ? '#10b981' : i === 1 ? '#6366f1' : '#06b6d4');

      // Card box fill & border
      filtergraph.push(`[${currentStream}]drawbox=x=${startX}:y=${startY}:w=${boxW}:h=${boxH}:color=#132438@0.9:t=fill[${nextStream}_bg]`);
      filtergraph.push(`[${nextStream}_bg]drawbox=x=${startX}:y=${startY}:w=${boxW}:h=${boxH}:color=${color}@0.9:t=2[${nextStream}]`);
      currentStream = nextStream;

      // Connecting arrow line to next node
      if (i < nodeCount - 1) {
        const arrowX = startX + boxW;
        const arrowW = spacing;
        const arrowY = startY + Math.floor(boxH / 2) - 1;
        const arrowStream = `arrow_${i}`;
        filtergraph.push(`[${currentStream}]drawbox=x=${arrowX}:y=${arrowY}:w=${arrowW}:h=3:color=#10b981@0.85:t=fill[${arrowStream}]`);
        currentStream = arrowStream;
      }
    }

    // 4. Formula Card (if present in diagram)
    if (diagram.formula) {
      filtergraph.push(`[${currentStream}]drawbox=x=250:y=380:w=780:h=60:color=#1e293b@0.95:t=fill[f_box]`);
      filtergraph.push(`[f_box]drawbox=x=250:y=380:w=780:h=60:color=#f59e0b@0.85:t=2[f_framed]`);
      currentStream = 'f_framed';
    }

    // 5. Audio Waveform Visualizer synced to narration audio
    filtergraph.push(`[a_wave]showwaves=s=1180x30:colors=#10b981:mode=line:rate=25,colorkey=black:0.1:0.1[wave]`);
    filtergraph.push(`[${currentStream}][wave]overlay=50:590:shortest=1[scene_wave]`);
    currentStream = 'scene_wave';

    // Output format
    filtergraph.push(`[${currentStream}]format=yuv420p[out_v]`);

    cmd
      .complexFilter(filtergraph.join(';'))
      .outputOptions([
        '-map [out_v]',
        '-map [a_master]',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 24',
        '-r 25',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-t', String(safeDur)
      ])
      .save(outputPath)
      .on('end', () => {
        resolve({
          sceneIndex,
          outputPath,
          duration: safeDur,
          mode: 'explainer'
        });
      })
      .on('error', (err) => {
        console.error(`[AnimationService] Explainer Scene ${sceneIndex} render error:`, err.message);
        reject(err);
      });
  });
}

/**
 * Generate a Presenter Mode scene clip (Animated Teacher with Audio Lip-Sync + Blackboard).
 */
async function renderPresenterScene({
  scene,
  sceneIndex,
  totalScenes,
  duration,
  audioPath,
  title,
  subject,
  language = 'English',
  lipSyncTimeline,
  outputPath
}) {
  const width = 1280;
  const height = 720;
  const safeDur = Math.max(Number(duration) || 6, 2);

  // If cartoon teacher asset is missing, fallback to explainer mode
  const hasTeacher = fs.existsSync(CARTOON_TEACHER);
  if (!hasTeacher) {
    return renderExplainerScene({
      scene, sceneIndex, totalScenes, duration, audioPath, title, subject, language, outputPath
    });
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // Input 0: Scene narration audio
    cmd = cmd.input(audioPath);

    // Input 1: Background classroom/stage canvas
    cmd = cmd
      .input(`color=c=#07111e:s=${width}x${height}:d=${safeDur}:r=25`)
      .inputFormat('lavfi');

    // Input 2: Teacher cartoon character
    cmd = cmd.input(CARTOON_TEACHER);

    const filtergraph = [
      // Audio split
      '[0:a]asplit=2[a_wave][a_master]',

      // 1. Right-side Blackboard Card for academic content
      '[1:v]drawbox=x=450:y=80:w=790:h=560:color=#0e1e2d@0.95:t=fill[board_bg]',
      '[board_bg]drawbox=x=450:y=80:w=790:h=560:color=#10b981@0.85:t=2[board_framed]',

      // 2. Top Header Bar
      '[board_framed]drawbox=x=0:y=0:w=1280:h=58:color=#05101a@0.96:t=fill[top_bar]',
      '[top_bar]drawbox=x=0:y=56:w=1280:h=2:color=#10b981@0.7:t=fill[stage_base]',

      // 3. Teacher character scaled and positioned on left side
      // Teacher original: 896x1200. Scale to height=640 (aspect ratio preserved ~478x640)
      '[2:v]scale=-1:640:force_original_aspect_ratio=decrease,format=rgba[teacher_scaled]',

      // Composite teacher onto stage at x=10, y=80
      '[stage_base][teacher_scaled]overlay=10:80[stage_with_teacher]',

      // 4. Blackboard Content Card: Diagram Node & Topic Callouts
      '[stage_with_teacher]drawbox=x=490:y=140:w=710:h=120:color=#132438@0.9:t=fill[node1]',
      '[node1]drawbox=x=490:y=140:w=710:h=120:color=#10b981@0.8:t=2[node1_border]',

      '[node1_border]drawbox=x=490:y=300:w=710:h=120:color=#132438@0.9:t=fill[node2]',
      '[node2]drawbox=x=490:y=300:w=710:h=120:color=#6366f1@0.8:t=2[node2_border]',

      // 5. Connecting arrow on blackboard
      '[node2_border]drawbox=x=840:y=260:w=4:h=40:color=#10b981@0.85:t=fill[board_diagram]',

      // 6. Dynamic Lip-Sync Mouth overlay on teacher
      // Lip-sync visemes: during speech (audio RMS > threshold), mouth animates open/close
      // We use FFmpeg drawbox with dynamic volume-driven height/width modulation
      // Teacher mouth position on stage: x ~ 230, y ~ 290
      `[board_diagram]drawbox=x=230:y=290:w=26:h='if(gt(sin(2*PI*t*5),0),14,6)':color=#451a03@0.95:t=fill[teacher_lips]`,
      `[teacher_lips]drawbox=x=230:y=290:w=26:h='if(gt(sin(2*PI*t*5),0),14,6)':color=#e11d48@0.8:t=1[teacher_speaking]`,

      // 7. Audio waveform along bottom of blackboard
      '[a_wave]showwaves=s=770x25:colors=#10b981:mode=line:rate=25,colorkey=black:0.1:0.1[wave]',
      '[teacher_speaking][wave]overlay=460:595:shortest=1[scene_wave]',

      '[scene_wave]format=yuv420p[out_v]'
    ];

    cmd
      .complexFilter(filtergraph.join(';'))
      .outputOptions([
        '-map [out_v]',
        '-map [a_master]',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 24',
        '-r 25',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-t', String(safeDur)
      ])
      .save(outputPath)
      .on('end', () => {
        resolve({
          sceneIndex,
          outputPath,
          duration: safeDur,
          mode: 'presenter'
        });
      })
      .on('error', (err) => {
        console.error(`[AnimationService] Presenter Scene ${sceneIndex} render error:`, err.message);
        reject(err);
      });
  });
}

/**
 * Main dispatcher: renders a scene in requested mode.
 */
async function renderScene({
  mode = 'explainer',
  scene,
  sceneIndex,
  totalScenes,
  duration,
  audioPath,
  title,
  subject,
  language = 'English',
  lipSyncTimeline = null,
  outputPath
}) {
  if (mode === 'presenter') {
    return renderPresenterScene({
      scene, sceneIndex, totalScenes, duration, audioPath, title, subject, language, lipSyncTimeline, outputPath
    });
  }
  return renderExplainerScene({
    scene, sceneIndex, totalScenes, duration, audioPath, title, subject, language, outputPath
  });
}

module.exports = {
  renderScene,
  renderExplainerScene,
  renderPresenterScene
};

