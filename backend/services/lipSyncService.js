/**
 * lipSyncService.js
 * Real audio-driven lip sync analysis using PCM energy and Zero-Crossing Rate (ZCR).
 * Accurately drives animated teacher mouth sprites frame-by-frame with speech pauses.
 */

const { spawn } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const FPS = 25;
const FRAME_DURATION = 1.0 / FPS; // 0.040s (40ms)
const SAMPLE_RATE = 16000; // 16kHz mono 16-bit PCM
const SAMPLES_PER_FRAME = Math.round(SAMPLE_RATE * FRAME_DURATION); // 640 samples per frame

/**
 * Viseme categories:
 * - 'closed': Mouth closed (silence, pauses, m, b, p)
 * - 'slightly_open': Low speech energy (consonants s, t, d, k)
 * - 'open': Medium energy (vowels e, i)
 * - 'wide': High energy (wide vowels a, aa, ah)
 * - 'round': Rounded vowels (o, u, oo)
 */

/**
 * Extract 16kHz 16-bit mono PCM from audio file using FFmpeg child process.
 */
function extractPCMStream(audioPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = ffmpegInstaller.path;
    const proc = spawn(ffmpegPath, [
      '-i', audioPath,
      '-f', 's16le',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const chunks = [];
    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stdout.on('end', () => resolve(Buffer.concat(chunks)));
    proc.stdout.on('error', err => reject(err));
    proc.on('close', code => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`FFmpeg PCM extraction exited with code ${code}`));
      }
    });
  });
}

/**
 * Analyze audio PCM stream and generate frame-by-frame viseme timeline.
 */
async function generateLipSyncKeyframes(audioPath) {
  const pcmBuffer = await extractPCMStream(audioPath);
  const totalSamples = Math.floor(pcmBuffer.length / 2); // 16-bit = 2 bytes per sample
  const sampleArray = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, totalSamples);

  const totalFrames = Math.ceil(totalSamples / SAMPLES_PER_FRAME);
  const frameEnergies = [];

  // 1. Calculate RMS energy & Zero-Crossing Rate per 40ms frame
  let maxRms = 1;
  for (let f = 0; f < totalFrames; f++) {
    const startIdx = f * SAMPLES_PER_FRAME;
    const endIdx = Math.min(startIdx + SAMPLES_PER_FRAME, totalSamples);
    const count = endIdx - startIdx;

    if (count <= 0) {
      frameEnergies.push({ rms: 0, zcr: 0 });
      continue;
    }

    let sumSquares = 0;
    let zeroCrossings = 0;
    let prevSample = sampleArray[startIdx];

    for (let i = startIdx; i < endIdx; i++) {
      const s = sampleArray[i];
      sumSquares += s * s;
      if ((prevSample >= 0 && s < 0) || (prevSample < 0 && s >= 0)) {
        zeroCrossings++;
      }
      prevSample = s;
    }

    const rms = Math.sqrt(sumSquares / count);
    const zcr = zeroCrossings / count;
    if (rms > maxRms) maxRms = rms;

    frameEnergies.push({ rms, zcr });
  }

  // 2. Classify frames into visemes with dynamic adaptive thresholding & pause detection
  const silenceThreshold = Math.max(maxRms * 0.08, 300); // Below this is natural silence / pause
  const lowThreshold = maxRms * 0.25;
  const midThreshold = maxRms * 0.55;
  const highThreshold = maxRms * 0.78;

  const rawVisemes = [];
  for (let f = 0; f < totalFrames; f++) {
    const { rms, zcr } = frameEnergies[f];

    if (rms < silenceThreshold) {
      rawVisemes.push('closed');
    } else if (rms < lowThreshold) {
      rawVisemes.push(zcr > 0.35 ? 'slightly_open' : 'closed');
    } else if (rms < midThreshold) {
      rawVisemes.push(zcr > 0.4 ? 'slightly_open' : 'open');
    } else if (rms < highThreshold) {
      rawVisemes.push(zcr < 0.15 ? 'round' : 'open');
    } else {
      rawVisemes.push(zcr < 0.18 ? 'round' : 'wide');
    }
  }

  // 3. Smooth visemes to prevent single-frame flickering
  const smoothedVisemes = [...rawVisemes];
  for (let f = 1; f < totalFrames - 1; f++) {
    // If a single frame differs from both neighbors, smooth to previous
    if (smoothedVisemes[f] !== smoothedVisemes[f - 1] && smoothedVisemes[f - 1] === smoothedVisemes[f + 1]) {
      smoothedVisemes[f] = smoothedVisemes[f - 1];
    }
  }

  return {
    fps: FPS,
    totalFrames,
    durationSeconds: totalFrames * FRAME_DURATION,
    keyframes: smoothedVisemes,
    getVisemeAt: (timestampSec) => {
      const frameIdx = Math.floor(timestampSec * FPS);
      if (frameIdx < 0 || frameIdx >= smoothedVisemes.length) return 'closed';
      return smoothedVisemes[frameIdx];
    }
  };
}

module.exports = {
  generateLipSyncKeyframes,
  FPS,
  FRAME_DURATION
};

