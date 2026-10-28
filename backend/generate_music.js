const fs = require('fs');
const path = require('path');

// Generates an inspirational, ambient electronic background track (45s, 44.1kHz stereo)
function generateMusic() {
  const sampleRate = 44100;
  const duration = 45;
  const numSamples = sampleRate * duration;
  const buffer = Buffer.alloc(44 + numSamples * 4); // 16-bit stereo (4 bytes per sample)

  // WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 4, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20);  // Format: PCM
  buffer.writeUInt16LE(2, 22);  // Channels: 2
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28); // Byte rate
  buffer.writeUInt16LE(4, 32);  // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 4, 40);

  // Chord progression: Am -> F -> C -> G (Classic inspirational tech promo chords)
  // Frequencies for chords:
  // Am: A2(110), C3(130.81), E3(164.81), A3(220)
  // F:  F2(87.31), A2(110), C3(130.81), F3(174.61)
  // C:  C2(65.41), G2(98.00), C3(130.81), E3(164.81)
  // G:  G2(98.00), B2(123.47), D3(146.83), G3(196.00)
  const chords = [
    [110.0, 130.81, 164.81, 220.0, 329.63], // Am9
    [87.31, 130.81, 174.61, 220.0, 261.63], // Fmaj7
    [65.41, 98.00, 130.81, 164.81, 196.0],  // C
    [98.00, 123.47, 146.83, 196.0, 246.94]  // Gsus4
  ];

  const chordDuration = 5.625; // 45 / 8 cycles = 5.625s per chord
  let offset = 44;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / chordDuration) % chords.length;
    const currentChord = chords[chordIdx];
    const chordTime = t % chordDuration;

    // Master volume envelope: smooth fade in (0-3s), fade out (41-45s)
    let masterEnv = 1.0;
    if (t < 3.0) masterEnv = t / 3.0;
    else if (t > 41.0) masterEnv = Math.max(0, (45.0 - t) / 4.0);

    // Warm ambient pad (super-saw + sine harmonics with subtle chorus)
    let padLeft = 0;
    let padRight = 0;

    for (let c = 0; c < currentChord.length; c++) {
      const freq = currentChord[c];
      const detune1 = freq * 1.002;
      const detune2 = freq * 0.998;
      
      const s1 = Math.sin(2 * Math.PI * freq * t);
      const s2 = Math.sin(2 * Math.PI * detune1 * t + 0.3);
      const s3 = Math.sin(2 * Math.PI * detune2 * t + 0.6);
      const oct = Math.sin(2 * Math.PI * (freq * 2) * t) * 0.3;

      const voice = (s1 + s2 + s3 + oct) * 0.08;
      padLeft += voice * (0.8 + 0.2 * Math.sin(t * 0.5 + c));
      padRight += voice * (0.8 + 0.2 * Math.cos(t * 0.5 + c));
    }

    // Gentle melodic electronic arpeggio (16th notes feel, crisp bell tone)
    const arpBpm = 110;
    const beatTime = (60 / arpBpm) / 2; // 8th note arpeggio
    const arpIdx = Math.floor(t / beatTime) % currentChord.length;
    const arpNoteTime = t % beatTime;
    const arpEnv = Math.exp(-arpNoteTime * 7.0); // Pluck decay
    const arpFreq = currentChord[arpIdx] * 2; // 1 octave higher
    const arpSound = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * 0.09;

    // Soft electronic pulse / heartbeat kick on beats (only after 6 seconds)
    let kick = 0;
    if (t > 6.0 && t < 41.0) {
      const kickBeat = (60 / arpBpm);
      const kickTime = t % kickBeat;
      if (kickTime < 0.2) {
        const kickFreq = 120 * Math.exp(-kickTime * 25) + 45;
        kick = Math.sin(2 * Math.PI * kickFreq * kickTime) * Math.exp(-kickTime * 12) * 0.22;
      }
    }

    // Shimmering high ambience
    const shimmer = (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 1320 * t)) * 0.015 * (Math.sin(t * 1.5) * 0.5 + 0.5);

    // Mix stereo
    let sampleL = (padLeft + arpSound * 0.7 + kick + shimmer) * masterEnv * 0.7;
    let sampleR = (padRight + arpSound * 0.7 + kick + shimmer) * masterEnv * 0.7;

    // Clamp 16-bit
    sampleL = Math.max(-1, Math.min(1, sampleL));
    sampleR = Math.max(-1, Math.min(1, sampleR));

    buffer.writeInt16LE(Math.floor(sampleL * 32767), offset);
    buffer.writeInt16LE(Math.floor(sampleR * 32767), offset + 2);
    offset += 4;
  }

  const outPath = path.join(__dirname, 'assets/promo/bg_music.wav');
  fs.writeFileSync(outPath, buffer);
  console.log(`Music generated: ${outPath} (${fs.statSync(outPath).size} bytes, 45 seconds)`);
}

generateMusic();

