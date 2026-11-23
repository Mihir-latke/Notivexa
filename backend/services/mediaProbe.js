const { spawnSync } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    try {
      if (process.platform !== 'win32') {
        fs.chmodSync(ffmpegInstaller.path, 0o755);
      }
    } catch {}
    return ffmpegInstaller.path;
  }
  return 'ffmpeg';
}

function probeMediaWithFfmpeg(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, hasVideo: false, hasAudio: false, duration: 0, size: 0 };
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;

  const binPath = getFfmpegPath();
  const res = spawnSync(binPath, ['-i', filePath], { encoding: 'utf8' });
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

module.exports = { probeMediaWithFfmpeg, getFfmpegPath };

