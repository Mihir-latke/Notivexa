/**
 * handwrittenVideoService.js
 * Generates Animated Handwritten Educational Video Scenes with realistic progressive
 * writing, pen tip tracking, notebook grid/graph paper layout, and dynamic accents.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { getFfmpegPath } = require('./mediaProbe');

ffmpeg.setFfmpegPath(getFfmpegPath());

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HAND_PEN_IMAGE = path.join(__dirname, '../assets/handwriting/hand_pen.png');

// Escape text for FFmpeg drawtext
function escapeFfmpegText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/,/g, '\\,')
    .replace(/%/g, '％')
    .replace(/\r?\n/g, ' ')
    .trim();
}

/**
 * Determine dimensions based on aspect ratio
 */
function getCanvasDimensions(aspectRatio = '9:16') {
  if (aspectRatio === '16:9') return { width: 1280, height: 720 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  // Default: 9:16 vertical shorts/reels
  return { width: 720, height: 1280 };
}

/**
 * Paper background color and grid configs
 */
function getPaperTheme(style = 'graph_paper') {
  switch (style) {
    case 'ruled':
      return {
        bg: '#FFFDF7',
        gridColor: '#CBD5E1@0.5',
        gridHeight: 38,
        marginColor: '#FCA5A5@0.85',
        headerBg: '#F8F5EE',
        headerBorder: '#E2E8F0',
        headerText: '#0F172A',
        inkColor: '#1D4ED8',
        accentColor: '#DC2626',
        isChalk: false
      };
    case 'chalkboard':
      return {
        bg: '#0D1F18',
        gridColor: '#1A3328@0.4',
        gridHeight: 40,
        marginColor: '#2D4E3E@0.7',
        headerBg: '#091712',
        headerBorder: '#2D4E3E',
        headerText: '#FEFFAF',
        inkColor: '#F8FAFC',
        accentColor: '#F59E0B',
        isChalk: true
      };
    case 'whiteboard':
      return {
        bg: '#FFFFFF',
        gridColor: '#F1F5F9@0.4',
        gridHeight: 45,
        marginColor: '#E2E8F0@0.6',
        headerBg: '#F8FAFC',
        headerBorder: '#E2E8F0',
        headerText: '#0F172A',
        inkColor: '#1E40AF',
        accentColor: '#EF4444',
        isChalk: false
      };
    case 'graph_paper':
    default:
      return {
        bg: '#FAF9F5',
        gridColor: '#E2E8F0@0.55',
        gridHeight: 36,
        marginColor: '#FCA5A5@0.85',
        headerBg: '#F1EFEA',
        headerBorder: '#CBD5E1',
        headerText: '#0F172A',
        inkColor: '#1D4ED8',
        accentColor: '#DC2626',
        isChalk: false
      };
  }
}

/**
 * Render a single animated handwritten educational scene
 */
async function renderHandwrittenScene({
  scene,
  sceneIndex = 0,
  totalScenes = 1,
  duration = 7,
  audioPath,
  title = 'Educational Topic',
  subject = 'General Studies',
  language = 'English',
  aspectRatio = '9:16',
  paperStyle = 'graph_paper',
  inkColor = null,
  outputPath
}) {
  const { width: W, height: H } = getCanvasDimensions(aspectRatio);
  const theme = getPaperTheme(paperStyle);
  const effectiveInk = inkColor || theme.inkColor;
  const safeDur = Math.max(Number(duration) || 7, 3);

  // Check for Devanagari (Marathi, Hindi)
  const isDevanagari = /[\u0900-\u097F]/.test(title + (scene.title || '') + (scene.narration || '') + language);
  const defaultFont = isDevanagari
    ? (process.platform === 'win32' ? 'Nirmala UI' : 'Noto Sans Devanagari')
    : (process.platform === 'win32' ? 'Comic Sans MS' : 'Arial');

  // Extract handwritten lines from scene
  let lines = [];
  if (Array.isArray(scene.handwrittenLines) && scene.handwrittenLines.length > 0) {
    lines = scene.handwrittenLines.map(l => String(l).trim()).filter(Boolean);
  } else if (Array.isArray(scene.boardPoints) && scene.boardPoints.length > 0) {
    lines = scene.boardPoints.map(p => String(p).trim()).filter(Boolean);
  } else if (scene.mainSubject || scene.sourceTopic) {
    lines = [
      `• ${scene.learningObjective || scene.mainSubject || 'Core Concept'}`,
      `• ${(scene.narration || '').slice(0, 50)}...`
    ];
  } else {
    lines = ['• Concept Definition', '• Core Mechanism', '• Key Application'];
  }
  lines = lines.slice(0, 3); // Max 3 body lines per scene for clean academic legibility

  const sceneHeading = scene.title || scene.heading || `Scene ${sceneIndex + 1}: ${scene.sourceTopic || title}`;
  const formula = scene.diagram?.formula || scene.formula || null;
  const hasUnderline = true; // Always draw a red emphasis underline under scene heading

  // Calculate timeline slices
  // Total available writing time = safeDur - 1.2s (leaves 1.2s at end to view completed page)
  const writeWindow = Math.max(safeDur - 1.4, 2.5);

  // Time allocations:
  // 1. Scene setup: 0.0 -> 0.3s
  // 2. Heading writing: 0.3 -> t_hEnd
  // 3. Heading underline: t_hEnd + 0.1 -> t_uEnd
  // 4. Lines writing: t_uEnd + 0.2 -> linesEnd
  // 5. Formula / Highlight box: linesEnd + 0.1 -> formulaEnd
  // 6. Pen glides away: formulaEnd -> safeDur

  const hDur = Math.min(1.2, writeWindow * 0.25);
  const t_hStart = 0.3;
  const t_hEnd = t_hStart + hDur;

  const uDur = 0.4;
  const t_uStart = t_hEnd + 0.1;
  const t_uEnd = t_uStart + uDur;

  const remainingTime = Math.max(0.8, writeWindow - (t_uEnd - t_hStart));
  const lineSlots = lines.length + (formula ? 1 : 0);
  const timePerItem = Math.max(0.6, remainingTime / lineSlots);

  const lineTimings = [];
  let currTime = t_uEnd + 0.2;

  lines.forEach((lineText, idx) => {
    const start = currTime;
    const dur = timePerItem * 0.9;
    const end = start + dur;
    lineTimings.push({ text: lineText, start, end, dur, idx });
    currTime = end + 0.15;
  });

  let formulaTiming = null;
  if (formula) {
    formulaTiming = {
      text: formula,
      start: currTime,
      end: currTime + timePerItem * 0.85,
      dur: timePerItem * 0.85
    };
    currTime = formulaTiming.end + 0.15;
  }

  const penRetractTime = currTime;

  // Geometry
  const marginX = aspectRatio === '9:16' ? 65 : 75;
  const contentStartX = marginX + 25;
  const headerY = aspectRatio === '9:16' ? 160 : 120;
  const lineStartY = headerY + (aspectRatio === '9:16' ? 95 : 75);
  const lineSpacing = aspectRatio === '9:16' ? 85 : 65;

  const maxTextW = W - contentStartX - 40;
  const headerFontSize = aspectRatio === '9:16' ? 34 : 32;
  const bodyFontSize = aspectRatio === '9:16' ? 28 : 26;

  // Hand scaling
  // Original hand_pen.png is 1200x896 with nib at (328, 664)
  const handH = aspectRatio === '9:16' ? 440 : 400;
  const nibOffX = Math.round(328 * (handH / 896)); // ~161
  const nibOffY = Math.round(664 * (handH / 896)); // ~326

  const hasHandAsset = fs.existsSync(HAND_PEN_IMAGE);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // Input 0: Scene Audio
    cmd = cmd.input(audioPath);

    // Input 1: Hand Pen Image (if present)
    if (hasHandAsset) {
      cmd = cmd.input(HAND_PEN_IMAGE);
    }

    const filtergraph = [
      // Base audio split for waveform & master
      `[0:a]asplit=2[a_wave][a_master]`,

      // 1. Notebook Paper Canvas
      `color=c=${theme.bg}:s=${W}x${H}:d=${safeDur}:r=25[paper_bg]`,

      // 2. Top Header Banner
      `[paper_bg]drawbox=x=0:y=0:w=${W}:h=${aspectRatio === '9:16' ? 85 : 65}:color=${theme.headerBg}:t=fill[top_banner]`,
      `[top_banner]drawbox=x=0:y=${aspectRatio === '9:16' ? 83 : 63}:w=${W}:h=2:color=${theme.headerBorder}:t=fill[top_rule]`,

      // 3. Red Student Margin Line
      `[top_rule]drawbox=x=${marginX}:y=${aspectRatio === '9:16' ? 85 : 65}:w=2:h=${H}:color=${theme.marginColor}:t=fill[paper_margin]`,

      // 4. Notebook Ruled/Grid Lines
      `[paper_margin]drawgrid=width=${W}:height=${theme.gridHeight}:color=${theme.gridColor}:thickness=1[paper]`
    ];

    let currentStream = 'paper';

    // 5. Draw Header
    const escHeader = escapeFfmpegText(sceneHeading);
    const headerStream = 'h_txt';
    filtergraph.push(`[${currentStream}]drawtext=text='${escHeader}':font='${defaultFont}':fontsize=${headerFontSize}:fontcolor=${theme.headerText}:x=${contentStartX}:y=${headerY}[${headerStream}]`);

    // Progressive cover box for header
    const hCoverStream = 'h_cov';
    filtergraph.push(`[${headerStream}]drawbox=x='if(lt(t,${t_hStart.toFixed(2)}),${contentStartX},if(gt(t,${t_hEnd.toFixed(2)}),${contentStartX + maxTextW},${contentStartX}+${maxTextW}*(t-${t_hStart.toFixed(2)})/${hDur.toFixed(2)}))':y=${headerY - 5}:w='if(lt(t,${t_hStart.toFixed(2)}),${maxTextW},if(gt(t,${t_hEnd.toFixed(2)}),0,max(0,${maxTextW}-${maxTextW}*(t-${t_hStart.toFixed(2)})/${hDur.toFixed(2)})))':h=${headerFontSize + 12}:color=${theme.bg}:t=fill[${hCoverStream}]`);
    currentStream = hCoverStream;

    // 6. Header Red Underline
    if (hasUnderline) {
      const uStream = 'h_und';
      const uY = headerY + headerFontSize + 6;
      const uW = Math.min(maxTextW, Math.max(260, escHeader.length * (headerFontSize * 0.55)));
      filtergraph.push(`[${currentStream}]drawbox=x=${contentStartX}:y=${uY}:w='if(lt(t,${t_uStart.toFixed(2)}),0,if(gt(t,${t_uEnd.toFixed(2)}),${uW.toFixed(0)},${uW.toFixed(0)}*(t-${t_uStart.toFixed(2)})/${uDur.toFixed(2)}))':h=3:color=${theme.accentColor}:t=fill[${uStream}]`);
      currentStream = uStream;
    }

    // 7. Draw Each Body Line
    lineTimings.forEach((lt, i) => {
      const lineY = lineStartY + (i * lineSpacing);
      const escLine = escapeFfmpegText(lt.text);
      const txtStream = `l${i}_txt`;
      const covStream = `l${i}_cov`;
      const lineW = Math.min(maxTextW, Math.max(240, escLine.length * (bodyFontSize * 0.52)));

      filtergraph.push(`[${currentStream}]drawtext=text='${escLine}':font='${defaultFont}':fontsize=${bodyFontSize}:fontcolor=${effectiveInk}:x=${contentStartX}:y=${lineY}[${txtStream}]`);
      filtergraph.push(`[${txtStream}]drawbox=x='if(lt(t,${lt.start.toFixed(2)}),${contentStartX},if(gt(t,${lt.end.toFixed(2)}),${contentStartX + lineW},${contentStartX}+${lineW}*(t-${lt.start.toFixed(2)})/${lt.dur.toFixed(2)}))':y=${lineY - 4}:w='if(lt(t,${lt.start.toFixed(2)}),${lineW},if(gt(t,${lt.end.toFixed(2)}),0,max(0,${lineW}-${lineW}*(t-${lt.start.toFixed(2)})/${lt.dur.toFixed(2)})))':h=${bodyFontSize + 10}:color=${theme.bg}:t=fill[${covStream}]`);
      currentStream = covStream;
    });

    // 8. Draw Formula / Key Concept Box (if present)
    if (formulaTiming) {
      const fY = lineStartY + (lineTimings.length * lineSpacing) + 10;
      const escFormula = escapeFfmpegText(formulaTiming.text);
      const fBoxStream = 'f_box';
      const fTxtStream = 'f_txt';
      const fW = Math.min(maxTextW, Math.max(260, escFormula.length * (bodyFontSize * 0.58) + 30));

      // Animated Amber/Red formula border
      filtergraph.push(`[${currentStream}]drawbox=x=${contentStartX}:y=${fY}:w='if(lt(t,${formulaTiming.start.toFixed(2)}),0,if(gt(t,${formulaTiming.end.toFixed(2)}),${fW.toFixed(0)},${fW.toFixed(0)}*(t-${formulaTiming.start.toFixed(2)})/${formulaTiming.dur.toFixed(2)}))':h=52:color=${theme.accentColor}:t=2[${fBoxStream}]`);
      filtergraph.push(`[${fBoxStream}]drawtext=text='${escFormula}':font='${defaultFont}':fontsize=${bodyFontSize}:fontcolor=${theme.headerText}:x=${contentStartX + 15}:y=${fY + 12}:enable='gte(t,${(formulaTiming.start + 0.1).toFixed(2)})'[${fTxtStream}]`);
      currentStream = fTxtStream;
    }

    // 9. Overlay Animated Hand holding Pen
    if (hasHandAsset) {
      const handStream = 'hand_scaled';
      filtergraph.push(`[1:v]scale=-1:${handH},format=rgba[${handStream}]`);

      // Build piecewise X(t) and Y(t) expression
      // Stages:
      // 1. Heading: t_hStart .. t_hEnd
      // 2. Underline: t_uStart .. t_uEnd
      // 3. Lines 0..n
      // 4. Formula
      // 5. Retract
      let xExpr = '';
      let yExpr = '';

      // Start with retract
      xExpr = `(${W} - ${nibOffX} + (t - ${penRetractTime.toFixed(2)}) * 350)`;
      yExpr = `(${H} - ${nibOffY} + (t - ${penRetractTime.toFixed(2)}) * 350)`;

      // Formula
      if (formulaTiming) {
        const fY = lineStartY + (lineTimings.length * lineSpacing) + 30;
        const fW = Math.min(maxTextW, 300);
        xExpr = `if(between(t,${formulaTiming.start.toFixed(2)},${formulaTiming.end.toFixed(2)}), (${contentStartX}+${fW}*(t-${formulaTiming.start.toFixed(2)})/${formulaTiming.dur.toFixed(2)})-${nibOffX}, ${xExpr})`;
        yExpr = `if(between(t,${formulaTiming.start.toFixed(2)},${formulaTiming.end.toFixed(2)}), ${fY}-${nibOffY}, ${yExpr})`;
      }

      // Lines in reverse order
      for (let i = lineTimings.length - 1; i >= 0; i--) {
        const lt = lineTimings[i];
        const lineY = lineStartY + (i * lineSpacing) + (bodyFontSize * 0.7);
        const lineW = Math.min(maxTextW, Math.max(240, lt.text.length * (bodyFontSize * 0.52)));

        xExpr = `if(between(t,${lt.start.toFixed(2)},${lt.end.toFixed(2)}), (${contentStartX}+${lineW}*(t-${lt.start.toFixed(2)})/${lt.dur.toFixed(2)})-${nibOffX}, ${xExpr})`;
        yExpr = `if(between(t,${lt.start.toFixed(2)},${lt.end.toFixed(2)}), (${lineY.toFixed(0)}+sin(t*25)*2.5)-${nibOffY}, ${yExpr})`;
      }

      // Underline
      if (hasUnderline) {
        const uY = headerY + headerFontSize + 6;
        const uW = Math.min(maxTextW, Math.max(260, escHeader.length * (headerFontSize * 0.55)));
        xExpr = `if(between(t,${t_uStart.toFixed(2)},${t_uEnd.toFixed(2)}), (${contentStartX}+${uW.toFixed(0)}*(t-${t_uStart.toFixed(2)})/${uDur.toFixed(2)})-${nibOffX}, ${xExpr})`;
        yExpr = `if(between(t,${t_uStart.toFixed(2)},${t_uEnd.toFixed(2)}), ${uY}-${nibOffY}, ${xExpr ? xExpr : '0'})`;
      }

      // Heading
      xExpr = `if(between(t,${t_hStart.toFixed(2)},${t_hEnd.toFixed(2)}), (${contentStartX}+${maxTextW}*(t-${t_hStart.toFixed(2)})/${hDur.toFixed(2)})-${nibOffX}, ${xExpr})`;
      yExpr = `if(between(t,${t_hStart.toFixed(2)},${t_hEnd.toFixed(2)}), (${headerY + headerFontSize * 0.7}+sin(t*25)*2.5)-${nibOffY}, ${yExpr})`;

      // Only show hand from t_hStart onwards
      filtergraph.push(`[${currentStream}][${handStream}]overlay=x='${xExpr}':y='${yExpr}':enable='gte(t,${t_hStart.toFixed(2)})'[scene_hand]`);
      currentStream = 'scene_hand';
    }

    // 10. Subtle Audio Waveform in Bottom Corner
    filtergraph.push(`[a_wave]showwaves=s=${W - 60}x24:colors=${theme.inkColor.replace('#', '')}:mode=line:rate=25,colorkey=black:0.1:0.1[wave]`);
    filtergraph.push(`[${currentStream}][wave]overlay=30:${H - 45}:shortest=1[scene_wave]`);
    currentStream = 'scene_wave';

    // Output formatting
    filtergraph.push(`[${currentStream}]format=yuv420p[out_v]`);

    cmd
      .complexFilter(filtergraph.join(';'))
      .outputOptions([
        '-map [out_v]',
        '-map [a_master]',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 23',
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
          mode: 'handwritten'
        });
      })
      .on('error', (err) => {
        console.error(`[HandwrittenService] Scene ${sceneIndex} render error:`, err.message);
        reject(err);
      });
  });
}

module.exports = {
  renderHandwrittenScene,
  getCanvasDimensions,
  getPaperTheme
};
