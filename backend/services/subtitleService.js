/**
 * subtitleService.js
 * Generates timed, synchronized ASS subtitles with keyword highlighting and Devanagari font safety.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OUT_DIR = path.join(__dirname, '../uploads/video');
fs.mkdirSync(OUT_DIR, { recursive: true });

function formatAssTime(sec) {
  const safeSec = Math.max(0, Number(sec) || 0);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const cs = Math.floor((safeSec % 1) * 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * Generate ASS Subtitle File for the entire video lecture.
 */
function generateAssSubtitles({
  scenes = [],
  title = 'Academic Lecture',
  subject = 'General Studies',
  language = 'English',
  totalDuration = 20,
  mode = 'explainer'
}) {
  const assFileName = `subs_${uuidv4()}.ass`;
  const assFilePath = path.join(OUT_DIR, assFileName);

  const hasDevanagari = /[\u0900-\u097F]/.test(title + subject + JSON.stringify(scenes));
  // Font name MUST NOT contain commas; commas shift ASS CSV style columns
  const fontName = hasDevanagari ? (process.platform === 'win32' ? 'Nirmala UI' : 'Noto Sans Devanagari') : 'Arial';

  const cleanTitle = (title || 'Academic Concept').slice(0, 36);
  const headerText = hasDevanagari ? `व्याख्यान: ${cleanTitle} | Notivexa` : `LECTURE: ${cleanTitle.toUpperCase()} | Notivexa Smart Study`;

  let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HeaderBadge,${fontName},22,&H00FFFFFF,&H00000000,&H0005101A,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,8,30,30,16,1
Style: SubtitleText,${fontName},26,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,28,1
Style: SceneTag,${fontName},20,&H0010B981,&H00000000,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,45,45,85,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:00.00,${formatAssTime(totalDuration)},HeaderBadge,,0,0,0,,{\\b1}🎓 ${headerText}{\\b0}
`;

  // Generate dialogue & phrase lines per scene
  scenes.forEach((sc, idx) => {
    const scStart = sc.startTime || (idx * 6);
    const scEnd = sc.endTime || (scStart + (sc.duration || 6));
    const scTitle = sc.title || `Scene ${idx + 1}`;

    // Scene badge in top left of card
    ass += `Dialogue: 2,${formatAssTime(scStart)},${formatAssTime(scEnd)},SceneTag,,0,0,0,,{\\b1}📌 ${scTitle}{\\b0}\n`;

    const narration = sc.narration || sc.title || '';
    const words = narration.split(/\s+/).filter(Boolean);

    if (words.length === 0) return;

    // Break narration into chunks of 5-7 words
    const chunkSize = 6;
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }

    const chunkDuration = (scEnd - scStart) / (chunks.length || 1);
    chunks.forEach((chunkText, cIdx) => {
      const cStart = scStart + (cIdx * chunkDuration);
      const cEnd = Math.min(cStart + chunkDuration, scEnd);

      // Highlight keywords (words starting with capital or containing key technical terms)
      const formattedChunk = chunkText.replace(/(\b[A-Z][a-z0-9_]+\b)/g, '{\\c&H00D7FF&\\b1}$1{\\c&HFFFFFF&\\b0}');

      ass += `Dialogue: 3,${formatAssTime(cStart)},${formatAssTime(cEnd)},SubtitleText,,0,0,28,,{\\fscx95\\fscy95\\t(0,60,\\fscx100\\fscy100)}${formattedChunk}\n`;
    });
  });

  fs.writeFileSync(assFilePath, ass, 'utf8');

  // Relative path formatted for FFmpeg complex filter on Windows and Linux
  const relAssPath = path.relative(process.cwd(), assFilePath).replace(/\\/g, '/').replace(/:/g, '\\:');

  return {
    assFilePath,
    assFileName,
    relAssPath,
    subtitlesUrl: `/uploads/video/${assFileName}`
  };
}

module.exports = {
  generateAssSubtitles,
  formatAssTime
};

