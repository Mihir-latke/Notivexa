const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');

const promoDir = path.join(__dirname, 'assets/promo');

const scenes = [
  {
    id: 1,
    start: 0,
    duration: 6,
    text: "Too many notes, scattered files, and endless distractions. Studying shouldn't feel this overwhelming."
  },
  {
    id: 2,
    start: 6,
    duration: 5,
    text: "Meet Notivexa — your intelligent knowledge hub, beautifully organized in one place."
  },
  {
    id: 3,
    start: 11,
    duration: 7,
    text: "Create rich handwritten notes, structured outlines, and clear diagrams with effortless formatting."
  },
  {
    id: 4,
    start: 18,
    duration: 7,
    text: "Collaborate in real time with classmates and teams. Share notes and study materials seamlessly."
  },
  {
    id: 5,
    start: 25,
    duration: 7,
    text: "Powered by smart document AI. Upload any book or paper, extract clean text, and generate revision materials in seconds."
  },
  {
    id: 6,
    start: 32,
    duration: 6,
    text: "Your entire study workflow syncs across every device — at home, in the library, or on the go."
  },
  {
    id: 7,
    start: 38,
    duration: 7,
    text: "Notivexa. Organize your knowledge. Empower your ideas. Start achieving today."
  }
];

async function generateVoice() {
  const tts = new MsEdgeTTS();
  const voice = 'en-US-JennyNeural'; // Broadcast commercial female voice
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  for (const scene of scenes) {
    const outFile = path.join(promoDir, `vo_scene_${scene.id}.mp3`);
    console.log(`Generating Scene ${scene.id} voiceover...`);
    const streamObj = tts.toStream(scene.text);
    const audioStream = streamObj.audioStream || streamObj;
    const chunks = [];

    await new Promise((resolve, reject) => {
      audioStream.on('data', d => chunks.push(d));
      audioStream.on('end', () => {
        fs.writeFileSync(outFile, Buffer.concat(chunks));
        console.log(`Saved Scene ${scene.id}: ${chunks.length} chunks (${fs.statSync(outFile).size} bytes)`);
        resolve();
      });
      audioStream.on('error', reject);
    });
  }
  console.log('All voiceover segments generated successfully!');
}

generateVoice().catch(err => {
  console.error('Voiceover generation error:', err);
  process.exit(1);
});

