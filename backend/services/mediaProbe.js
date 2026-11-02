const { spawnSync } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');

function probeMediaWithFfmpeg(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, hasVideo: false, hasAudio: false, duration: 0, size: 0 };
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;

  const res = spawnSync(ffmpegInstaller.path, ['-i', filePath], { encoding: 'utf8' });
  const text = (res.stderr || '') + (res.stdout || '');

  const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  let duration = 0;
  if (durMatch) {
    const hours = parseFloat(durMatch[1]);
    const mins = parseFloat(durMatch[2]);
    const secs = parseFloat(durMatch[3]);
    duration = hours * 3600 + mins * 60 + secs;
  }

  const hasVideo = /Stream #\d+:\d+.*Video:/i.test(text);
  const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(text);

  return {
    exists: true,
    hasVideo,
    hasAudio,
    duration,
    size
  };
}

module.exports = { probeMediaWithFfmpeg };

