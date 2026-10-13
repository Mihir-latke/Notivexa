/**
 * aiService.js — Notivexa AI Engine v2
 * 
 * FREE API PRIORITY ORDER:
 * 1. Google Gemini (free at aistudio.google.com)
 * 2. Groq (free at console.groq.com)  
 * 3. Anthropic Claude (paid)
 * 4. Local PDF engine (always works, no API needed)
 * 
 * AUDIO:
 * 1. Browser Web Speech API (completely free, no key)
 * 2. Google TTS (free tier)
 * 3. ElevenLabs (free tier)
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdf = require('./pdfEngine');

// ═══════════════════════════════════════════════════════════
// AI CALL — tries free APIs first
// ═══════════════════════════════════════════════════════════

async function callAI(systemPrompt, userPrompt, maxTokens = 3000) {
  const keys = {
    gemini: process.env.GEMINI_API_KEY,
    groq:   process.env.GROQ_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY
  };
  const hasKey = Object.values(keys).some(k => k && !k.startsWith('your_'));
  if (!hasKey) {
    console.log('[AI] No API keys found — using local PDF engine. Add GROQ_API_KEY (free) for better output.');
  }

  // 1. Groq (FREE, fastest ~500ms)
  if (keys.groq && !keys.groq.startsWith('your_')) {
    try {
      const result = await callGroq(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Groq'); return result; }
    } catch(e) { console.warn('[Groq]', e.message); }
  }

  // 2. Google Gemini (FREE)
  if (keys.gemini && !keys.gemini.startsWith('your_')) {
    try {
      const result = await callGemini(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Google Gemini'); return result; }
    } catch(e) { console.warn('[Gemini]', e.message); }
  }

  // 3. Anthropic Claude
  if (keys.claude && !keys.claude.startsWith('your_')) {
    try {
      const result = await callClaude(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Claude'); return result; }
    } catch(e) { console.warn('[Claude]', e.message); }
  }

  // 4. Local PDF engine (always works)
  return null;
}

async function callGemini(system, user, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  const models = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
          }),
          timeout: 30000
        }
      );
      if (!res.ok) {
        lastErr = new Error(`Gemini (${model}) ${res.status}: ${await res.text()}`);
        continue;
      }
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (text) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function callGroq(system, user, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          max_tokens: Math.min(maxTokens, 1500),
          temperature: 0.7
        }),
        timeout: 15000
      });
      if (res.status === 429) {
        throw new Error('Groq 429 (TPM rate limit reached) — switching to fallback provider');
      }
      if (!res.ok) {
        lastErr = new Error(`Groq (${model}) ${res.status}: ${await res.text()}`);
        continue;
      }
      const d = await res.json();
      const content = d.choices?.[0]?.message?.content || d.choices?.[0]?.message?.reasoning || null;
      if (content) return content;
    } catch (e) {
      lastErr = e;
      if (e.message.includes('429')) break;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function callClaude(system, user, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    }),
    timeout: 15000
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.content?.[0]?.text || null;
}

function parseJSON(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()); }
  catch { return fallback; }
}

// ═══════════════════════════════════════════════════════════
// FREE TRANSLATION — MyMemory API (no key needed)
// ═══════════════════════════════════════════════════════════

const LANG_CODE = {
  'Hindi':   'hi', 'Marathi': 'mr', 'Bengali': 'bn',
  'Tamil':   'ta', 'Telugu':  'te', 'Gujarati':'gu',
  'Kannada': 'kn', 'Punjabi': 'pa', 'English': 'en'
};

async function translateFree(text, targetLang) {
  if (targetLang === 'English' || !text) return text;
  const code = LANG_CODE[targetLang] || 'hi';
  
  // Try Google Translate if key available
  const gKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (gKey && !gKey.startsWith('your_')) {
    try {
      const chunks = chunkText(text, 3000);
      const parts = [];
      for (const chunk of chunks) {
        const r = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${gKey}`,
          { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ q: chunk, target: code, format: 'text' }) }
        );
        if (r.ok) { const d = await r.json(); parts.push(d.data.translations[0].translatedText); }
        else throw new Error(`Google Translate ${r.status}`);
      }
      return parts.join('\n\n');
    } catch(e) { console.warn('[Google Translate]', e.message); }
  }

  // MyMemory FREE translation (no key needed, 5000 chars/day)
  try {
    const chunks = chunkText(text, 400); // MyMemory limit per request
    const parts = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${code}`;
      const r = await fetch(url, { timeout: 15000 });
      if (r.ok) {
        const d = await r.json();
        parts.push(d.responseData?.translatedText || chunk);
        await sleep(300); // rate limit respect
      }
    }
    return parts.join(' ');
  } catch(e) { 
    console.warn('[MyMemory translate]', e.message);
    return text; // return original if translation fails
  }
}

function chunkText(text, max) {
  const chunks = []; let cur = '';
  for (const word of text.split(' ')) {
    if ((cur + ' ' + word).length > max) { if (cur) chunks.push(cur.trim()); cur = word; }
    else cur += ' ' + word;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════

function sys(lang = 'English') {
  const langInstruction = lang === 'English' 
    ? 'Use clear Indian English. Add [Hindi explanation] for technical terms in square brackets.'
    : lang === 'Hindi'
    ? 'Respond ENTIRELY in Hindi (Devanagari script). Keep English technical terms but add Hindi meaning.'
    : lang === 'Marathi'
    ? 'Respond ENTIRELY in Marathi (Devanagari script). Keep English technical terms but add Marathi meaning.'
    : `Respond in ${lang}. Keep technical terms in English.`;
    
  return `You are Notivexa AI, an academic assistant for Indian students and teachers.
CRITICAL RULE: Generate content STRICTLY from the provided document text. Do NOT add external knowledge.
${langInstruction}
Be thorough, accurate, and exam-focused for CBSE/JEE/NEET/University standards.`;
}

// ═══════════════════════════════════════════════════════════
// CONTENT GENERATORS
// ═══════════════════════════════════════════════════════════

async function generateNotes(text, title, subject, lang = 'English') {
  const prompt = `Generate detailed study notes from this document.
Title: ${title} | Subject: ${subject}

FORMAT REQUIREMENTS:
## [Heading for each major topic found in document]
### [Sub-heading for sub-topics]
• Key fact or concept
• Another point
**Definition:** Term definition
> Important formula or theorem

Rules:
- Cover ALL topics found in the document in extreme detail. Do NOT skip any section.
- Expand extensively on each concept. Provide long explanations, examples, and deep analysis.
- Include ALL formulas, definitions, dates, facts exactly as written
- DO NOT use $ or $$ for math or formulas. Use plain text or Unicode.
- Ensure any tabular data uses standard Markdown tables with pipes (|) and dashes (-).
- For diagrams, use standard text-based ASCII art inside a codeblock. Do NOT use Mermaid.
- Add [simple Hindi/Indian English explanation] for difficult terms
- Do not be brief! The output must be very comprehensive, long, and thorough (at least 1500 words).
- End with ## Key Points to Remember section
- End with ## Exam Tips section

Document Content:
${text.slice(0, 35000)}`;

  const result = await callAI(sys(lang), prompt, 6000);
  
  // If Hindi/Marathi requested and AI gave English, translate
  if (lang !== 'English' && result && !containsDevanagari(result)) {
    console.log(`[Notes] Translating to ${lang}...`);
    return await translateFree(result, lang);
  }
  
  return result || pdf.makeNotes(text, title, subject);
}

async function generateSummary(text, title, subject, lang = 'English') {
  const prompt = `Write a concise summary (300-400 words) of this document.
Title: ${title} | Subject: ${subject}

Include:
- Main topics and concepts
- Key definitions
- Important formulas/facts
- What students should focus on for exams

Document:
${text.slice(0, 10000)}`;

  const result = await callAI(sys(lang), prompt, 1000);
  if (lang !== 'English' && result && !containsDevanagari(result)) {
    return await translateFree(result, lang);
  }
  return result || pdf.makeSummary(text, title, subject);
}

async function generateFlashcards(text, subject, count = 10, lang = 'English') {
  const prompt = `Generate exactly ${count} flashcard Q&A pairs from this document.
Subject: ${subject}

STRICT RULES:
- Questions and answers ONLY from document content
- Vary difficulty: some easy (definitions), some medium (concepts), some hard (application)
- Include MCQs, fill-in-blanks, and short answer types

Return ONLY valid JSON array (no other text):
[
  {"question": "Question text", "answer": "Answer text", "difficulty": "easy|medium|hard", "bloomsLevel": "remember|understand|apply|analyze"},
  ...
]

Document:
${text.slice(0, 10000)}`;

  const result = await callAI('Return only valid JSON array.', prompt, 3000);
  const cards = parseJSON(result, null);
  if (Array.isArray(cards) && cards.length > 0) return cards.slice(0, count);
  return pdf.makeFlashcards(text, subject, count);
}

async function generateQuestions(text, title, subject, lang = 'English') {
  const prompt = `Generate comprehensive practice questions from this document.
Title: ${title} | Subject: ${subject}

Generate:
### Multiple Choice Questions (5 questions × 1 mark)
For each: 4 options, mark correct with ✓

### Short Answer Questions (5 questions × 3 marks)
2-3 sentence answers expected

### Long Answer Questions (3 questions × 5 marks)  
Detailed answers expected. Include "OR" alternatives.

### Case Study / Application (2 questions × 5 marks)
Apply concepts from document to scenarios

ALL questions must be answerable from the document.
Document:
${text.slice(0, 10000)}`;

  const result = await callAI(sys(lang), prompt, 6000);
  if (lang !== 'English' && result && !containsDevanagari(result)) {
    return await translateFree(result, lang);
  }
  return result || pdf.makeQuestions(text, subject, title);
}

async function generateQuestionPaper(text, subject, totalMarks = 20, timeHours = 1, institution = "Mahatma Education Society's", lang = 'English', sets = 3, options = {}) {
  const college = options.college || "Pillai HOC College of Engineering and Technology, Rasayani.";
  const status = options.status || "(Autonomous)";
  const department = options.department || "Department of Computer Application";
  const examType = options.examType || (totalMarks <= 25 ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination");
  const className = options.class || options.className || "SY-MCA";
  const dateStr = options.date || "22/8/2026";
  const timeStr = options.time || (totalMarks <= 25 ? "10.30am - 11.30am" : "10.30am - 12.30pm");

  const generateSingleSet = async (setNum) => {
    // Window the document across sets so each set covers different chapters/topics and stays well below TPM limits
    const chunkSize = Math.min(3800, text.length);
    const offset = sets > 1 ? Math.floor(((setNum - 1) * (text.length - chunkSize)) / (sets - 1)) : 0;
    const docSlice = text.slice(Math.max(0, offset), Math.max(0, offset) + chunkSize);

    const prompt = `You are generating an autonomous engineering college examination Question Paper based ONLY on this document.
Subject: ${subject}
Set: Set ${setNum} of ${sets}
Total Marks: ${totalMarks} | Duration: ${timeHours} Hour(s)

CRITICAL REQUIREMENT: Return ONLY valid, raw JSON (no markdown formatting, no code fences, no extra text).
Match this EXACT structure:
{
  "institution": "${institution}",
  "college": "${college}",
  "status": "${status}",
  "department": "${department}",
  "examType": "${examType}",
  "subject": "${subject}",
  "class": "${className}",
  "date": "${dateStr}",
  "time": "${timeStr}",
  "duration": "${timeHours}Hr",
  "marks": "${totalMarks}",
  "note": "Note: Assume suitable data wherever necessary.",
  "sections": [
    {
      "qNum": "1",
      "instruction": "${totalMarks <= 25 ? 'Attempt Any Five out of Six' : 'Attempt Any Four out of Six'}",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO3", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L1" },
        { "id": "C.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO2", "bl": "L2" },
        { "id": "D.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L6" },
        { "id": "E.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L2" },
        { "id": "F.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO3", "bl": "L2" }
      ]
    },
    {
      "qNum": "2",
      "instruction": "Attempt Any One",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO1", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO3", "bl": "L2" }
      ]
    },
    {
      "qNum": "3",
      "instruction": "Attempt Any One",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO3", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${totalMarks <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO2", "bl": "L2" }
      ]
    }
  ]
}

STRICT EXAM RULES:
- All questions MUST be strictly extracted from the provided document content.
- Include realistic Course Outcome tags (CO1, CO2, CO3, CO4, CO5) and Bloom's Taxonomy Level tags (L1, L2, L3, L4, L5, L6).
- For SET ${setNum}, formulate completely fresh and distinct questions different from other sets.
- Marks and totals must calculate accurately: Section 1 (5x2=10) + Section 2 (1x5=5) + Section 3 (1x5=5) = 20 Marks.

Document:
${docSlice}`;

    let paperData = null;
    try {
      const result = await callAI('Return ONLY valid JSON.', prompt, 1200);
      paperData = parseJSON(result, null);
    } catch (e) {
      console.warn(`[Paper Set ${setNum}] AI generation warning:`, e.message);
    }

    if (!paperData || !paperData.sections || !Array.isArray(paperData.sections)) {
      const fallbackStr = pdf.makeQuestionPaper(docSlice, subject, totalMarks, timeHours, institution, options);
      paperData = parseJSON(fallbackStr, null);
    }

    // Safely translate question text if non-English requested
    if (lang !== 'English' && paperData) {
      try {
        for (const sec of paperData.sections || []) {
          for (const q of sec.questions || []) {
            if (!containsDevanagari(q.text)) {
              q.text = await translateFree(q.text, lang);
            }
          }
        }
      } catch (e) {
        console.warn('Translation warning for question paper:', e.message);
      }
    }

    const paperJsonStr = JSON.stringify(paperData, null, 2);
    return {
      setNumber: setNum,
      content: paperJsonStr,
      structured: paperData
    };
  };

  const setsArray = [];
  for (let s = 1; s <= sets; s++) {
    const res = await generateSingleSet(s);
    setsArray.push(res);
    if (s < sets) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return setsArray;
}

async function generateHandwrittenNotes(text, title, subject, lang = 'English') {
  // Split text into ~6000-char chunks so we do multiple AI passes = many more pages
  const CHUNK = 6000;
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));

  // Limit to 12 chunks max (covers most docs without timeout)
  const toProcess = chunks.slice(0, 12);

  const sysPrompt = `You are an expert academic note-taker who writes beautifully structured study notes.
You MUST format EVERY topic using this EXACT section structure:

## Topic Name

DEFINITION: One clear, concise sentence defining the term or concept.

SUMMARY: 2-3 sentences giving a high-level overview of the topic.

EXPLANATION:
- Detailed point 1 with full explanation
- Detailed point 2 with full explanation
- Detailed point 3 with full explanation
- Add 4-8 bullet points — be exhaustive, teach as if the student is new

DIAGRAM: NodeA → NodeB → NodeC
(Write a linear flow using → arrows. Use real concept names from the topic. Max 5 nodes.)

EXAMPLE:
- Real-world Example 1: concrete, practical, specific
- Real-world Example 2: another specific example the student can relate to

---

RULES:
- Always use the EXACT labels: DEFINITION:, SUMMARY:, EXPLANATION:, DIAGRAM:, EXAMPLE:
- DIAGRAM must always be a single line: ItemA → ItemB → ItemC (use → arrows)
- Do NOT use Mermaid, ASCII art, or code blocks for diagrams
- Do NOT use $ or LaTeX math — write formulas in plain English (e.g. "Force = Mass x Acceleration")
- Do NOT skip any section — every topic must have all 6 sections
- Use ## for topic headings, ### for sub-topics
- Write at least 600 words per chunk — EXPAND everything, never summarize briefly`;

  const parts = [];
  for (let idx = 0; idx < toProcess.length; idx++) {
    const chunk = toProcess[idx];
    const prompt = `Generate fully structured handwritten notes for PART ${idx+1} of ${toProcess.length}.
Title: ${title} | Subject: ${subject}

For EVERY concept found in the text below, write the full structure:
## Concept Name
DEFINITION: ...
SUMMARY: ...
EXPLANATION:
- ...
DIAGRAM: A → B → C
EXAMPLE:
- ...
---

Never abbreviate. Cover every formula, law, theorem, and concept found.
Document Part ${idx+1}:
${chunk}`;

    try {
      const result = await callAI(sysPrompt, prompt, 8000);
      if (result && result.length > 100) {
        parts.push(result);
        console.log(`[HW Notes] Part ${idx+1}/${toProcess.length}: ${result.length} chars`);
      }
    } catch(e) {
      console.warn(`[HW Notes] Part ${idx+1} failed:`, e.message);
    }
  }

  if (parts.length === 0) {
    // Fallback to local engine
    return pdf.makeNotes(text, title, subject);
  }

  let combined = `# ${title}\n## ${subject}\n\n` + parts.join('\n\n---\n\n');

  if (lang !== 'English' && !containsDevanagari(combined)) {
    combined = await translateFree(combined, lang);
  }
  return combined;
}

// FIXED: Generate YouTube Shorts style vertical video script
async function generateVideoScript(text, title, subject, lang = 'English') {
  const CHUNK = 8000;
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  const toProcess = chunks.slice(0, 1); // 1 chunk for a 60-second Short

  const sysPrompt = `You are a viral YouTube Shorts / TikTok scriptwriter.
RULES:
- Write a fast-paced, highly engaging 60-second educational script.
- Output EXACTLY in this format for the whole script:
[HOOK]
Narration: (Catchy first sentence to grab attention)
[BODY]
Narration: (Fast, mind-blowing facts)
[OUTRO]
Narration: (Quick conclusion and call to action)
- Do NOT output anything else. Keep the total narration under 150 words.`;

  const parts = [];
  for (let idx = 0; idx < toProcess.length; idx++) {
    const chunk = toProcess[idx];
    const prompt = `Write the Shorts script for this topic.
Title: ${title} | Subject: ${subject}

Make it punchy, engaging, and suitable for a 60-second vertical video.
Use simple, mind-blowing facts. Keep sentences short.

Document Content:
${chunk}`;

    try {
      const result = await callAI(sysPrompt, prompt, 8000);
      if (result && result.length > 100) {
        parts.push(result.trim());
        console.log(`[Video Script] Part ${idx+1}/${toProcess.length}: ${result.length} chars`);
      }
    } catch(e) {
      console.warn(`[Video Script] Part ${idx+1} failed:`, e.message);
    }
  }

  let combined = parts.length > 0 ? parts.join('\n\n') : pdf.makeVideoScript(text, title, subject);

  // Fix slide numbers incrementally
  let slideCounter = 1;
  combined = combined.replace(/\[SLIDE \d+:/gi, () => `[SLIDE ${slideCounter++}:`);

  if (lang !== 'English' && !containsDevanagari(combined)) {
    combined = await translateFree(combined, lang);
  }
  return combined;
}

async function generatePPT(text, title, subject, lang = 'English') {
  const prompt = `Create a detailed presentation from this document.
Title: "${title}" | Subject: ${subject}

Return ONLY valid JSON:
{
  "title": "${title}",
  "subtitle": "Based on your uploaded document",
  "slides": [
    {
      "slideNumber": 1,
      "title": "slide title",
      "bullets": ["detailed point 1 (full sentence)", "point 2", "point 3", "point 4", "point 5"],
      "speakerNotes": "Detailed notes for speaker - at least 3 sentences explaining the content",
      "layout": "title|content|two-column"
    }
  ]
}

Rules:
- 10-15 slides covering ALL document content
- Each slide has 4-6 detailed bullet points (full sentences not fragments)
- Speaker notes must be detailed (50+ words each)
- Only use document content

Document:
${text.slice(0, 10000)}`;

  const result = await callAI('Return only valid JSON.', prompt, 3000);
  const data = parseJSON(result, null);
  if (data?.slides?.length > 0) return data;
  return pdf.makePPT(text, title, subject);
}

async function generateMindmap(text, title) {
  const prompt = `Create a comprehensive mind map from this document.
Return ONLY valid JSON:
{
  "central": "${title.slice(0,40)}",
  "branches": [
    {
      "topic": "Main topic from document",
      "color": "#4F46E5",
      "subtopics": ["specific subtopic", "specific detail", "formula or fact"]
    }
  ]
}

Rules:
- 5-7 main branches covering all document topics  
- 4-6 specific subtopics per branch
- Subtopics should be actual content from document

Document:
${text.slice(0, 7000)}`;

  const result = await callAI('Return only valid JSON.', prompt, 2000);
  const data = parseJSON(result, null);
  if (data?.branches?.length > 0) return data;
  return pdf.makeMindmap(text, title);
}

async function generateVocabulary(text, subject, lang = 'English') {
  const prompt = `Extract key academic vocabulary from this document.
Subject: ${subject}

Return ONLY valid JSON array:
[
  {
    "word": "technical term from document",
    "hindi": "Hindi translation",
    "definition": "clear definition (2-3 sentences)",
    "example": "example sentence from or inspired by document",
    "context": "how it's used in Indian exams",
    "formula": "formula if applicable, else empty string"
  }
]

Extract 12-15 important terms. Only terms that actually appear in document.

Document:
${text.slice(0, 7000)}`;

  const result = await callAI('Return only valid JSON array.', prompt, 2000);
  const data = parseJSON(result, null);
  if (Array.isArray(data) && data.length > 0) return data;
  return pdf.makeVocabulary(text, subject);
}

// FIXED: Detailed chatbot that gives thorough answers
async function answerChat(question, docText, history = []) {
  if (!docText || docText.trim().length < 30) {
    return "Please select a PDF document first. I can only answer questions based on your uploaded document content.";
  }

  const histText = history.slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`).join('\n\n');
  
  const prompt = `You are an expert AI Tutor. Answer the student's question THOROUGHLY and COMPLETELY.

DOCUMENT CONTENT (from uploaded PDF):
${docText.slice(0, 10000)}

CONVERSATION HISTORY:
${histText}

STUDENT QUESTION: ${question}

ANSWER REQUIREMENTS:
1. Give a DETAILED, COMPLETE answer (at least 150-200 words)
2. If found in document: explain the concept fully with examples
3. If it's a definition: give the definition + explanation + example
4. If it's a formula: write it out + explain each component + show usage
5. If it's a process: give step-by-step explanation
6. Always relate back to exam context (CBSE/JEE/NEET tips if relevant)
7. Use Indian English style - clear, friendly, educational
8. If question NOT in document: say "This specific information is not in your uploaded document" but still try to help with what IS in the document

DO NOT give one-line answers. Be thorough like a good teacher.`;

  const result = await callAI(
    'You are a thorough, helpful AI tutor for Indian students. Always give detailed, complete answers.',
    prompt,
    1500
  );
  
  return result || pdf.answerQuestion(question, docText);
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
  const durationSeconds = Math.round((script.split(/\s+/).length / 130) * 60);

  // Google TTS (free tier: 1 million chars/month)
  const gKey = process.env.GOOGLE_TTS_API_KEY;
  if (gKey && !gKey.startsWith('your_')) {
    try {
      const vMap = {
        'en-IN': { male: 'en-IN-Neural2-B', female: 'en-IN-Neural2-A' },
        'hi-IN': { male: 'hi-IN-Neural2-B', female: 'hi-IN-Neural2-A' },
        'mr-IN': { male: 'mr-IN-Standard-B', female: 'mr-IN-Standard-A' },
        'ta-IN': { male: 'ta-IN-Standard-B', female: 'ta-IN-Standard-A' }
      };
      const voiceName = vMap[language]?.[voiceStyle] || 'en-IN-Neural2-B';
      const langCode = language.split('-')[0] + '-' + language.split('-')[1];
      
      const chunks = splitTextForTTS(script, 4500);
      const bufs = [];
      
      for (const chunk of chunks) {
        const r = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${gKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text: chunk },
              voice: { languageCode: langCode, name: voiceName, ssmlGender: voiceStyle === 'female' ? 'FEMALE' : 'MALE' },
              audioConfig: { audioEncoding: 'MP3', speakingRate: 0.88, pitch: -1.0 }
            }),
            timeout: 30000
          }
        );
        if (!r.ok) throw new Error(`Google TTS: ${r.status} ${await r.text()}`);
        const d = await r.json();
        bufs.push(Buffer.from(d.audioContent, 'base64'));
      }
      
      fs.writeFileSync(filePath, Buffer.concat(bufs));
      const fileSize = fs.statSync(filePath).size;
      console.log(`[Audio] Google TTS generated: ${fileSize} bytes, ~${duration} min`);
      return { fileName, filePath, fileSize, duration: durationSeconds, provider: 'Google TTS' };
    } catch(e) { console.warn('[Google TTS failed]', e.message); }
  }

  // ElevenLabs (free: 10,000 chars/month)
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey && !elKey.startsWith('your_')) {
    try {
      const chunks = splitTextForTTS(script, 2500);
      const bufs = [];
      
      for (const chunk of chunks) {
        const r = await fetch(
          'https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': elKey },
            body: JSON.stringify({
              text: chunk,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 }
            }),
            timeout: 30000
          }
        );
        if (!r.ok) throw new Error(`ElevenLabs: ${r.status}`);
        bufs.push(Buffer.from(await r.arrayBuffer()));
      }
      
      fs.writeFileSync(filePath, Buffer.concat(bufs));
      const fileSize = fs.statSync(filePath).size;
      return { fileName, filePath, fileSize, duration: durationSeconds, provider: 'ElevenLabs' };
    } catch(e) { console.warn('[ElevenLabs failed]', e.message); }
  }

  // ═══════════════════════════════════════════════════════════
  // 100% FREE — Microsoft Edge TTS (No API Key Required)
  // Indian Male  = en-IN-PrabhatNeural
  // Indian Female = en-IN-NeerjaNeural
  // ═══════════════════════════════════════════════════════════
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    console.log('[Audio] Using Microsoft Edge TTS (free Indian voices)...');

    const edgeVoiceMap = {
      'en-IN': { male: 'en-IN-PrabhatNeural',  female: 'en-IN-NeerjaNeural'  },
      'hi-IN': { male: 'hi-IN-MadhurNeural',   female: 'hi-IN-SwaraNeural'   },
      'mr-IN': { male: 'mr-IN-ManoharNeural',  female: 'mr-IN-AarohiNeural'  },
      'ta-IN': { male: 'ta-IN-ValluvarNeural', female: 'ta-IN-PallaviNeural' },
    };
    const voiceName = edgeVoiceMap[language]?.[voiceStyle]
      || (voiceStyle === 'male' ? 'en-IN-PrabhatNeural' : 'en-IN-NeerjaNeural');

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // Remove stage directions like [HOOK], [BODY] before speaking
    const cleanScript = script.replace(/\[[^\]]*\]/g, '').trim();

    await new Promise((res, rej) => {
      const streamObj = tts.toStream(cleanScript);
      const audioStream = streamObj.audioStream || streamObj;
      const chunks = [];
      audioStream.on('data', d => chunks.push(d));
      audioStream.on('end', () => {
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        res();
      });
      audioStream.on('error', rej);
    });

    const fileSize = fs.statSync(filePath).size;
    console.log(`[Audio] Edge TTS done: ${fileSize} bytes — voice: ${voiceName}`);
    return {
      fileName, filePath, fileSize,
      duration: durationSeconds,
      provider: 'Microsoft Edge TTS',
      voice: voiceName,
      note: `Free Indian ${voiceStyle} voice — no API key needed!`
    };
  } catch (e) {
    console.warn('[Edge TTS Error]', e.message);
  }

  // Fallback — Google Translate hidden endpoint (female only, no gender choice)
  try {
    console.log('[Audio] Fallback: Google Translate TTS...');
    const sentences = script.replace(/\[[^\]]*\]/g, '').split(/(?<=[.!?\n]+)/g);
    const finalChunks = [];
    let curr = '';
    for (const s of sentences) {
      const cleanS = s.trim();
      if (!cleanS) continue;
      if ((curr.length + cleanS.length) < 180) {
        curr += (curr ? ' ' : '') + cleanS;
      } else {
        if (curr) finalChunks.push(curr);
        if (cleanS.length >= 180) {
          const words = cleanS.split(' ');
          let temp = '';
          for (const w of words) {
            if ((temp.length + w.length) < 180) temp += (temp ? ' ' : '') + w;
            else { finalChunks.push(temp); temp = w; }
          }
          if (temp) curr = temp;
        } else { curr = cleanS; }
      }
    }
    if (curr) finalChunks.push(curr);

    const bufs = [];
    const langCode = (language === 'hi-IN') ? 'hi' : 'en-in';
    for (let i = 0; i < finalChunks.length; i++) {
      const txt = finalChunks[i];
      if (!txt) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(txt)}&tl=${langCode}&client=tw-ob`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) bufs.push(await r.buffer());
      await new Promise(res => setTimeout(res, 200));
    }
    if (bufs.length > 0) {
      fs.writeFileSync(filePath, Buffer.concat(bufs));
      const fileSize = fs.statSync(filePath).size;
      console.log(`[Audio] Fallback TTS generated: ${fileSize} bytes`);
      return { fileName, filePath, fileSize, duration: durationSeconds, provider: 'Google Translate TTS (fallback)' };
    }
  } catch (e) {
    console.warn('[Fallback TTS Error]', e.message);
  }



  // Final fallback if everything fails
  return { 
    fileName: 'none', 
    filePath: '', 
    fileSize: 0, 
    duration, 
    provider: 'None', 
    note: 'TTS Generation completely failed.',
    script
  };
}

function splitTextForTTS(text, max) {
  // Split on sentence boundaries
  const sentences = text.replace(/\[PAUSE[^\]]*\]/g, '').split(/(?<=[.!?।])\s+/);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = s;
    } else {
      cur += ' ' + s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, max)];
}

function createPlaceholderMP3(script, duration) {
  // Minimal valid MP3 with ID3v2 metadata
  const title = 'Notivexa Audio Lecture';
  const comment = `Script: ${script.slice(0, 200)}`;
  
  // ID3v2 header with metadata
  const titleFrame = encodeID3Frame('TIT2', title);
  const commentFrame = encodeID3Frame('COMM', comment);
  const allFrames = Buffer.concat([titleFrame, commentFrame]);
  
  const id3Size = encodeID3Size(allFrames.length);
  const id3Header = Buffer.from([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
    id3Size[0], id3Size[1], id3Size[2], id3Size[3]
  ]);
  
  // Generate enough silent MP3 frames for ~1 second
  const silentFrame = Buffer.from([0xFF, 0xFB, 0x90, 0x00, ...new Array(413).fill(0x00)]);
  const frames = Buffer.concat(Array(30).fill(silentFrame));
  
  return Buffer.concat([id3Header, allFrames, frames]);
}

function encodeID3Frame(id, text) {
  const enc = Buffer.from([0x03]); // UTF-8
  const content = Buffer.concat([enc, Buffer.from(text, 'utf8')]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(content.length, 0);
  return Buffer.concat([Buffer.from(id), size, Buffer.from([0x00, 0x00]), content]);
}

function encodeID3Size(n) {
  return [
    (n >> 21) & 0x7F, (n >> 14) & 0x7F,
    (n >> 7) & 0x7F, n & 0x7F
  ];
}

function containsDevanagari(text) {
  return /[\u0900-\u097F]/.test(text);
}

async function generatePodcast(text, title, subject, lang = 'English') {
  const prompt = `Write an engaging audio lecture script from this document.
Title: "${title}" | Subject: ${subject}
Length: ~8-10 minutes when spoken (about 1200-1500 words)

SCRIPT REQUIREMENTS:
- Start: "Namaste students! Welcome to Notivexa Audio Lectures."
- Introduce the topic clearly
- Explain each concept from the document with examples
- Use conversational Indian English ("Toh pehle samjhte hain...")
- Add [PAUSE 2s] between major sections
- Repeat important formulas/definitions twice
- Add exam tips from document content
- End with "Thank you for listening. Keep studying hard!"
- NO slide markers or visual references (this is audio only)

Document:
${text.slice(0, 9000)}`;

  const result = await callAI(sys(lang), prompt, 2500);
  if (lang !== 'English' && result && !containsDevanagari(result)) {
    return await translateFree(result, lang);
  }
  return result || require('./pdfEngine').makePodcastScript(text, title, subject);
}



async function extractFromImage(imagePath, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('your_')) {
    throw new Error('Gemini API key is required to extract text from images. Add GEMINI_API_KEY to .env file.');
  }

  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  
  const systemPrompt = `You are an expert OCR and document analysis AI.
Please transcribe all the text from this image accurately. 
If there are diagrams, describe them briefly.
If it is handwritten, transcribe it carefully.
Format the output clearly.`;

  const models = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-image'];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ 
              parts: [
                { text: systemPrompt },
                { inlineData: { mimeType: mimeType, data: imageBase64 } }
              ] 
            }],
            generationConfig: { maxOutputTokens: 2000, temperature: 0.1 }
          }),
          timeout: 25000
        }
      );
      if (!res.ok) {
        lastErr = new Error(`Gemini Vision (${model}) ${res.status}: ${await res.text()}`);
        continue;
      }
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text && text.length >= 10) {
        const words = text.split(/\s+/).filter(Boolean).length;
        console.log(`[Image OCR] Extracted ${words} words using ${model}`);
        const sections = [{ title: 'Image Content', content: text, wordCount: words }];
        return { text, sections, pages: 1, words };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('Could not extract meaningful text from this image.');
}

module.exports = {
  callAI,
  extractFromImage,
  generateNotes, generateSummary, generateFlashcards, generateQuestions,
  generateQuestionPaper, generateHandwrittenNotes, generateVideoScript,
  generatePPT, generateMindmap, generateVocabulary,
  answerChat, generateAudio, translateFree, generatePodcast
};








