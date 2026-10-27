const { resolveOutputLanguage, detectTextLanguage, SUPPORTED_LANGUAGES } = require('./ocr/languageDetectionService');
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
// AI CALL — Google Gemini primary, Groq / Claude fallback
// ═══════════════════════════════════════════════════════════

// Provider cooldown tracking — prevents hammering exhausted or rate-limited APIs
const providerCooldowns = {
  gemini: 0,
  groq: 0,
  claude: 0
};

async function callAI(systemPrompt, userPrompt, maxTokens = 3000) {
  const keys = {
    gemini: process.env.GEMINI_API_KEY,
    groq:   process.env.GROQ_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY
  };
  const hasKey = Object.values(keys).some(k => k && !k.startsWith('your_'));
  if (!hasKey) {
    console.log('[AI] No API keys found — using local PDF engine.');
  }

  // 1. Google Gemini (PRIMARY — only if not in cooldown)
  if (keys.gemini && !keys.gemini.startsWith('your_') && Date.now() >= providerCooldowns.gemini) {
    try {
      const result = await callGemini(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Google Gemini'); return result; }
    } catch(e) {
      if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('RESOURCE_EXHAUSTED')) {
        providerCooldowns.gemini = Date.now() + 15 * 60 * 1000; // 15 mins cooldown
        console.warn('[AI] Gemini daily quota exhausted (429) — cooling down for 15m. Switching to Groq.');
      } else {
        console.warn('[Gemini]', e.message);
      }
    }
  }

  // 2. Groq (FALLBACK — only if not in cooldown)
  if (keys.groq && !keys.groq.startsWith('your_') && Date.now() >= providerCooldowns.groq) {
    try {
      const result = await callGroq(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Groq (fallback)'); return result; }
    } catch(e) {
      if (e.message.includes('429')) {
        providerCooldowns.groq = Date.now() + 45 * 1000; // 45s cooldown
        console.warn('[AI] Groq rate limited (429) — cooling down for 45s.');
      } else {
        console.warn('[Groq]', e.message);
      }
    }
  }

  // 3. Anthropic Claude (FALLBACK — only if not in cooldown)
  if (keys.claude && !keys.claude.startsWith('your_') && Date.now() >= providerCooldowns.claude) {
    try {
      const result = await callClaude(systemPrompt, userPrompt, maxTokens);
      if (result) { console.log('[AI ✅] Claude (fallback)'); return result; }
    } catch(e) {
      if (e.message.includes('credit') || e.message.includes('balance') || e.message.includes('400')) {
        providerCooldowns.claude = Date.now() + 60 * 60 * 1000; // 1h cooldown
        console.warn('[AI] Claude balance zero — disabled for 1h.');
      } else {
        console.warn('[Claude]', e.message);
      }
    }
  }

  // 4. Local PDF engine (instant fallback — 0ms)
  return null;
}

async function callGemini(system, user, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
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
            generationConfig: { maxOutputTokens: Math.min(maxTokens, 8192), temperature: 0.7 }
          }),
          timeout: 10000
        }
      );
      if (res.status === 429) {
        throw new Error('Gemini quota/rate limit exhausted (429) — switching to fallback provider');
      }
      if (!res.ok) {
        lastErr = new Error(`Gemini (${model}) ${res.status}: ${await res.text()}`);
        continue;
      }
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (text) return text;
    } catch (e) {
      lastErr = e;
      if (e.message.includes('429')) throw e; // Fail fast so callAI switches immediately
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function callGroq(system, user, maxTokens) {
  const key = process.env.GROQ_API_KEY;
  // Rotate through available Groq models if one hits rate limits (separate 8k TPM limits)
  const models = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
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
          max_tokens: Math.min(maxTokens, 4000),
          temperature: 0.7
        }),
        timeout: 25000
      });
      if (res.status === 429) {
        lastErr = new Error(`Groq (${model}) 429: TPM rate limit reached, trying next model`);
        continue; // Try next model on Groq before failing out
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

function getLanguageInstruction(targetLang = 'English', sourceLang = 'English') {
  const normTarget = resolveOutputLanguage(targetLang).name;
  const normSource = resolveOutputLanguage(sourceLang).name;

  let rule = `TARGET OUTPUT LANGUAGE: ${normTarget}.\nSOURCE DOCUMENT LANGUAGE: ${normSource}.\n`;

  if (normTarget.toLowerCase() === 'english') {
    if (normSource.toLowerCase() !== 'english') {
      rule += `The source document is in ${normSource}. Translate, explain, and write thoroughly in clear, standard English. Keep key technical terms from ${normSource} in square brackets where helpful.\n`;
    } else {
      rule += `Write in clear, standard academic English.\n`;
    }
  } else {
    rule += `Write the ENTIRE content in ${normTarget}. For technical terms, formulas, or standard academic nomenclature, you may include the English term in parentheses alongside the ${normTarget} translation.\n`;
  }

  rule += `PRESERVATION RULES:\n`;
  rule += `- Preserve all mathematical equations, scientific formulas, numerical quantities, code snippets, and proper nouns accurately.\n`;
  rule += `- Strictly produce all explanations, headings, questions, and notes in the requested target language (${normTarget}).\n`;

  return rule;
}

function sys(lang = 'English', sourceLang = 'English') {
  return `You are Notivexa AI, an advanced multilingual academic assistant for students and teachers.
CRITICAL RULE: Generate content STRICTLY from the provided document text. Do NOT add external knowledge.
${getLanguageInstruction(lang, sourceLang)}
Be thorough, accurate, structured, and exam-focused.`;
}

// ═══════════════════════════════════════════════════════════
// CONTENT GENERATORS
// ═══════════════════════════════════════════════════════════

async function generateNotes(text, title, subject, lang = 'English', docPrimaryLang = 'eng', docType = 'academic_textbook') {
  // ── Chapter-wise, comprehensive notes engine (80-120 pages target) ──
  // For large books and textbooks (up to 3M+ chars), divide into 20-30 logical modules.
  // Each module generates 3-5 pages of rich notes → total 80-120 pages.
  const targetChunks = Math.min(30, Math.max(10, Math.ceil(text.length / 80000)));
  const chunkSize = Math.ceil(text.length / targetChunks);
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));

  const langRule = getLanguageInstruction(lang, docPrimaryLang);
  let domainInstruction = 'You are an expert academic note-writer for university students.\nYour job: produce comprehensive, detailed, exam-ready study notes from each chunk of the document.';
  if (docType === 'novel_fiction' || docType === 'poetry_literature') {
    domainInstruction = 'You are an expert literary scholar and master note-taker specializing in novels, literature, and narrative drama.\nYour job: produce rich, narrative-driven study notes capturing plot milestones, character arcs, dialogues, and literary themes from each part of the book.';
  } else if (docType === 'history_biography') {
    domainInstruction = 'You are an expert historian and master biographer.\nYour job: produce detailed chronological notes detailing historical milestones, leadership figures, strategic causes, and geopolitical outcomes from each part of the work.';
  } else if (docType === 'research_paper') {
    domainInstruction = 'You are an expert academic research reviewer.\nYour job: produce structured research notes detailing problem statements, theoretical methodologies, experimental findings, and critical analysis from each section.';
  }

  const sysPrompt = `${domainInstruction}
${langRule}

FORMAT — use this EXACT structure for EVERY topic/concept/chapter found in the chunk:

## [Topic/Chapter/Section Title]

**Definition / Context:** One to two clear sentences defining the concept or setting the narrative/historical context.

**Overview / Summary:** 2-4 sentences giving a high-level explanation of mechanisms or plot/historical progression.

### Key Points
- Detailed point 1 — explain fully, include sub-details
- Detailed point 2 — explain fully
- Detailed point 3 — explain fully
- Add 5-10 bullet points. Be thorough. Each bullet should be 1-3 sentences.

### In-Depth Explanation
Write 3-6 paragraphs of clear, detailed explanation covering:
- Core principles, narrative actions, or experimental methodologies
- Step-by-step processes or dramatic progression
- Relationships between characters, entities, or concepts
- Important quotes, formulas, laws, or historical turning points (plain text, no LaTeX)

### Examples & Applications
- Real-world Example / Key Excerpt 1: (specific, practical, or textual quote)
- Real-world Example / Character Action 2: (different context or perspective)
- Practical / Thematic significance: ...

### Summary
2-3 sentences summarising the key takeaway or significance.

---

STRICT RULES:
- Ground all content directly in the provided text — do NOT invent unrelated computer science or enterprise corporate jargon
- Cover EVERY concept, character, turning point, and idea found in the text — do NOT skip anything
- Be VERBOSE and DETAILED — a reader should gain a deep understanding from your notes alone
- Write at minimum 800 words per chunk
- Do NOT use LaTeX, $ signs, or Mermaid diagrams
- Use ## for main topics, ### for sub-sections`;

  const CONCURRENCY = 3;
  const parts = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map(async (chunk, bIdx) => {
      const idx = i + bIdx;
      const promptChunk = chunk.slice(0, 8000);
      const prompt = `Generate comprehensive notes for PART ${idx + 1} of ${chunks.length}.
Title: "${title}" | Subject: "${subject}" | Document Type: "${docType}"
Language: ${lang}

For EVERY concept, chapter, or scene found in this text, write the full structured notes.
Never skip a concept. Write at least 800 words for this part.

Document Part ${idx + 1}/${chunks.length}:
${promptChunk}`;

      try {
        const result = await callAI(sysPrompt, prompt, 3500);
        if (result && result.length > 200) {
          console.log(`[Notes] Part ${idx + 1}/${chunks.length}: ${result.length} chars`);
          return result;
        } else {
          const fallback = pdf.makeDetailedChapterNotes(chunk, title, subject, idx + 1, chunks.length, docType);
          if (fallback && fallback.length > 50) return fallback;
        }
      } catch (e) {
        console.warn(`[Notes] Part ${idx + 1} fallback:`, e.message);
        try {
          const fallback = pdf.makeDetailedChapterNotes(chunk, title, subject, idx + 1, chunks.length, docType);
          if (fallback && fallback.length > 50) return fallback;
        } catch {}
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    for (const res of batchResults) {
      if (res) parts.push(res);
    }
  }

  if (parts.length === 0) {
    return pdf.makeDetailedChapterNotes(text, title, subject, 1, 1, docType);
  }

  let combined = `# ${title}\n### ${subject} — Complete Study Notes\n\n` + parts.join('\n\n---\n\n');

  if (lang !== 'English' && !containsDevanagari(combined)) {
    combined = await translateFree(combined, lang);
  }
  return combined;
}

async function generateSummary(text, title, subject, lang = 'English', docPrimaryLang = 'eng') {
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

async function generateFlashcards(text, subject, count = 10, lang = 'English', docPrimaryLang = 'eng') {
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

async function generateQuestions(text, title, subject, lang = 'English', docPrimaryLang = 'eng') {
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
  const is60Marks = totalMarks === 60 || options.paperType === '60_MARKS';
  const college = options.college || "Pillai HOC College of Engineering and Technology, Rasayani";
  const status = options.status || "(Autonomous)";
  const department = options.department || "Department of Computer Application";
  const examType = options.examType || (is60Marks ? "PRELIM EXAMINATION (Autonomous)" : (totalMarks <= 25 ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination"));
  const branchName = options.branch || options.class || options.className || "Computer Application (MCA)";
  const semesterName = options.semester || "Semester: I";
  const subjectCode = options.subjectCode || "MCA104";
  const dateStr = options.date || (is60Marks ? "04/12/2025" : "22/8/2026");
  const timeStr = options.time || (is60Marks ? "02.00 Hours" : (totalMarks <= 25 ? "10.30am - 11.30am" : "10.30am - 12.30pm"));

  const generateSingleSet = async (setNum) => {
    // Window the document across sets so each set covers different chapters/topics and stays well below TPM limits
    const chunkSize = Math.min(6000, text.length);
    const offset = sets > 1 ? Math.floor(((setNum - 1) * (text.length - chunkSize)) / (sets - 1)) : 0;
    const docSlice = text.slice(Math.max(0, offset), Math.max(0, offset) + chunkSize);

    const prompt = is60Marks ? `You are generating an official 60-marks autonomous university examination Question Paper based strictly on this document.
Subject: ${subject} | Branch: ${branchName} | Semester: ${semesterName} | Set: Set ${setNum} of ${sets}

CRITICAL REQUIREMENT: Return ONLY valid, raw JSON (no markdown formatting, no code fences, no extra text).
Match this EXACT structure matching the university paper format:
{
  "institution": "${institution}",
  "college": "${college}",
  "status": "${status}",
  "department": "${department}",
  "examType": "PRELIM EXAMINATION (Autonomous)",
  "branch": "${branchName}",
  "class": "${branchName}",
  "semester": "${semesterName}",
  "subject": "${subject}",
  "subjectCode": "${subjectCode}",
  "date": "${dateStr}",
  "time": "02.00 Hours",
  "duration": "02.00 Hours",
  "marks": "60",
  "nb": [
    "1. Q.1 is compulsory",
    "2. Attempt any Three from the remaining five questions",
    "3. Each Question carry 15 marks."
  ],
  "sections": [
    {
      "qNum": "Q.1",
      "instruction": "Attempt any 3",
      "questions": [
        { "id": "a)", "text": "...", "marks": "5", "bt": "1", "co": "Co3" },
        { "id": "b)", "text": "...", "marks": "5", "bt": "2", "co": "Co1" },
        { "id": "c)", "text": "...", "marks": "5", "bt": "4", "co": "Co2" },
        { "id": "d)", "text": "...", "marks": "5", "bt": "2", "co": "Co6" },
        { "id": "e)", "text": "...", "marks": "5", "bt": "2", "co": "Co2" },
        { "id": "f)", "text": "...", "marks": "5", "bt": "2", "co": "Co3" }
      ]
    },
    {
      "qNum": "Q.2",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "8", "bt": "2", "co": "Co2" },
        { "id": "b)", "text": "...", "marks": "7", "bt": "6", "co": "Co4" }
      ]
    },
    {
      "qNum": "Q.3",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "8", "bt": "6", "co": "Co3" },
        { "id": "b)", "text": "...", "marks": "7", "bt": "2", "co": "Co5" }
      ]
    },
    {
      "qNum": "Q.4",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "10", "bt": "5", "co": "Co5" },
        { "id": "b)", "text": "...", "marks": "5", "bt": "1", "co": "Co4" }
      ]
    },
    {
      "qNum": "Q.5",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "7", "bt": "2", "co": "Co1" },
        { "id": "b)", "text": "...", "marks": "8", "bt": "2", "co": "Co2" }
      ]
    },
    {
      "qNum": "Q.6",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "8", "bt": "1", "co": "Co6" },
        { "id": "b)", "text": "...", "marks": "7", "bt": "6", "co": "Co3" }
      ]
    }
  ],
  "courseOutcomes": [
    { "code": "CO1", "desc": "Define the key concepts and architecture of ${subject}." },
    { "code": "CO2", "desc": "Use various models and lifecycle methodologies to implement ${subject} solutions." },
    { "code": "CO3", "desc": "Demonstrate understanding of requirements analysis, specifications, and application design models." },
    { "code": "CO4", "desc": "Make use of estimation logic, sizing algorithms, and analytical computation." },
    { "code": "CO5", "desc": "Analyze the need for scheduling, critical path, and resource management." },
    { "code": "CO6", "desc": "Assess various factors influencing quality assurance, security, and project governance." }
  ],
  "btLevels": "1 Remembering, 2 Understanding, 3 Applying, 4 Analyzing, 5 Evaluating, 6 Creating.",
  "legend": "M-Marks, BT- Bloom's Taxonomy, CO-Course Outcomes."
}

RULES:
- Formulate all questions directly from the provided text content.
- Include practical scenario-based and numerical questions with tables in Q.2, Q.4, or Q.5 where appropriate.
- Ensure Q.1 has 6 sub-questions (each 5m) where student attempts any 3 (=15m), and Q.2 to Q.6 each carry 15m (student attempts any 3 = 45m). Total marks = 60.

Document Content:
${docSlice}` : `You are generating an autonomous engineering college examination Question Paper based ONLY on this document.
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
  "class": "${branchName}",
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
- Marks and totals must calculate accurately.

Document:
${docSlice}`;

    let paperData = null;
    try {
      const result = await callAI('Return ONLY valid JSON.', prompt, is60Marks ? 3000 : 1200);
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

async function generateHandwrittenNotes(text, title, subject, lang = 'English', docPrimaryLang = 'eng', docType = 'academic_textbook') {
  // Target comprehensive multi-page notes (8–20+ pages):
  // Dynamically divide text into 3 to 10 substantial chapters/modules
  const targetChunks = Math.max(3, Math.min(10, Math.ceil(text.length / 10000)));
  const chunkSize = Math.ceil(text.length / targetChunks);
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));

  const langRule = getLanguageInstruction(lang, docPrimaryLang);
  let domainPrompt = `You are an expert academic professor and master note-taker who creates comprehensive, textbook-grade study notes.
You MUST format EVERY chapter and topic found in the text using this EXACT educational hierarchy:

# Chapter [Number]: [Chapter Title]

## Topic: [Topic / Concept Name]

DEFINITION: One clear, complete, formal sentence defining the term or concept.

SUMMARY: 4-5 sentences giving a high-level overview, theoretical context, core mechanisms, and importance.

### Subtopic: Theoretical Foundation & Mechanics
EXPLANATION:
- Detailed point 1: Full technical explanation with mechanisms and reasoning
- Detailed point 2: Deep dive into the process or structure with clear sub-points
- Detailed point 3: Dependencies, operational rules, and interactions
- Provide 6-10 bullet points per topic. Never abbreviate.

### Subtopic: Comparative Specifications & Parameters
| Parameter / Concept | Key Characteristic | Practical Implementation |
|---|---|---|
| Aspect 1 | Primary theoretical rule | Operational role in system |
| Aspect 2 | Quantitative threshold | Real-world optimization |

### Subtopic: Practical Applications & Case Studies
EXAMPLE:
- Practical Application 1: Real-world practical use case
- Practical Application 2: Industry or scientific case study
- Key Takeaway: High-scoring advice and essential principles`;

  if (docType === 'novel_fiction' || docType === 'poetry_literature') {
    domainPrompt = `You are an expert literary scholar and master note-taker who creates rich, narrative study notes for literature, novels, and drama.
You MUST format EVERY chapter, scene, or act found in the text using this EXACT literary hierarchy:

# Chapter [Number]: [Chapter Title / Episode]

## Topic: [Plot Milestone, Character Arc, or Scene Name]

DEFINITION: 2-3 sentences establishing the scene, atmosphere, emotional tone, and dramatic context.

SUMMARY: 4-5 sentences detailing the narrative events, dialogue conflicts, character actions, and consequences.

### Subtopic: Key Events & Plot Progression
EXPLANATION:
- Narrative Action 1: Key event or character action in this chapter
- Narrative Action 2: Turning point, dialogue exchange, or emotional struggle
- Narrative Action 3: Character motivations, inner conflicts, and reactions
- Narrative Action 4: Social, familial, or political tensions in the scene
- Provide 6-10 bullet points per topic detailing the actual story.

### Subtopic: Characters & Narrative Significance
| Character / Figure | Dramatic Role & Allegiance | Action & Emotional Significance |
|---|---|---|
| Character 1 | Main protagonist / key role | Key decision or moral dilemma |
| Character 2 | Supporting figure / rival | Interaction and dramatic tension |

### Subtopic: Themes, Motifs & Literary Insights
EXAMPLE:
- Excerpt / Dialogue: Direct notable dialogue or impactful quote from this chapter
- Thematic Analysis: Core literary theme (e.g., courage, sacrifice, loyalty, duty, grief)
- Literary Takeaway: Author's narrative craft and character evolution`;
  } else if (docType === 'history_biography') {
    domainPrompt = `You are an expert historian and master biographer who creates deep chronological study notes.
You MUST format EVERY historical phase or chapter found in the text using this EXACT historical hierarchy:

# Chapter [Number]: [Historical Era / Phase / Campaign]

## Topic: [Historical Event, Leader, or Turning Point]

DEFINITION: 2-3 sentences establishing the geopolitical theater, period, and historical situation.

SUMMARY: 4-5 sentences describing the chronological progression of events, strategic battles, or political shifts.

### Subtopic: Chronological Progression & Strategic Decisions
EXPLANATION:
- Historical Milestone 1: Concrete historical occurrence and military/political moves
- Historical Milestone 2: Treaties, alliances, diplomacy, or administrative policies
- Historical Milestone 3: Leadership decisions, courage, resistance, or crises
- Provide 6-10 bullet points per topic grounded in the text.

### Subtopic: Key Historical Figures & Leadership
| Historical Figure | Role & Office | Contribution & Historic Impact |
|---|---|---|
| Leader 1 | Sovereign / Commander | Strategic leadership and decisive actions |
| Leader 2 | Statesman / Ally | Regional influence and diplomatic role |

### Subtopic: Causes, Outcomes & Strategic Legacy
EXAMPLE:
- Strategic Cause: Primary socio-political or military catalyst
- Historical Outcome: Immediate effect on sovereignty, society, and territory
- Lasting Legacy: Civilizational significance and historical lessons`;
  } else if (docType === 'research_paper') {
    domainPrompt = `You are an expert scientific researcher and academic reviewer.
You MUST format EVERY paper section using this EXACT research hierarchy:

# Section [Number]: [Section Title / Problem Area]

## Topic: [Research Problem, Methodology, or Finding]

DEFINITION: Clear statement of the research problem, hypothesis, or theoretical foundation.

SUMMARY: 4-5 sentences summarizing the experimental formulation, pipeline, and findings.

### Subtopic: Methodology & Theoretical Framework
EXPLANATION:
- Methodological Step 1: Formal mathematical definition or experimental design
- Methodological Step 2: Algorithmic pipeline, dataset, or laboratory apparatus
- Methodological Step 3: Theoretical assumptions, control variables, and metrics
- Provide 6-10 bullet points per section.

### Subtopic: Comparative Evaluation & Metrics
| Parameter / Metric | Experimental Approach | Empirical Observation |
|---|---|---|
| Metric 1 | Proposed Technique | Measurable performance or outcome |
| Metric 2 | Baseline Standard | Comparative difference and analysis |

### Subtopic: Findings, Limitations & Implications
EXAMPLE:
- Empirical Finding: Primary quantitative or qualitative discovery
- Methodological Limitation: Constraints and experimental boundaries
- Research Takeaway: Scientific contribution and future directions`;
  }

  const sysPrompt = `${domainPrompt}
${langRule}

RULES:
- Ground EVERY point directly in the provided text. NEVER insert unrelated computer science or corporate templates into literature or history
- Always use the EXACT section structure: # Chapter, ## Topic, DEFINITION:, SUMMARY:, ### Subtopic, EXPLANATION:, Markdown Tables, EXAMPLE:, and ---
- Markdown Tables MUST use standard syntax with | pipes and |---|---| separator
- Do NOT generate ASCII flowcharts or artificial code art
- Do NOT use LaTeX or $ signs — write in readable plain text
- Cover EVERY concept, character, and event in this document part — do NOT skip anything
- Write at least 1,000 words per chunk across 3 to 5 distinct concepts`;

  const CONCURRENCY = 2;
  const parts = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map(async (chunk, bIdx) => {
      const idx = i + bIdx;
      const promptChunk = chunk.slice(0, 10000);
      const prompt = `Generate comprehensive, multi-page handwritten study notes for PART ${idx + 1} of ${chunks.length}.
Title: "${title}" | Subject: "${subject}" | Document Type: "${docType}" | Language: ${lang}

For EVERY concept, chapter, or scene found in the text below, write the COMPLETE structured note:
# Chapter ${idx + 1}: [Chapter / Module Name]
## Topic: [Concept / Scene Name]
DEFINITION: ...
SUMMARY: ...
### Subtopic: ...
EXPLANATION:
- ...
### Subtopic: ...
| ... | ... | ... |
|---|---|---|
| ... | ... | ... |
### Subtopic: ...
EXAMPLE:
- ...
---

Cover at least 3 to 5 distinct topics found in this document part. Do NOT summarise briefly.
Write at minimum 1,000 words for this part.

Document Part ${idx + 1}/${chunks.length}:
${promptChunk}`;

      try {
        const result = await callAI(sysPrompt, prompt, 4000);
        if (result && result.length > 250) {
          console.log(`[HW Notes] Part ${idx + 1}/${chunks.length}: ${result.length} chars`);
          return result;
        } else {
          const fallback = pdf.makeHandwrittenChapterNotes(chunk, title, subject, idx + 1, chunks.length, docType);
          if (fallback && fallback.length > 50) return fallback;
        }
      } catch (e) {
        console.warn(`[HW Notes] Part ${idx + 1} fallback:`, e.message);
        try {
          const fallback = pdf.makeHandwrittenChapterNotes(chunk, title, subject, idx + 1, chunks.length, docType);
          if (fallback && fallback.length > 50) return fallback;
        } catch {}
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);
    for (const res of batchResults) {
      if (res) parts.push(res);
    }
  }

  if (parts.length === 0) {
    return pdf.makeHandwrittenChapterNotes(text, title, subject, 1, 1, docType);
  }

  let combined = `# ${title}\n## ${subject}\n\n` + parts.join('\n\n---\n\n');

  if (lang !== 'English' && !containsDevanagari(combined)) {
    combined = await translateFree(combined, lang);
  }
  return combined;
}

// Generates professional, document-grounded animated classroom lecture Shorts script
async function generateVideoScript(text, title, subject, lang = 'English', docPrimaryLang = 'eng') {
  const CHUNK = 8000;
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  const toProcess = chunks.slice(0, 1); // 1 chunk for a 45-60 second educational Short

  const sysPrompt = `You are a professional educational scriptwriter and academic animator.
CRITICAL RULES:
1. STRICT DOCUMENT GROUNDING: Use ONLY the concepts, definitions, and technical facts present in the provided document. DO NOT include generic jokes, meme humor, or unrelated comedy tropes.
2. Structure format (Professional Classroom Lecture between Professor and Student):
TOPIC: [Core Concept Name from document - max 4 words]
[BOARD POINTS]
• 1. [First key syllabus principle from document - max 6 words]
• 2. [Second key mechanism/method from document - max 6 words]
• 3. [Third key rule/impact from document - max 6 words]
[DIALOGUE]
Professor: Welcome class! Today we are analyzing [Core Concept]. Can anyone explain what problem it solves?
Student: Professor, does [Core Concept] primarily ensure [First key principle from document]?
Professor: Exactly! It establishes [Key explanation from document]. Furthermore, it [Second mechanism from document].
Student: Understood! How does this directly affect [Third rule/impact from document]?
Professor: Brilliant question! That ensures [Final technical takeaway from document]. Remember these three core principles on the board for your exam!
3. TONE: Clear, academic, engaging, easy for university/high-school students to understand.
4. Total dialogue length: 60-80 words (ideal for 25-30s educational short).`;

  const parts = [];
  for (let idx = 0; idx < toProcess.length; idx++) {
    const chunk = toProcess[idx];
    const prompt = `Write the Professional Academic Classroom Shorts script based strictly on this document.
Title: ${title} | Subject: ${subject}

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

async function generatePPT(text, title, subject, lang = 'English', docPrimaryLang = 'eng') {
  const prompt = `Create a high-impact, professional academic PowerPoint presentation from this document.
Title: "${title}" | Subject: ${subject} | Language: ${lang}

Return ONLY valid JSON matching this EXACT structure:
{
  "title": "${title.slice(0, 70)}",
  "subtitle": "Comprehensive Academic Presentation",
  "slides": [
    {
      "slideNumber": 1,
      "layout": "title",
      "category": "INTRODUCTION",
      "title": "Comprehensive Topic Overview",
      "keyTakeaway": "An intuitive, high-value 1-sentence summary of the core thesis.",
      "bullets": [
        "Core Overview: Detailed explanation of the primary subject area and objectives.",
        "Target Scope: Key concepts, analytical methodologies, and scope of study.",
        "Significance: Why mastering this topic is essential for practical applications."
      ],
      "analogy": "A blueprint serves as the master guide before constructing complex architectures.",
      "speakerNotes": "Introduce the document and establish context for the core syllabus principles."
    },
    {
      "slideNumber": 2,
      "layout": "two-column",
      "category": "CORE PRINCIPLE",
      "title": "Theoretical Foundations & Architecture",
      "keyTakeaway": "Clear takeaway explaining the foundational rule or definition.",
      "bullets": [
        "Foundational Theory: Core principles, axioms, and deterministic rules governing the domain.",
        "Resource Requirements: Domain bounds, input prerequisites, and expected yields.",
        "Operational Constraints: Performance trade-offs, stability thresholds, and error margins.",
        "Practical Implication: How this mechanism enforces consistency across real systems."
      ],
      "analogy": "A recipe describes a step-by-step procedure with finite ingredients and a guaranteed termination point.",
      "speakerNotes": "Walk students through the operational criteria and historical rationale."
    },
    {
      "slideNumber": 3,
      "layout": "process",
      "category": "STEP-BY-STEP",
      "title": "Execution Pipeline & Workflow",
      "keyTakeaway": "Sequential phases required to transform raw input into verified output.",
      "bullets": [
        "Phase 1: Input ingestion, verification, and boundary validation.",
        "Phase 2: Algorithmic transformation, optimization, and state transitions.",
        "Phase 3: Error checking, convergence assertion, and exception recovery.",
        "Phase 4: Output generation, resource release, and system notification."
      ],
      "analogy": "An automated assembly line where each station performs a distinct deterministic check.",
      "speakerNotes": "Trace the step-by-step execution flow on the chalkboard for students."
    },
    {
      "slideNumber": 4,
      "layout": "table",
      "category": "COMPARATIVE ANALYSIS",
      "title": "Methodology Specifications & Trade-offs",
      "keyTakeaway": "Comparison of primary approaches against complexity, latency, and scalability.",
      "bullets": [
        "Model Comparison: Contrasting primary architectural paradigms.",
        "Efficiency Metrics: Analysis of best, average, and worst-case performance.",
        "Selection Criteria: Guidelines for choosing the optimal strategy in production."
      ],
      "table": [
        ["Parameter / Model", "Approach A", "Approach B"],
        ["Time Complexity", "O(log n) bounded", "O(n) linear search"],
        ["Memory Footprint", "O(1) in-place", "O(n) auxiliary buffer"],
        ["Implementation Effort", "Moderate (tree-based)", "Minimal (iterative)"]
      ],
      "analogy": "Comparing a highway vs a city road: one offers higher throughput with stricter entry rules.",
      "speakerNotes": "Highlight the trade-off table. Examiners frequently test these specific metrics."
    }
  ]
}

Structure Rules:
- Generate 10 to 15 comprehensive, topic-wise slides covering the entire syllabus systematically.
- "layout" MUST vary among: "title", "cards", "two-column", "process", "diagram", "table", "summary".
- "category" MUST be one of: "INTRODUCTION", "CORE PRINCIPLE", "STEP-BY-STEP", "DEEP DIVE", "COMPARATIVE ANALYSIS", "QUICK SUMMARY", "CASE STUDY".
- "keyTakeaway" MUST be a single, punchy 1-sentence synthesis (do NOT prepend "KEY TAKEAWAY:").
- "bullets" MUST be 3 to 4 detailed points, EACH starting with a bold label prefix like "Label: Explanation..."
- When layout is "table", provide a concise 3-4 row comparison table in "table".
- "analogy" MUST be an intuitive real-world analogy or practical mental model (do NOT prepend "REAL-WORLD ANALOGY:").
- "speakerNotes" MUST provide 2-3 sentences of lecture talking points.
- Ground all content strictly in the document text.

Document:
${text.slice(0, 10000)}`;

  const result = await callAI('Return only valid JSON.', prompt, 3500);
  const data = parseJSON(result, null);
  if (data?.slides?.length > 0) {
    data.slides = data.slides.map((s, idx) => ({
      slideNumber: s.slideNumber || idx + 1,
      layout: s.layout || (idx === 0 ? 'title' : idx === data.slides.length - 1 ? 'summary' : (idx % 3 === 0 ? 'two-column' : (idx % 4 === 0 ? 'process' : 'cards'))),
      category: (s.category || (idx === 0 ? 'INTRODUCTION' : idx === data.slides.length - 1 ? 'QUICK SUMMARY' : 'CORE PRINCIPLE')).toUpperCase(),
      title: s.title || `Slide ${idx + 1}`,
      keyTakeaway: (s.keyTakeaway || s.takeaway || '').replace(/^KEY TAKEAWAY:\s*/i, '').trim(),
      bullets: Array.isArray(s.bullets) ? s.bullets.map(b => typeof b === 'string' ? b.trim() : String(b)) : [],
      table: Array.isArray(s.table) ? s.table : null,
      analogy: (s.analogy || s.realWorldAnalogy || '').replace(/^(REAL-WORLD ANALOGY|KEY INSIGHT):\s*/i, '').trim(),
      speakerNotes: s.speakerNotes || ''
    }));
    return data;
  }
  return pdf.makePPT(text, title, subject);
}

async function generateMindmap(text, title, lang = 'English') {
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

async function generateVocabulary(text, subject, lang = 'English', docPrimaryLang = 'eng') {
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
async function answerChat(question, docText, history = [], outputLang = 'english', docPrimaryLang = 'eng') {
  if (!docText || docText.trim().length < 30) {
    return "Please select a PDF document first. I can only answer questions based on your uploaded document content.";
  }

  const histText = history.slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`).join('\n\n');
  const targetInfo = resolveOutputLanguage(outputLang, docPrimaryLang);
  const qAnalysis = detectTextLanguage(question);
  const responseLanguage = (outputLang && outputLang.toLowerCase() !== 'english')
    ? targetInfo.name
    : (qAnalysis.primaryLanguage !== 'eng' ? resolveOutputLanguage(qAnalysis.primaryLanguage).name : 'English');

  const langPrompt = getLanguageInstruction(responseLanguage, docPrimaryLang);

  const prompt = `You are an expert AI Tutor. Answer the student's question THOROUGHLY and COMPLETELY.

DOCUMENT CONTENT (from uploaded PDF):
${docText.slice(0, 10000)}

CONVERSATION HISTORY:
${histText}

STUDENT QUESTION: ${question}

LANGUAGE INSTRUCTIONS:
${langPrompt}

ANSWER REQUIREMENTS:
1. Give a DETAILED, COMPLETE answer (at least 150-200 words)
2. Respond in ${responseLanguage}
3. If found in document: explain the concept fully with examples
4. If it's a definition: give the definition + explanation + example
5. If it's a formula: write it out + explain each component + show usage
6. If it's a process: give step-by-step explanation
7. Always relate back to exam context
8. Use clear, friendly, educational tone
9. If question NOT in document: say "This specific information is not in your uploaded document" (in ${responseLanguage}) but still try to help with what IS in the document

DO NOT give one-line answers. Be thorough like a good teacher.`;

  const result = await callAI(
    `You are a thorough, helpful AI tutor. Always give detailed, complete answers in ${responseLanguage}.`,
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

  // Extract clean spoken narration (skip [HOOK], [BODY], Visual:, Slide:, etc.)
  const narrationMatches = [...(script || '').matchAll(/Narration:\s*(.*)/gi)];
  let speakText = narrationMatches.map(m => m[1].trim()).join(' ');
  if (!speakText) {
    speakText = (script || '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/Visual:[^\n]*/gi, '')
      .replace(/Narration:\s*/gi, '')
      .replace(/Duration:[^\n]*/gi, '')
      .replace(/Title:[^\n]*/gi, '')
      .replace(/Subject:[^\n]*/gi, '')
      .replace(/Source:[^\n]*/gi, '')
      .trim();
  }
  if (!speakText) speakText = (script || '').slice(0, 500);

  // Cap narration for 25-30s educational shorts (60-80 words max for lightning-fast synthesis)
  const words = speakText.split(/\s+/);
  if (words.length > 75) {
    speakText = words.slice(0, 75).join(' ') + '.';
  }

  const durationSeconds = Math.min(30, Math.max(15, Math.round((speakText.split(/\s+/).length / 130) * 60)));

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
      
      const chunks = splitTextForTTS(speakText, 4500);
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
      console.log(`[Audio] Google TTS generated: ${fileSize} bytes, ~${Math.round(durationSeconds/60)} min`);
      return { fileName, filePath, fileSize, duration: durationSeconds, provider: 'Google TTS' };
    } catch(e) { console.warn('[Google TTS failed]', e.message); }
  }

  // ElevenLabs (free: 10,000 chars/month)
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey && !elKey.startsWith('your_')) {
    try {
      const chunks = splitTextForTTS(speakText, 2500);
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
      'en': { male: 'en-IN-PrabhatNeural',  female: 'en-IN-NeerjaNeural'  },
      'hi': { male: 'hi-IN-MadhurNeural',   female: 'hi-IN-SwaraNeural'   },
      'mr': { male: 'mr-IN-ManoharNeural',  female: 'mr-IN-AarohiNeural'  },
      'gu': { male: 'gu-IN-NiranjanNeural', female: 'gu-IN-DhwaniNeural'  },
      'bn': { male: 'bn-IN-BashkarNeural',  female: 'bn-IN-TanishaaNeural' },
      'ta': { male: 'ta-IN-ValluvarNeural', female: 'ta-IN-PallaviNeural' },
      'te': { male: 'te-IN-MohanNeural',    female: 'te-IN-ShrutiNeural'  },
      'kn': { male: 'kn-IN-GaganNeural',    female: 'kn-IN-SapnaNeural'   },
      'ur': { male: 'ur-PK-AsadNeural',     female: 'ur-PK-UzmaNeural'    },
      'ar': { male: 'ar-SA-HamedNeural',    female: 'ar-SA-ZariyahNeural' },
      'es': { male: 'es-ES-AlvaroNeural',   female: 'es-ES-ElviraNeural'  },
      'fr': { male: 'fr-FR-HenriNeural',    female: 'fr-FR-DeniseNeural'  },
      'de': { male: 'de-DE-ConradNeural',   female: 'de-DE-KatjaNeural'   },
      'zh': { male: 'zh-CN-YunxiNeural',    female: 'zh-CN-XiaoxiaoNeural'},
      'ja': { male: 'ja-JP-KeitaNeural',    female: 'ja-JP-NanamiNeural'  },
      'ko': { male: 'ko-KR-InJoonNeural',   female: 'ko-KR-SunHiNeural'   },
      'ru': { male: 'ru-RU-DmitryNeural',   female: 'ru-RU-SvetlanaNeural'}
    };
    const resolvedLangCode = resolveOutputLanguage(opts.outputLanguage || language).code;
    const voiceEntry = edgeVoiceMap[resolvedLangCode] || edgeVoiceMap[language] || edgeVoiceMap['en'];
    const voiceName = voiceEntry?.[voiceStyle] || (voiceStyle === 'male' ? 'en-IN-PrabhatNeural' : 'en-IN-NeerjaNeural');
    

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    await new Promise((res, rej) => {
      const timer = setTimeout(() => {
        rej(new Error('Edge TTS WebSocket timeout (3.5s limit reached, fast fallback)'));
      }, 3500);

      try {
        const streamObj = tts.toStream(speakText);
        const audioStream = streamObj.audioStream || streamObj;
        const chunks = [];
        audioStream.on('data', d => chunks.push(d));
        audioStream.on('end', () => {
          clearTimeout(timer);
          fs.writeFileSync(filePath, Buffer.concat(chunks));
          res();
        });
        audioStream.on('error', (err) => {
          clearTimeout(timer);
          rej(err);
        });
      } catch (err) {
        clearTimeout(timer);
        rej(err);
      }
    });

    const fileSize = fs.statSync(filePath).size;
    console.log(`[Audio] Edge TTS done: ${fileSize} bytes — voice: ${voiceName}`);
    return {
      fileName, filePath, fileSize,
      duration: durationSeconds,
      provider: 'Microsoft Edge TTS',
      voice: voiceName,
      note: null
    };
  } catch (e) {
    console.warn('[Edge TTS Error]', e.message);
  }

  // Fallback — Google Translate hidden endpoint (female only, fast & reliable)
  try {
    console.log('[Audio] Fallback: Google Translate TTS...');
    const sentences = speakText.split(/(?<=[.!?\n]+)/g);
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
    const langCode = (language === 'hi-IN') ? 'hi' : (language === 'mr-IN') ? 'mr' : (language === 'ta-IN') ? 'ta' : 'en-in';
    for (let i = 0; i < finalChunks.length; i++) {
      const txt = finalChunks[i];
      if (!txt) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(txt)}&tl=${langCode}&client=tw-ob`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
      if (r.ok) {
        if (typeof r.buffer === 'function') bufs.push(await r.buffer());
        else bufs.push(Buffer.from(await r.arrayBuffer()));
      } else {
        throw new Error(`Google Translate TTS blocked or failed (${r.status})`);
      }
      await new Promise(res => setTimeout(res, 30));
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

  // Safe audio fallback via synthetic tone if completely offline/blocked
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    await new Promise((res, rej) => {
      ffmpeg()
        .input(`anoisesrc=d=30:c=pink:a=0.01`)
        .inputFormat('lavfi')
        .output(filePath)
        .on('end', res)
        .on('error', rej)
        .run();
    });
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    return {
      fileName, filePath, fileSize,
      duration: 30,
      provider: 'Synthetic Audio Fallback',
      note: 'Audio narration fallback generated.',
      script
    };
  } catch(e) {
    console.warn('[Synthetic Audio Error]', e.message);
  }

  // Final fallback if everything fails
  return { 
    fileName, 
    filePath, 
    fileSize: 0, 
    duration: durationSeconds, 
    provider: 'None', 
    note: 'TTS Generation unavailable.',
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



async function ocrImageBuffer(imageInput, mimeType = 'image/png') {
  const { recognizeImage } = require('./ocr/ocrService');
  const res = await recognizeImage(imageInput, { retryOnLowConfidence: true });
  return {
    text: res.text,
    words: res.words,
    confidence: res.confidence,
    status: res.status
  };
}

async function extractFromImage(imagePath, mimeType) {
  const { extractDocumentText } = require('./ocr/textExtractionService');
  const res = await extractDocumentText(imagePath, mimeType || 'image/png');
  return {
    text: res.text,
    sections: res.sections,
    pages: res.pages || 1,
    words: res.words,
    contentHash: res.contentHash,
    ocrConfidence: res.ocrConfidence,
    extractionMethod: res.extractionMethod,
    pageResults: res.pageResults
  };
}

module.exports = {
  callAI,
  extractFromImage,
  ocrImageBuffer,
  generateNotes, generateSummary, generateFlashcards, generateQuestions,
  generateQuestionPaper, generateHandwrittenNotes, generateVideoScript,
  generatePPT, generateMindmap, generateVocabulary,
  answerChat, generateAudio, translateFree, generatePodcast
};








