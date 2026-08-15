/**
 * aiService.js — Notivexa v3 AI Engine
 * Supports: Groq (free), Gemini (free), Claude, local engine
 * Features: multilingual, image recognition, video/audio generation
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdf = require('./pdfEngine');

// ═══════════════════════════════════════════════════════════
// CORE AI CALLER — tries APIs in order
// ═══════════════════════════════════════════════════════════
async function callAI(system, user, maxTokens = 3000, imageBase64 = null) {
  const g = process.env.GEMINI_API_KEY;
  const q = process.env.GROQ_API_KEY;
  const c = process.env.ANTHROPIC_API_KEY;

  // Gemini supports images natively
  if (imageBase64 || (g && !g.startsWith('your_'))) {
    try { const r = await callGemini(system, user, maxTokens, imageBase64); if (r) return r; }
    catch(e) { console.warn('[Gemini]', e.message); }
  }
  if (q && !q.startsWith('your_')) {
    try { const r = await callGroq(system, user, maxTokens); if (r) return r; }
    catch(e) { console.warn('[Groq]', e.message); }
  }
  if (c && !c.startsWith('your_')) {
    try { const r = await callClaude(system, user, maxTokens, imageBase64); if (r) return r; }
    catch(e) { console.warn('[Claude]', e.message); }
  }
  return null;
}

async function callGemini(system, user, maxTokens, imageBase64 = null) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('your_')) throw new Error('No Gemini key');
  const parts = [{ text: `${system}\n\n${user}` }];
  if (imageBase64) {
    parts.unshift({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{parts}], generationConfig:{maxOutputTokens:maxTokens,temperature:0.7} }),
      timeout: 50000 }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callGroq(system, user, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.startsWith('your_')) throw new Error('No Groq key');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body: JSON.stringify({ model:'llama-3.1-70b-versatile', messages:[{role:'system',content:system},{role:'user',content:user}], max_tokens:Math.min(maxTokens,8000), temperature:0.7 }),
    timeout: 50000
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || null;
}

async function callClaude(system, user, maxTokens, imageBase64 = null) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith('your_')) throw new Error('No Claude key');
  const content = imageBase64
    ? [{ type:'image', source:{type:'base64',media_type:'image/jpeg',data:imageBase64}}, {type:'text',text:user}]
    : user;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:maxTokens, system, messages:[{role:'user',content}] }),
    timeout: 50000
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.content?.[0]?.text || null;
}

const safeJSON = (raw, fb) => { try { return JSON.parse((raw||'').replace(/```json\n?|\n?```/g,'').trim()); } catch { return fb; } };

// ═══════════════════════════════════════════════════════════
// MULTILINGUAL TRANSLATION — free MyMemory API
// ═══════════════════════════════════════════════════════════
const LANG_CODES = {
  Hindi:'hi', Marathi:'mr', Bengali:'bn', Tamil:'ta', Telugu:'te',
  Gujarati:'gu', Kannada:'kn', Punjabi:'pa', Urdu:'ur',
  French:'fr', Spanish:'es', German:'de', Japanese:'ja',
  Chinese:'zh', Arabic:'ar', Portuguese:'pt', Russian:'ru',
  Korean:'ko', Italian:'it', Dutch:'nl', Swedish:'sv',
  Turkish:'tr', Vietnamese:'vi', Thai:'th', Indonesian:'id'
};

async function translateText(text, targetLang) {
  if (!text || targetLang === 'English') return text;
  const code = LANG_CODES[targetLang];
  if (!code) return text;

  // Try AI translation first (better quality)
  const aiResult = await callAI(
    `Translate to ${targetLang}. Preserve all formatting (##, •, **bold**). Keep technical terms in English with ${targetLang} meaning.`,
    `Translate this to ${targetLang}:\n\n${text.slice(0, 5000)}`, 2000
  );
  if (aiResult) return aiResult;

  // MyMemory free translation (fallback)
  try {
    const chunks = text.match(/.{1,400}/gs) || [text];
    const parts = [];
    for (const chunk of chunks.slice(0, 20)) {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk.trim())}&langpair=en|${code}`, { timeout: 10000 });
      if (r.ok) {
        const d = await r.json();
        parts.push(d.responseData?.translatedText || chunk);
        await new Promise(r => setTimeout(r, 200));
      }
    }
    return parts.join(' ');
  } catch(e) { return text; }
}

// ═══════════════════════════════════════════════════════════
// IMAGE RECOGNITION
// ═══════════════════════════════════════════════════════════
async function analyzeImage(imageBase64, mimeType = 'image/jpeg') {
  const result = await callAI(
    'You are an expert at analyzing academic images. Extract and explain all content.',
    `Analyze this image completely:
1. What type of content is this? (diagram, text, chart, formula, etc.)
2. Extract ALL text visible in the image
3. Describe all diagrams, charts, or visual elements
4. Explain the academic concept shown
5. Create structured notes from this image
6. What subject/topic does this relate to?`,
    2000, imageBase64
  );
  return result || 'Image analysis requires a Gemini or Claude API key. Please add GEMINI_API_KEY to backend/.env';
}

// ═══════════════════════════════════════════════════════════
// CONTENT GENERATORS
// ═══════════════════════════════════════════════════════════

function sysPrompt(lang = 'English') {
  const li = lang === 'English'
    ? 'Use clear Indian English. Add [Hindi explanation] for technical terms.'
    : `Respond ENTIRELY in ${lang}. Keep technical terms in English with ${lang} meaning.`;
  return `You are Notivexa AI, expert academic tutor for Indian students. STRICT: Generate content ONLY from provided document. ${li} Be thorough and exam-focused.`;
}

async function generateNotes(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Generate COMPREHENSIVE study notes from this document.
Title: ${title} | Subject: ${subject}

FORMAT:
# ${title}
## [Major Topic 1 from document]
### Key Concepts
• [specific fact from document]
• [specific fact]
**Definition:** [exact definition from document]
> Formula: [exact formula if present]

## [Major Topic 2]
...continue for ALL topics in document...

## 📌 Key Points to Remember
[bullet list of most important points]

## 🎯 Exam Tips
[specific tips based on document content]

Rules: Cover EVERY topic. Include ALL formulas/definitions/dates. Be thorough.
Document:\n${text.slice(0, 14000)}`, 4000);
  const content = raw || pdf.makeNotes(text, title, subject);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

async function generateSummary(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Summarize this document in 400 words. Cover: main topics, key definitions, important formulas, exam relevance.
Title: ${title} | Subject: ${subject}
Document:\n${text.slice(0, 10000)}`, 1200);
  const content = raw || pdf.makeSummary(text, title, subject);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

async function generateFlashcards(text, subject, count = 10, lang = 'English') {
  const raw = await callAI('Return ONLY valid JSON array.',
    `Generate ${count} flashcards from document.
Return JSON: [{"question":"...","answer":"...","difficulty":"easy|medium|hard","bloomsLevel":"remember|understand|apply|analyze"}]
Only use document content. Mix easy/medium/hard.
Subject: ${subject}
Document:\n${text.slice(0, 10000)}`, 3000);
  const cards = safeJSON(raw, null);
  if (Array.isArray(cards) && cards.length > 0) return cards.slice(0, count);
  return pdf.makeFlashcards(text, subject, count);
}

async function generateQuestions(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Generate comprehensive practice questions from this document.
Title: ${title} | Subject: ${subject}

### Multiple Choice (5 questions, 1 mark each)
Q1. [question]
a) [option] b) [option] c) [option] d) [option] ✓
...

### Short Answer (5 questions, 3 marks each)
Q6. [question]
Expected: [brief answer guide]
...

### Long Answer (3 questions, 5 marks each)
Q11. [question]
OR Q11A. [alternative]
...

All questions from document content only.
Document:\n${text.slice(0, 10000)}`, 4000);
  const content = raw || pdf.makeQuestions(text, subject, title);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

// UNIVERSITY-FORMAT QUESTION PAPER (20-mark and 60-mark)
async function generateQuestionPaper(text, subject, examType = '60_MARKS', institution = 'University', className = 'FYMCA', lang = 'English', sets = 3) {
  const paperSets = [];

  for (let setNum = 1; setNum <= sets; setNum++) {
    const prompt = examType === '20_MARKS'
      ? `Generate a 20-mark university question paper SET ${setNum} of ${sets}.
Subject: ${subject} | Institution: ${institution}

FORMAT EXACTLY:
${institution.toUpperCase()}
QUESTION PAPER — SET ${setNum}
Subject: ${subject}
Time: 1 Hour                    Maximum Marks: 20
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1] Attempt Any FIVE out of SIX                                [10 Marks]

| Q.No | Question | Marks | CO | BL |
|------|----------|-------|----|----|
| A | [2-mark question from document] | 02 | CO1 | BT1 |
| B | [2-mark question from document] | 02 | CO1 | BT1 |
| C | [2-mark question from document] | 02 | CO2 | BT1 |
| D | [2-mark question from document] | 02 | CO2 | BT2 |
| E | [2-mark question from document] | 02 | CO3 | BT2 |
| F | [2-mark question from document] | 02 | CO3 | BT1 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[2] Attempt Any ONE                                             [05 Marks]

| Q.No | Question | Marks | CO | BL |
|------|----------|-------|----|----|
| A | [5-mark question requiring explanation] | 05 | CO1 | BT2 |
| B | [5-mark question from different topic] | 05 | CO2 | BT2 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[3] Attempt Any ONE                                             [05 Marks]

| Q.No | Question | Marks | CO | BL |
|------|----------|-------|----|----|
| A | [5-mark application question] | 05 | CO3 | BT3 |
| B | [5-mark application question] | 05 | CO4 | BT3 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BT: BT1=Remember BT2=Understand BT3=Apply BT4=Analyze BT5=Evaluate
CO: CO1=Basics CO2=Concepts CO3=Application CO4=Analysis CO5=Advanced

RULES: Questions ONLY from document. SET ${setNum} must be different from other sets.
Document:\n${text.slice(0, 8000)}`
      : `Generate a 60-mark university question paper SET ${setNum} of ${sets}.
Subject: ${subject} | Institution: ${institution}

FORMAT EXACTLY:
${institution.toUpperCase()}
QUESTION PAPER — SET ${setNum}
Subject: ${subject}
Time: 2 Hours                   Maximum Marks: 60
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTE:
1. Q1 is COMPULSORY
2. Attempt any THREE from Q2-Q6
3. Each question carries 15 marks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q1. Attempt any THREE                                          [15 Marks]
a) [5-mark question]      [5 Marks]  CO1  BT1
b) [5-mark question]      [5 Marks]  CO2  BT2
c) [5-mark question]      [5 Marks]  CO3  BT3
d) [5-mark question]      [5 Marks]  CO4  BT3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q2. Attempt All                                                [15 Marks]
a) [8-mark detailed question from document]   [8 Marks]  CO2  BT3
b) [7-mark question from document]            [7 Marks]  CO1  BT2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q3. Attempt All                                                [15 Marks]
a) [8-mark question - application/analysis]   [8 Marks]  CO3  BT4
b) [7-mark question from document]            [7 Marks]  CO2  BT3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q4. Attempt All                                                [15 Marks]
a) [8-mark question - analysis]               [8 Marks]  CO4  BT4
b) [7-mark question from document]            [7 Marks]  CO3  BT3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q5. Attempt All                                                [15 Marks]
a) [8-mark question - evaluation]             [8 Marks]  CO5  BT5
b) [7-mark question from document]            [7 Marks]  CO2  BT3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q6. Attempt All                                                [15 Marks]
a) [8-mark question - advanced]               [8 Marks]  CO3  BT4
b) [7-mark question from document]            [7 Marks]  CO5  BT5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BT Levels: BT1=Remember BT2=Understand BT3=Apply BT4=Analyze BT5=Evaluate BT6=Create
CO Mapping: CO1=Basics CO2=Concepts CO3=Application CO4=Analysis CO5=Advanced Topics

RULES: ALL questions from document only. No repetition. SET ${setNum} must differ from other sets.
Mix: theory + numerical + application questions.
Document:\n${text.slice(0, 8000)}`;

    const raw = await callAI(sysPrompt(lang), prompt, 4000);
    let content = raw || pdf.makeQuestionPaper(text, subject, examType === '20_MARKS' ? 20 : 60, examType === '20_MARKS' ? 1 : 2, institution);
    if (lang !== 'English') content = await translateText(content, lang);
    paperSets.push({ setNumber: setNum, examType, content });
  }

  return paperSets;
}

// HANDWRITTEN NOTES — generates content for multiple paper styles
async function generateHandwrittenNotes(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Generate concise handwritten-style notes from this document.
Title: ${title} | Subject: ${subject}

FORMAT (keep each line SHORT for handwriting):
# ${title}
Date: ${new Date().toLocaleDateString('en-IN')}

## Topic 1
• Key point (max 12 words)
• Another point
**Formula:** F = ma
Important: Highlight this concept

## Topic 2
[continue for all topics]

## Key Points ★
• Most important fact 1
• Most important fact 2

Tip: Short bullets only. Use ★ for very important items.
Document:\n${text.slice(0, 10000)}`, 3000);
  const content = raw || pdf.makeNotes(text, title, subject);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

// PODCAST SCRIPT
async function generatePodcast(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Write an engaging 8-10 minute audio lecture script.
Title: "${title}" | Subject: ${subject}

START: "Namaste students! Main hun aapka Notivexa AI tutor. Aaj hum padhenge: ${title}"

Cover ALL topics from document with:
- Clear explanations with examples
- "Toh samajhte hain..." transitions
- Repeat key formulas twice
- [PAUSE 2s] between sections
- Exam tips at end
- End: "Revision karo, practice karo. Jai Hind!"

~1200 words total. NO slide markers. Audio only.
Document:\n${text.slice(0, 9000)}`, 2500);
  const content = raw || pdf.makePodcastScript(text, title, subject);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

// VIDEO SCRIPT — full 20-minute lecture
async function generateVideoScript(text, title, subject, lang = 'English') {
  const raw = await callAI(sysPrompt(lang),
    `Create a COMPLETE 20-MINUTE video lecture script from this document.
Title: "${title}" | Subject: ${subject}

Generate 10-12 slides, EACH with detailed narration (200+ words):

[SLIDE 1: TITLE]
Visual: Title card with subject name and today's date
Narration: Namaste students! Aaj ka topic hai: ${title}. [Full 2-minute intro covering what we'll learn]
Duration: 2 min

[SLIDE 2: TOPIC NAME]
Visual: • Bullet 1 from doc\n• Bullet 2\n• Formula if any
Narration: [Full detailed explanation 200+ words with examples from document, exam tips, Indian context]
Duration: 2 min

[SLIDE 3: ...]
...continue for ALL topics in document...

[SLIDE N: SUMMARY]
Visual: Key points list
Narration: [2-min recap of everything covered, exam strategy]
Duration: 2 min

Total target: 20 minutes of content.
Document:\n${text.slice(0, 12000)}`, 5000);
  const content = raw || pdf.makeVideoScript(text, title, subject);
  if (lang !== 'English') return translateText(content, lang);
  return content;
}

async function generatePPT(text, title, subject, lang = 'English') {
  const raw = await callAI('Return ONLY valid JSON object.',
    `Create a presentation from this document.
Return JSON:
{"title":"${title}","subtitle":"Subject: ${subject}","slides":[
  {"slideNumber":1,"title":"slide title","bullets":["point 1","point 2","point 3","point 4"],"speakerNotes":"detailed notes 60+ words","layout":"title|content"}
]}
12-15 slides. Each bullet = full sentence. Only document content.
Document:\n${text.slice(0, 10000)}`, 3500);
  const data = safeJSON(raw, null);
  if (data?.slides?.length > 0) return data;
  return pdf.makePPT(text, title, subject);
}

async function generateMindmap(text, title) {
  const raw = await callAI('Return ONLY valid JSON.',
    `Mind map from document.
JSON: {"central":"${title.slice(0,40)}","branches":[{"topic":"topic","color":"#4F46E5","subtopics":["detail","detail","detail"]}]}
5-7 branches, 4-6 subtopics each. Only document content.
Document:\n${text.slice(0, 7000)}`, 2000);
  const data = safeJSON(raw, null);
  if (data?.branches?.length > 0) return data;
  return pdf.makeMindmap(text, title);
}

async function generateVocabulary(text, subject, lang = 'English') {
  const raw = await callAI('Return ONLY valid JSON array.',
    `Extract 12-15 key terms from document.
JSON: [{"word":"term","hindi":"हिंदी","definition":"clear 2-sentence def","example":"example from doc","context":"exam context","formula":"formula if any"}]
Only terms in document.
Subject: ${subject}
Document:\n${text.slice(0, 7000)}`, 2000);
  const data = safeJSON(raw, null);
  if (Array.isArray(data) && data.length > 0) return data;
  return pdf.makeVocabulary(text, subject);
}

// DETAILED CHATBOT
async function answerChat(question, docText, history = []) {
  if (!docText || docText.trim().length < 30) {
    return 'Please select a PDF document above. I can only answer based on your uploaded document content.';
  }
  const hist = history.slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`).join('\n\n');
  const raw = await callAI(
    'You are an expert AI tutor. Give DETAILED, THOROUGH answers (150-250 words minimum). Explain with examples. If formula: write it + explain each part. If definition: define + explain + example. Always relate to Indian exams.',
    `Document:\n${docText.slice(0, 10000)}\n\nHistory:\n${hist}\n\nQuestion: ${question}\n\nGive a COMPLETE, DETAILED answer from the document.`, 1800);
  return raw || pdf.answerQuestion(question, docText);
}

// IMPORTANT QUESTIONS for study planner
async function generateImportantQuestions(text, subject, examDate) {
  const daysLeft = examDate ? Math.ceil((new Date(examDate) - new Date()) / 86400000) : 30;
  const raw = await callAI('Return ONLY valid JSON.',
    `Generate important exam questions from document with study schedule.
Subject: ${subject} | Days until exam: ${daysLeft}

JSON:
{
  "importantTopics": ["topic1","topic2",...],
  "mustRevise": ["absolute must know fact 1","..."],
  "likelyQuestions": [
    {"question":"likely exam question","marks":5,"priority":"high|medium","estimatedDay":1}
  ],
  "studyTips": ["tip1","tip2"]
}

Prioritize: frequently tested concepts, definitions, formulas.
Document:\n${text.slice(0, 8000)}`, 2500);
  return safeJSON(raw, { importantTopics: [], mustRevise: [], likelyQuestions: [], studyTips: [] });
}

// ═══════════════════════════════════════════════════════════
// REAL AUDIO GENERATION
// ═══════════════════════════════════════════════════════════
async function generateAudio(script, opts = {}) {
  const { language = 'en-IN', voiceStyle = 'male' } = opts;
  const dir = path.join(__dirname, '../uploads/audio');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `audio_${uuidv4()}.mp3`;
  const filePath = path.join(dir, fileName);
  const duration = Math.round(script.split(/\s+/).length / 130);
  const cleanScript = script.replace(/\[PAUSE[^\]]*\]/g, '').replace(/\[SLIDE[^\]]*\]/g, '').trim();

  // Google TTS
  const gKey = process.env.GOOGLE_TTS_API_KEY;
  if (gKey && !gKey.startsWith('your_')) {
    try {
      const vMap = {
        'en-IN': { male:'en-IN-Neural2-B', female:'en-IN-Neural2-A' },
        'hi-IN': { male:'hi-IN-Neural2-B', female:'hi-IN-Neural2-A' },
        'mr-IN': { male:'mr-IN-Standard-B', female:'mr-IN-Standard-A' },
        'ta-IN': { male:'ta-IN-Standard-B', female:'ta-IN-Standard-A' },
        'bn-IN': { male:'bn-IN-Standard-B', female:'bn-IN-Standard-A' },
        'te-IN': { male:'te-IN-Standard-B', female:'te-IN-Standard-A' },
      };
      const voice = vMap[language]?.[voiceStyle] || 'en-IN-Neural2-B';
      const chunks = splitTTS(cleanScript, 4500);
      const bufs = [];
      for (const chunk of chunks) {
        const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${gKey}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ input:{text:chunk}, voice:{languageCode:language,name:voice,ssmlGender:voiceStyle==='female'?'FEMALE':'MALE'}, audioConfig:{audioEncoding:'MP3',speakingRate:0.88,pitch:-1.0} }),
          timeout: 30000
        });
        if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`);
        const d = await r.json();
        bufs.push(Buffer.from(d.audioContent, 'base64'));
      }
      fs.writeFileSync(filePath, Buffer.concat(bufs));
      return { fileName, filePath, fileSize:fs.statSync(filePath).size, duration, provider:'Google TTS ✅' };
    } catch(e) { console.warn('[Google TTS]', e.message); }
  }

  // ElevenLabs
  const eKey = process.env.ELEVENLABS_API_KEY;
  if (eKey && !eKey.startsWith('your_')) {
    try {
      const chunks = splitTTS(cleanScript, 2500);
      const bufs = [];
      for (const chunk of chunks) {
        const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB', {
          method:'POST', headers:{'Content-Type':'application/json','xi-api-key':eKey},
          body: JSON.stringify({ text:chunk, model_id:'eleven_multilingual_v2', voice_settings:{stability:0.5,similarity_boost:0.75} }),
          timeout: 30000
        });
        if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
        bufs.push(Buffer.from(await r.arrayBuffer()));
      }
      fs.writeFileSync(filePath, Buffer.concat(bufs));
      return { fileName, filePath, fileSize:fs.statSync(filePath).size, duration, provider:'ElevenLabs ✅' };
    } catch(e) { console.warn('[ElevenLabs]', e.message); }
  }

  // Placeholder with full script embedded
  const mp3 = Buffer.concat([
    Buffer.from([0x49,0x44,0x33,0x03,0,0,0,0,0,0]),
    ...Array(15).fill(Buffer.from([0xFF,0xFB,0x90,0,...new Array(413).fill(0)]))
  ]);
  fs.writeFileSync(filePath, mp3);
  return {
    fileName, filePath, fileSize: mp3.length, duration, provider: 'placeholder',
    note: `🎙️ To get REAL audio:\n1. Google TTS (FREE 1M chars/month):\n   - Go to console.cloud.google.com\n   - Enable "Cloud Text-to-Speech API"\n   - Create API Key → add GOOGLE_TTS_API_KEY to .env\n\n2. ElevenLabs (FREE 10K chars/month):\n   - Go to elevenlabs.io\n   - Profile → API Key → add ELEVENLABS_API_KEY to .env`
  };
}

function splitTTS(text, max) {
  const chunks = []; let cur = '';
  for (const s of text.split(/(?<=[.!?।])\s+/)) {
    if ((cur+s).length > max) { if (cur.trim()) chunks.push(cur.trim()); cur = s; }
    else cur += ' ' + s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, max)];
}


// ── LESSON PLAN (Feature #23) ─────────────────────────
async function generateLessonPlan(text, title, subject, weeks=4, hoursPerWeek=3) {
  const raw = await callAI(sysPrompt(),
    `Create a ${weeks}-week lesson plan from this document.
Title: ${title} | Subject: ${subject} | ${hoursPerWeek} hrs/week

FORMAT:
# Lesson Plan: ${title}
Duration: ${weeks} weeks | Hours/week: ${hoursPerWeek}

## Week 1
### Session 1 (${hoursPerWeek/3} hr)
**Topic:** [topic from document]
**Learning Objectives:** [2-3 objectives]
**Teaching Method:** Lecture + Discussion
**Activities:** [activity]
**Assessment:** [quick quiz/assignment]

...continue for all weeks...

## Assessment Plan
[weekly + final assessment plan]

All content from document only.
Document: ${text.slice(0,8000)}`, 3000);
  return raw || `Lesson Plan: ${title}

Weeks: ${weeks}
Subject: ${subject}

${text.slice(0,500)}`;
}

// ── ASSIGNMENT GENERATOR (Feature #24) ───────────────
async function generateAssignment(text, title, subject, lang='English') {
  const raw = await callAI(sysPrompt(lang),
    `Generate a comprehensive assignment from this document.
Title: ${title} | Subject: ${subject}

FORMAT:
# Assignment: ${title}
Submission Date: [2 weeks from today]
Total Marks: 30

## Part A — Short Questions (10 marks)
Q1. [2-mark question from document]
Q2. [2-mark question]
Q3. [3-mark question]
Q4. [3-mark question]

## Part B — Long Questions (20 marks)
Q5. [10-mark detailed question — explain + example + diagram description]
Q6. [10-mark question — application from document]

## Instructions
1. Answer all questions
2. Support with examples from the document
3. Diagrams where necessary

Document: ${text.slice(0,8000)}`, 2500);
  const content = raw || `Assignment: ${title}

Subject: ${subject}

${text.slice(0,300)}`;
  if (lang !== 'English') return translateText(content, lang);
  return content;
}


module.exports = {
  callAI, analyzeImage, translateText,
  generateNotes, generateSummary, generateFlashcards, generateQuestions,
  generateQuestionPaper, generateHandwrittenNotes, generatePodcast,
  generateVideoScript, generatePPT, generateMindmap, generateVocabulary,
  answerChat, generateAudio, generateImportantQuestions, generateLessonPlan, generateAssignment
};
