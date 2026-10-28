const fs = require('fs');
const path = require('path');

const promoDir = path.join(__dirname, 'assets/promo');

// Helper to read WAV PCM data (assumes 16-bit mono or stereo, converts to 44.1kHz stereo)
function readWavPcm(filePath) {
  const buf = fs.readFileSync(filePath);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  
  // Find 'data' chunk
  let dataOffset = 12;
  while (dataOffset < buf.length - 8) {
    const chunkId = buf.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = buf.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const rawBytes = buf.subarray(dataOffset);
  const numSamples = Math.floor(rawBytes.length / (channels * (bitsPerSample / 8)));
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const byteIdx = i * channels * (bitsPerSample / 8);
    let val = 0;
    if (bitsPerSample === 16) {
      val = rawBytes.readInt16LE(byteIdx) / 32768.0;
    }
    samples[i] = val;
  }

  return { samples, sampleRate };
}

function mixMasterAudio() {
  const outRate = 44100;
  const totalDuration = 45; // 45 seconds
  const totalSamples = outRate * totalDuration;

  // Master stereo buffers
  const masterL = new Float32Array(totalSamples);
  const masterR = new Float32Array(totalSamples);

  // 1. Load Background Music
  const musicPath = path.join(promoDir, 'bg_music.wav');
  if (fs.existsSync(musicPath)) {
    const musicBuf = fs.readFileSync(musicPath);
    const musicDataOffset = 44;
    const musicSamplesCount = Math.floor((musicBuf.length - 44) / 4);
    for (let i = 0; i < Math.min(totalSamples, musicSamplesCount); i++) {
      const idx = musicDataOffset + i * 4;
      const ml = musicBuf.readInt16LE(idx) / 32768.0;
      const mr = musicBuf.readInt16LE(idx + 2) / 32768.0;
      masterL[i] += ml * 0.28; // Subtle inspiring background music
      masterR[i] += mr * 0.28;
    }
    console.log('Mixed background music.');
  }

  // 2. Load and place Voiceover for each scene
  const voTimings = [
    { id: 1, startTime: 0.2 },
    { id: 2, startTime: 6.6 },
    { id: 3, startTime: 12.2 },
    { id: 4, startTime: 18.7 },
    { id: 5, startTime: 25.2 },
    { id: 6, startTime: 32.2 },
    { id: 7, startTime: 38.2 }
  ];

  for (const vo of voTimings) {
    const voPath = path.join(promoDir, `vo_scene_${vo.id}.wav`);
    if (!fs.existsSync(voPath)) continue;

    const { samples, sampleRate } = readWavPcm(voPath);
    const startSample = Math.floor(vo.startTime * outRate);
    const resampleRatio = sampleRate / outRate;

    for (let i = 0; i < samples.length; i++) {
      const outIdx = startSample + Math.floor(i / resampleRatio);
      if (outIdx >= totalSamples) break;
      const s = samples[i] * 1.15; // Crisp voiceover gain
      masterL[outIdx] += s;
      masterR[outIdx] += s;
    }
    console.log(`Placed VO scene ${vo.id} at ${vo.startTime}s.`);
  }

  // 3. Add soft keyboard typing sound effect in Scene 3 (12.5s to 17.5s)
  for (let t = 12.2; t < 17.8; t += 0.12) {
    const tapSample = Math.floor(t * outRate);
    for (let j = 0; j < 300; j++) {
      const idx = tapSample + j;
      if (idx < totalSamples) {
        const noise = (Math.random() * 2 - 1) * Math.exp(-j / 40) * 0.04;
        masterL[idx] += noise;
        masterR[idx] += noise;
      }
    }
  }

  // 4. Encode master WAV
  const wavOut = Buffer.alloc(44 + totalSamples * 4);
  wavOut.write('RIFF', 0);
  wavOut.writeUInt32LE(36 + totalSamples * 4, 4);
  wavOut.write('WAVE', 8);
  wavOut.write('fmt ', 12);
  wavOut.writeUInt32LE(16, 16);
  wavOut.writeUInt16LE(1, 20);
  wavOut.writeUInt16LE(2, 22);
  wavOut.writeUInt32LE(outRate, 24);
  wavOut.writeUInt32LE(outRate * 4, 28);
  wavOut.writeUInt16LE(4, 32);
  wavOut.writeUInt16LE(16, 34);
  wavOut.write('data', 36);
  wavOut.writeUInt32LE(totalSamples * 4, 40);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    // Soft limiter to prevent clipping
    let l = Math.tanh(masterL[i]);
    let r = Math.tanh(masterR[i]);
    wavOut.writeInt16LE(Math.floor(l * 32767), offset);
    wavOut.writeInt16LE(Math.floor(r * 32767), offset + 2);
    offset += 4;
  }

  const outFilePath = path.join(promoDir, 'master_soundtrack.wav');
  fs.writeFileSync(outFilePath, wavOut);
  console.log(`Master soundtrack written to ${outFilePath} (${fs.statSync(outFilePath).size} bytes)`);
}

mixMasterAudio();

