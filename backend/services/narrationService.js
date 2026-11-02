/**
 * narrationService.js
 * Generates high quality neural voiceover narration per scene using Edge TTS.
 * Probes exact duration via FFmpeg and masters scene-by-scene audio tracks.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const AUDIO_DIR = path.join(__dirname, '../uploads/audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const VOICE_CATALOG = {
  mr: {
    male: 'mr-IN-ManoharNeural',
    female: 'mr-IN-AarohiNeural',
    name: 'Marathi Neural'
  },
  hi: {
    male: 'hi-IN-MadhurNeural',
    female: 'hi-IN-SwaraNeural',
    name: 'Hindi Neural'
  },
  en: {
    male: 'en-IN-PrabhatNeural',
    female: 'en-IN-NeerjaNeural',
    name: 'Indian English Neural'
  },
  gu: {
    male: 'gu-IN-NiranjanNeural',
    female: 'gu-IN-DhwaniNeural',
    name: 'Gujarati Neural'
  },
  bn: {
    male: 'bn-IN-BashkarNeural',
    female: 'bn-IN-TanishaaNeural',
    name: 'Bengali Neural'
  },
  ta: {
    male: 'ta-IN-ValluvarNeural',
    female: 'ta-IN-PallaviNeural',
    name: 'Tamil Neural'
  },
  te: {
    male: 'te-IN-MohanNeural',
    female: 'te-IN-ShrutiNeural',
    name: 'Telugu Neural'
  },
  kn: {
    male: 'kn-IN-GaganNeural',
    female: 'kn-IN-SapnaNeural',
    name: 'Kannada Neural'
  },
  ur: {
    male: 'ur-PK-AsadNeural',
    female: 'ur-PK-UzmaNeural',
    name: 'Urdu Neural'
  }
};

/**
 * Resolves appropriate Edge TTS voice name.
 */
function resolveVoice(languageCode = 'en', gender = 'male') {
  const normCode = (languageCode || 'en').toLowerCase().split('-')[0];
  const langVoices = VOICE_CATALOG[normCode] || VOICE_CATALOG['en'];
  return langVoices[gender] || langVoices['male'];
}

/**
 * Probe exact duration of an audio file using FFmpeg.
 */
const { probeMediaWithFfmpeg } = require('./mediaProbe');

function probeAudioDuration(filePath) {
  const info = probeMediaWithFfmpeg(filePath);
  return Promise.resolve(info.duration > 0 ? info.duration : 6);
}

/**
 * Synthesize TTS audio for a single text chunk with Edge TTS.
 */
async function synthesizeTextToAudio(text, voiceName, outputPath, speedMultiplier = 1.0) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('No narration text provided for audio synthesis');
  }

  const tts = new MsEdgeTTS();
  const pitchRateOptions = {};
  if (speedMultiplier && speedMultiplier !== 1.0) {
    const pct = Math.round((speedMultiplier - 1.0) * 100);
    pitchRateOptions.rate = pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  return new Promise((resolve, reject) => {
    // 15-second timeout for TTS socket
    const timer = setTimeout(() => {
      reject(new Error('Edge TTS stream timeout (15s limit)'));
    }, 15000);

    try {
      const streamObj = tts.toStream(cleanText, pitchRateOptions);
      const audioStream = streamObj.audioStream || streamObj;
      const chunks = [];

      audioStream.on('data', d => chunks.push(d));
      audioStream.on('end', () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(outputPath, buf);
        resolve({ outputPath, size: buf.length });
      });
      audioStream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Fallback synthesizer using Google Translate TTS if Edge TTS fails or times out.
 */
async function synthesizeFallbackTTS(text, langCode, outputPath) {
  const code = (langCode || 'en').split('-')[0];
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${code}&client=tw-ob`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 });
  if (!res.ok) throw new Error(`Google Translate TTS status ${res.status}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(ab));
  return { outputPath, size: ab.byteLength };
}

/**
 * Generate audio for all scenes in a script, probe timings, and concatenate into master audio track.
 */
async function generateScriptNarration({
  scenes = [],
  language = 'English',
  languageCode = 'en',
  gender = 'male',
  speedMultiplier = 1.0
}) {
  const selectedVoice = resolveVoice(languageCode, gender);
  console.log(`[NarrationService] Synthesizing narration for ${scenes.length} scenes using voice: ${selectedVoice}`);

  const sceneAudios = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const narrationText = sc.narration || sc.title || 'Learning core concept.';
    const sceneFileName = `scene_audio_${i + 1}_${uuidv4().slice(0, 8)}.mp3`;
    const sceneFilePath = path.join(AUDIO_DIR, sceneFileName);

    let synthSuccess = false;
    try {
      await synthesizeTextToAudio(narrationText, selectedVoice, sceneFilePath, speedMultiplier);
      synthSuccess = true;
    } catch (edgeErr) {
      console.warn(`[NarrationService] Edge TTS failed for Scene ${i + 1}: ${edgeErr.message}. Trying fallback...`);
      try {
        await synthesizeFallbackTTS(narrationText, languageCode, sceneFilePath);
        synthSuccess = true;
      } catch (fallbackErr) {
        console.warn(`[NarrationService] Fallback TTS failed: ${fallbackErr.message}. Generating silence...`);
        // Generate silent MP3 for timing continuity
        await new Promise((r) => {
          ffmpeg()
            .input('aevalsrc=0:d=6:s=24000')
            .inputFormat('lavfi')
            .output(sceneFilePath)
            .on('end', r)
            .on('error', r)
            .run();
        });
      }
    }

    const duration = await probeAudioDuration(sceneFilePath);
    const sceneStart = currentTime;
    const sceneEnd = currentTime + duration;
    currentTime = sceneEnd;

    sceneAudios.push({
      sceneNumber: sc.sceneNumber || (i + 1),
      filePath: sceneFilePath,
      fileName: sceneFileName,
      narrationText,
      duration,
      startTime: sceneStart,
      endTime: sceneEnd
    });

    // Update scene timing
    sc.duration = duration;
    sc.startTime = sceneStart;
    sc.endTime = sceneEnd;
  }

  // Concatenate scene audios into master track
  const masterFileName = `master_audio_${uuidv4()}.mp3`;
  const masterFilePath = path.join(AUDIO_DIR, masterFileName);

  const concatListPath = path.join(AUDIO_DIR, `concat_audio_${uuidv4()}.txt`);
  const listLines = sceneAudios.map(a => `file '${a.filePath.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatListPath, listLines, 'utf8');

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '24000'])
      .save(masterFilePath)
      .on('end', () => {
        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
        resolve();
      })
      .on('error', (err) => {
        if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
        reject(err);
      });
  });

  const totalDuration = await probeAudioDuration(masterFilePath);
  const fileSize = fs.existsSync(masterFilePath) ? fs.statSync(masterFilePath).size : 0;

  console.log(`[NarrationService] Master audio track created: ${masterFileName} (${totalDuration}s, ${fileSize} bytes)`);

  return {
    masterAudioPath: masterFilePath,
    masterAudioFileName: masterFileName,
    masterAudioUrl: `/uploads/audio/${masterFileName}`,
    totalDuration,
    fileSize,
    voice: selectedVoice,
    scenesWithTiming: sceneAudios
  };
}

module.exports = {
  generateScriptNarration,
  resolveVoice,
  probeAudioDuration,
  VOICE_CATALOG
};
