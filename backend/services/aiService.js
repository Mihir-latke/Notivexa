const { resolveOutputLanguage, detectTextLanguage, SUPPORTED_LANGUAGES } = require('./ocr/languageDetectionService');
const { searchDocumentPassages, buildGroundingContext, extractCitationsFromText } = require('./academicRetrievalService');
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
  const models = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-pro'
  ];
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

async function generateNotes(text, title, subject, lang = 'English', docPrimaryLang = 'eng', docType = 'academic_textbook', options = {}) {
  if (typeof docType === 'object' && docType !== null) {
    options = docType;
    docType = options.docType || 'academic_textbook';
  }
  const mode = (options.mode || 'detailed').toLowerCase();
  const topicFilter = options.topic || '';
  const isRevision = mode === 'revision';
  const isExam = mode === 'exam';
  const isTopic = mode === 'topic' && Boolean(topicFilter);

  // ── Chapter-wise, comprehensive notes engine (80-120 pages target) ──
  // For large books and textbooks (up to 3M+ chars), divide into logical modules.
  const targetChunks = Math.min(30, Math.max(10, Math.ceil(text.length / 80000)));
  const chunkSize = Math.ceil(text.length / targetChunks);
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));

  const langRule = getLanguageInstruction(lang, docPrimaryLang);
  let domainInstruction = 'You are an expert academic note-writer for university students.\nYour job: produce comprehensive, detailed, exam-ready study notes from each chunk of the document.';

  if (isRevision) {
    domainInstruction = `You are a master academic revision specialist.
Your job: produce high-yield, exam-cram revision notes from each part of the document.
Every concept MUST follow this rapid-retention layout:
## [Topic/Concept Name] (Source: [Page X])
### ⚡ Core Definition & Memory Anchor
One concise, crystal-clear definition sentence with exact technical terminology.
### 📋 High-Yield Fact Sheet & Formulas
- Key Rule / Formula: (explicit notation, plain text)
- Critical Parameter / Constant: ...
- 5-7 punchy bullet points covering non-negotiable syllabus facts.
### 🎯 Step-by-Step Mechanism / Process
1. Step 1: ...
2. Step 2: ...
3. Step 3: ...
### ⚠️ Common Pitfalls & High-Risk Exam Mistakes
- Mistake: What students commonly confuse or miscalculate.
- Correction: The correct rule to follow.
### 📌 2-Minute High-Yield Exam Takeaway
2 sentences summarizing the most tested point.
---`;
  } else if (isExam) {
    domainInstruction = `You are a senior university chief examiner and paper-setter.
Your job: produce exam-oriented study notes structured around university evaluation patterns.
Every concept MUST follow this examination-focused layout:
## [Topic/Concept Name] (Source: [Page X])
### 1. High-Frequency Exam Questions & Model Answers
- **[2-Mark Question & Answer]:** Precise 2-3 sentence answer required for full credit.
- **[5-Mark Analytical Question & Answer]:** Structured explanation with points, working, and core mechanism.
- **[10-Mark Comprehensive Question & Model Answer]:** Thorough multi-paragraph breakdown with derivations, architecture, and applications.
### 2. Marking Rubrics & Step Allocation
- Step breakdown: How marks are awarded (e.g. Definition: 1M, Diagram: 2M, Working: 2M).
### 3. Key Diagrams to Draw in Exam
- Text description of exact boxes, labels, and arrows students must draw on their answer paper.
### 4. High-Yield Comparison Table
| Metric / Feature | Approach A | Approach B |
|---|---|---|
| Key Difference | ... | ... |
---`;
  } else if (isTopic) {
    domainInstruction = `You are an expert university professor giving a deep-dive tutorial on: "${topicFilter}".
Your job: produce exhaustive, mastery-level study notes covering every theoretical, algorithmic, and applied aspect of this topic from the text.
Use the 14-point academic structure adapted specifically for "${topicFilter}" with [Page X] citations.`;
  } else {
    if (docType === 'computer_science') {
      domainInstruction = 'You are a distinguished Professor of Computer Science and master technical note-writer.\nYour job: produce comprehensive, mathematically and algorithmically rigorous study notes detailing data structures, algorithmic steps, time/space complexity, and software architecture from each part of the document.';
    } else if (docType === 'novel_fiction' || docType === 'poetry_literature') {
      domainInstruction = 'You are an expert literary scholar and master note-taker specializing in novels, literature, and narrative drama.\nYour job: produce rich, narrative-driven study notes capturing plot milestones, character arcs, dialogues, and literary themes from each part of the book.';
    } else if (docType === 'history_biography') {
      domainInstruction = 'You are an expert historian and master biographer.\nYour job: produce detailed chronological notes detailing historical milestones, leadership figures, strategic causes, and geopolitical outcomes from each part of the work.';
    } else if (docType === 'research_paper') {
      domainInstruction = 'You are an expert academic research reviewer.\nYour job: produce structured research notes detailing problem statements, theoretical methodologies, experimental findings, and critical analysis from each section.';
    }
  }

  const detailedStructure = `FORMAT — use this EXACT 14-point university academic structure for EVERY topic/chapter found in the chunk:

## [Topic / Chapter Title] [Page X]

1. **Chapter Introduction & Objectives:** (2-3 sentences introducing scope, context, prerequisites, and learning outcomes) [Page X]
2. **Formal Academic Definition:** (Rigorous, formal academic definition with standard notation) [Page X]
3. **Detailed In-Depth Explanation:** (3-5 comprehensive paragraphs explaining theoretical foundations, principles, and concepts)
4. **Key Characteristics & Properties:** (Bulleted analysis of 5-8 essential properties with technical justification)
5. **Working Mechanism & Step-by-Step Process:** (Numbered sequential phases from initialization to execution and output)
6. **Important Underlying Concepts:** (Deep-dive into foundational laws, axioms, data structures, or sub-components)
7. **Algorithms & Mathematical Formulas:** (Formal equations with all variable definitions, or algorithmic steps with time/space complexity)
8. **Diagrams & Schematic Architecture:** (Textual architectural diagram with labeled components, data flow arrows, and visual layout descriptions)
9. **Worked Academic Examples / Problem Solutions:** (Step-by-step solved academic numericals, analytical problems, or case instances with detailed calculation steps)
10. **Advantages & Limitations:** (Objective comparative analysis of strengths and real-world weaknesses/constraints)
11. **Comparative Analysis:** (Markdown table comparing this concept against alternative methodologies or related concepts)
12. **Real-World Industrial & Scientific Applications:** (Practical deployment scenarios and industry standards)
13. **Examination Master Points & High-Frequency Questions:** (Key points examiners look for, expected mark weightage, and critical revision bullets)
14. **Chapter Summary & Synthesis:** (2-3 sentences synthesizing core takeaways)

STRICT RULES:
- Ground all content directly in the provided text.
- Maintain source page references like [Page X] or [Page X, Chapter Y].
- Cover EVERY concept in the text — do not skip anything.
- Write at minimum 900 words per chunk.
- Do NOT use LaTeX, $ signs, or Mermaid diagrams — write clear plain text and markdown tables.
- Use ## for main topics, ### for sub-sections.`;

  const sysPrompt = `${domainInstruction}
${langRule}

${(!isRevision && !isExam) ? detailedStructure : ''}`;

  const CONCURRENCY = 3;
  const parts = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchPromises = batch.map(async (chunk, bIdx) => {
      const idx = i + bIdx;
      const promptChunk = chunk.slice(0, 8000);
      const prompt = `Generate comprehensive notes for PART ${idx + 1} of ${chunks.length}.
Title: "${title}" | Subject: "${subject}" | Document Type: "${docType}" | Mode: "${mode}"
Language: ${lang}

For EVERY concept, chapter, or scene found in this text, write the full structured notes with [Page X] citations.
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

  const modeBadge = isRevision ? ' — High-Yield Revision Notes' : isExam ? ' — Examination Master Notes' : isTopic ? ` — Special Topic: ${topicFilter}` : ' — Complete Study Notes';
  let combined = `# ${title}\n### ${subject}${modeBadge}\n\n` + parts.join('\n\n---\n\n');

  if (lang !== 'English' && !containsDevanagari(combined)) {
    combined = await translateFree(combined, lang);
  }
  return combined;
}

async function generateSummary(text, title, subject, lang = 'English', docPrimaryLang = 'eng', options = {}) {
  if (typeof lang === 'object' && lang !== null) {
    options = lang;
    lang = options.lang || 'English';
    docPrimaryLang = options.docPrimaryLang || 'eng';
  }
  const mode = (options.mode || 'full').toLowerCase();
  const lengthMode = (options.length || 'medium').toLowerCase();

  const isConcise = mode === 'concise';
  let targetWordCount = isConcise ? '350-500 words' : '800-1200 words';
  if (lengthMode === 'short') targetWordCount = isConcise ? '200-300 words' : '400-600 words';
  if (lengthMode === 'detailed') targetWordCount = isConcise ? '600-800 words' : '1500-2200 words';

  let prompt = '';
  if (isConcise) {
    prompt = `Write a high-yield, concise academic executive summary (${targetWordCount}) of this document.
Title: "${title}" | Subject: "${subject}" | Language: ${lang}

STRUCTURE:
### 📌 Executive Overview & Core Thesis
A sharp 2-3 sentence distillation of the document's central thesis and scope. [Page X]

### 💡 High-Yield Core Definitions & Principles
Bullet points with essential definitions and theoretical foundations. [Page X]

### ⚙️ Key Formulas, Laws & Mechanisms
Bulleted list of formulas (plain text), laws, or execution sequences.

### 🎯 High-Probability Exam Focus Points
What university examiners commonly test from this material.

Document:
${text.slice(0, 15000)}`;
  } else {
    prompt = `Write a comprehensive, full academic summary (${targetWordCount}) of this document.
Title: "${title}" | Subject: "${subject}" | Language: ${lang}

STRUCTURE:
# ${title} — Comprehensive Academic Summary

### 1. Document Scope & Curriculum Context
Introduction establishing the syllabus domain, prerequisites, and learning objectives. [Page X]

### 2. Systematic Chapter-by-Chapter Progression
For every chapter and major section in the document:
- **Chapter / Module Title:** [Page X]
  - Core Theoretical Foundations & Principles
  - Step-by-Step Mechanisms & Processes
  - Key Findings, Methodologies, or Algorithms

### 3. Formulas, Theorems & Quantitative Specifications
List all essential formulas, quantitative bounds, and theorems with variable definitions. [Page X]

### 4. Comparative Synthesis Matrix
A clear Markdown table contrasting the primary models, techniques, or architectures discussed in the document.

### 5. Critical Academic Insights & Exam Synthesis
Key exam takeaways, common interview questions, and conclusions.

STRICT GROUNDING:
- Every section must contain verified source page citations [Page X] where available.
- Do not add conversational fluff. Write in authoritative academic style.

Document:
${text.slice(0, 20000)}`;
  }

  const result = await callAI(sys(lang), prompt, isConcise ? 2000 : 4000);
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

// ── Interactive University Practice Q&A / MCQ Simulator ──
async function generatePracticeQuiz(text, subject, options = {}) {
  const count = Math.min(50, Math.max(5, parseInt(options.count) || 10));
  const difficulty = options.difficulty || 'medium';
  const requestedTypes = Array.isArray(options.types) && options.types.length > 0 ? options.types : ['mcq'];
  const lang = options.lang || 'English';

  const prompt = `Generate exactly ${count} university-level practice assessment questions based strictly on this document.
Subject: "${subject}" | Target Difficulty: ${difficulty} | Allowed Types: ${requestedTypes.join(', ')}

REQUIREMENTS:
1. Every question must be directly grounded in the provided document content.
2. Return ONLY a valid JSON array of questions matching this exact schema:
[
  {
    "id": "q1",
    "type": "mcq",
    "question": "Clear, rigorous question text?",
    "options": [
      "A) First plausible option",
      "B) Second plausible option",
      "C) Third plausible option",
      "D) Fourth plausible option"
    ],
    "correctAnswer": "B",
    "explanation": "Detailed explanation of why this answer is correct and why other choices are incorrect.",
    "chapter": "Relevant Chapter or Topic Name",
    "pageReference": "Page X",
    "difficulty": "${difficulty === 'mixed' ? 'medium' : difficulty}",
    "bloomsTaxonomy": "Understand"
  }
]

RULES:
- For "mcq": provide exactly 4 distinct options with letters A), B), C), D).
- For "true_false": provide 2 options: ["A) True", "B) False"], correctAnswer is "A" or "B".
- For "assertion_reason": provide standard assertion-reason format with options A, B, C, D.
- For "short_answer": provide empty options [], put model answer in explanation.
- Return ONLY the JSON array, no markdown wrappers.

Document Content:
${text.slice(0, 15000)}`;

  try {
    const result = await callAI('Return ONLY a valid JSON array.', prompt, 4000);
    const parsed = parseJSON(result, null);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, count).map((q, idx) => ({
        id: q.id || `q_${idx + 1}`,
        type: q.type || 'mcq',
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) && q.options.length > 0 ? q.options : ['A) True', 'B) False'],
        correctAnswer: q.correctAnswer || 'A',
        explanation: q.explanation || 'Refer to the document for full details.',
        chapter: q.chapter || subject || 'General',
        pageReference: q.pageReference || 'Page 1',
        difficulty: q.difficulty || (idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy'),
        bloomsTaxonomy: q.bloomsTaxonomy || 'Understand'
      }));
    }
  } catch (err) {
    console.warn('[Practice Quiz] AI parse error, using fallback generator:', err.message);
  }

  // Fallback generator from text
  const fallbackQuestions = [];
  const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 40 && s.trim().length < 180);
  for (let i = 0; i < Math.min(count, Math.max(5, sentences.length)); i++) {
    const s = sentences[i]?.trim() || `Core concept of ${subject} in academic studies.`;
    const words = s.split(' ');
    const keyWord = words[Math.floor(words.length / 2)] || 'concept';
    fallbackQuestions.push({
      id: `q_${i + 1}`,
      type: 'mcq',
      question: `According to the document, which statement regarding "${keyWord}" is accurate?`,
      options: [
        `A) ${s}`,
        `B) It is completely unrelated to ${subject}.`,
        `C) It is deprecated in modern implementations.`,
        `D) It operates without any constraints.`
      ],
      correctAnswer: 'A',
      explanation: `The uploaded text directly states: "${s}".`,
      chapter: subject || 'General',
      pageReference: `Page ${Math.floor(i / 3) + 1}`,
      difficulty: 'medium',
      bloomsTaxonomy: 'Understand'
    });
  }
  return fallbackQuestions;
}

async function generateQuestionPaper(text, subject, totalMarks = 20, timeHours = 1, institution = "Mahatma Education Society's", lang = 'English', sets = 3, options = {}) {
  const marksNum = parseInt(totalMarks) || 20;
  const is60Marks = marksNum === 60 || options.paperType === '60_MARKS';
  const isComprehensive = marksNum >= 75; // 75, 80, 100 marks
  const isMidTerm = marksNum >= 40 && marksNum < 60;
  const college = options.college || "Pillai HOC College of Engineering and Technology, Rasayani";
  const status = options.status || "(Autonomous)";
  const department = options.department || "Department of Computer Application";
  const examType = options.examType || (isComprehensive ? "END SEMESTER UNIVERSITY EXAMINATION" : (is60Marks ? "PRELIM EXAMINATION (Autonomous)" : (marksNum <= 25 ? "Internal Assessment- I OSAY 2026-2027" : "Mid-Term Examination")));
  const branchName = options.branch || options.class || options.className || "Computer Application (MCA)";
  const semesterName = options.semester || "Semester: I";
  const subjectCode = options.subjectCode || "MCA104";
  const dateStr = options.date || (is60Marks || isComprehensive ? "04/12/2025" : "22/8/2026");
  const timeStr = options.time || (isComprehensive ? "03.00 Hours" : (is60Marks ? "02.00 Hours" : (marksNum <= 25 ? "10.30am - 11.30am" : "10.30am - 12.30pm")));

  const generateSingleSet = async (setNum) => {
    // Window the document across sets so each set covers different chapters/topics and stays well below TPM limits
    const chunkSize = Math.min(6000, text.length);
    const offset = sets > 1 ? Math.floor(((setNum - 1) * (text.length - chunkSize)) / (sets - 1)) : 0;
    const docSlice = text.slice(Math.max(0, offset), Math.max(0, offset) + chunkSize);

    const is100Marks = marksNum === 100;
    const prompt = (is60Marks || isComprehensive) ? `You are generating an official ${marksNum}-marks autonomous university examination Question Paper based strictly on this document.
Subject: ${subject} | Branch: ${branchName} | Semester: ${semesterName} | Set: Set ${setNum} of ${sets}

CRITICAL REQUIREMENT: Return ONLY valid, raw JSON (no markdown formatting, no code fences, no extra text).
Match this EXACT structure matching the university paper format:
{
  "institution": "${institution}",
  "college": "${college}",
  "status": "${status}",
  "department": "${department}",
  "examType": "${examType}",
  "branch": "${branchName}",
  "class": "${branchName}",
  "semester": "${semesterName}",
  "subject": "${subject}",
  "subjectCode": "${subjectCode}",
  "date": "${dateStr}",
  "time": "${timeStr}",
  "duration": "${timeStr}",
  "marks": "${marksNum}",
  "nb": [
    "1. Q.1 is compulsory",
    "${is100Marks ? '2. Attempt any Four from the remaining five questions' : '2. Attempt any Three from the remaining five questions'}",
    "${isComprehensive ? (is100Marks ? '3. Q.1 carries 20 marks; Q.2 to Q.6 each carry 20 marks.' : '3. Q.1 carries 20 marks; Q.2 to Q.6 each carry 20 marks (attempt 3 = 60m).') : '3. Each Question carries 15 marks.'}"
  ],
  "sections": [
    {
      "qNum": "Q.1",
      "instruction": "${isComprehensive ? 'Attempt any 4 out of 5 (5 marks each = 20 Marks)' : 'Attempt any 3 out of 6 (5 marks each = 15 Marks)'}",
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
        { "id": "a)", "text": "...", "marks": "${isComprehensive ? '10' : '8'}", "bt": "2", "co": "Co2" },
        { "id": "b)", "text": "...", "marks": "${isComprehensive ? '10' : '7'}", "bt": "6", "co": "Co4" }
      ]
    },
    {
      "qNum": "Q.3",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "${isComprehensive ? '10' : '8'}", "bt": "6", "co": "Co3" },
        { "id": "b)", "text": "...", "marks": "${isComprehensive ? '10' : '7'}", "bt": "2", "co": "Co5" }
      ]
    },
    {
      "qNum": "Q.4",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "${isComprehensive ? '10' : '10'}", "bt": "5", "co": "Co5" },
        { "id": "b)", "text": "...", "marks": "${isComprehensive ? '10' : '5'}", "bt": "1", "co": "Co4" }
      ]
    },
    {
      "qNum": "Q.5",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "${isComprehensive ? '10' : '7'}", "bt": "2", "co": "Co1" },
        { "id": "b)", "text": "...", "marks": "${isComprehensive ? '10' : '8'}", "bt": "2", "co": "Co2" }
      ]
    },
    {
      "qNum": "Q.6",
      "instruction": "Attempt All",
      "questions": [
        { "id": "a)", "text": "...", "marks": "${isComprehensive ? '10' : '8'}", "bt": "1", "co": "Co6" },
        { "id": "b)", "text": "...", "marks": "${isComprehensive ? '10' : '7'}", "bt": "6", "co": "Co3" }
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
- Ensure marks allocation adds up mathematically to ${marksNum}.

Document Content:
${docSlice}` : `You are generating an autonomous engineering college examination Question Paper based ONLY on this document.
Subject: ${subject}
Set: Set ${setNum} of ${sets}
Total Marks: ${marksNum} | Duration: ${timeHours} Hour(s)

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
  "marks": "${marksNum}",
  "note": "Note: Assume suitable data wherever necessary.",
  "sections": [
    {
      "qNum": "1",
      "instruction": "${marksNum <= 25 ? 'Attempt Any Five out of Six' : 'Attempt Any Four out of Six'}",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO3", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L1" },
        { "id": "C.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO2", "bl": "L2" },
        { "id": "D.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L6" },
        { "id": "E.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO1", "bl": "L2" },
        { "id": "F.", "text": "...", "marks": "${marksNum <= 25 ? '[ 02 ]' : '[ 05 ]'}", "co": "CO3", "bl": "L2" }
      ]
    },
    {
      "qNum": "2",
      "instruction": "Attempt Any One",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${marksNum <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO1", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${marksNum <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO3", "bl": "L2" }
      ]
    },
    {
      "qNum": "3",
      "instruction": "Attempt Any One",
      "questions": [
        { "id": "A.", "text": "...", "marks": "${marksNum <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO3", "bl": "L2" },
        { "id": "B.", "text": "...", "marks": "${marksNum <= 25 ? '[ 05 ]' : '[ 10 ]'}", "co": "CO2", "bl": "L2" }
      ]
    }
  ]
}

STRICT EXAM RULES:
- All questions MUST be strictly extracted from the provided document content.
- Include realistic Course Outcome tags (CO1, CO2, CO3, CO4, CO5) and Bloom's Taxonomy Level tags (L1, L2, L3, L4, L5, L6).
- For SET ${setNum}, formulate completely fresh and distinct questions different from other sets.
- Marks and totals must calculate accurately to ${marksNum}.

Document:
${docSlice}`;

    let paperData = null;
    try {
      const result = await callAI('Return ONLY valid JSON.', prompt, (is60Marks || isComprehensive) ? 3500 : 1500);
      paperData = parseJSON(result, null);
    } catch (e) {
      console.warn(`[Paper Set ${setNum}] AI generation warning:`, e.message);
    }

    if (!paperData || !paperData.sections || !Array.isArray(paperData.sections)) {
      const fallbackStr = pdf.makeQuestionPaper(docSlice, subject, marksNum, timeHours, institution, options);
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

// ── University Official Answer Key & Step-by-Step Marking Scheme ──
async function generatePaperAnswerKey(paperData, text, subject, lang = 'English', docPrimaryLang = 'eng') {
  let paperObj = typeof paperData === 'string' ? parseJSON(paperData, null) : paperData;
  if (!paperObj && typeof paperData === 'object' && paperData.structured) {
    paperObj = paperData.structured;
  }
  if (!paperObj && typeof paperData === 'object' && paperData.content) {
    paperObj = parseJSON(paperData.content, null);
  }
  if (!paperObj) {
    paperObj = { subject, marks: "60", sections: [] };
  }

  const institution = paperObj.institution || "Mahatma Education Society's";
  const college = paperObj.college || "Pillai HOC College of Engineering and Technology, Rasayani";
  const examType = paperObj.examType || "Examination";
  const marks = paperObj.marks || "60";

  const prompt = `You are a senior university chief examiner creating the OFFICIAL UNIVERSITY MODEL ANSWER KEY & STEP-BY-STEP MARKING SCHEME.
Subject: "${subject}" | Institution: "${institution}" | Total Marks: ${marks} | Language: ${lang}

QUESTION PAPER STRUCTURE:
${JSON.stringify(paperObj, null, 2).slice(0, 7000)}

DOCUMENT REFERENCE TEXT:
${text.slice(0, 14000)}

REQUIREMENTS:
1. Generate an exhaustive, university-grade Model Answer Key in Markdown format.
2. For EVERY question in EVERY section:
   - State Question ID and allocated Marks (e.g. "#### Q.1 a) Question Text [5 Marks]")
   - **Comprehensive Model Answer:** Complete, high-scoring technical/academic answer.
   - **Step-by-Step Marking Scheme:** Explicit mark allocation:
     • Definition & Core Terms: [X Marks]
     • Working / Block Diagram / Derivation: [Y Marks]
     • Explanation & Applications: [Z Marks]
   - **Examiner's Checklist:** Non-negotiable points/keywords students must include.
   - **Grounding Reference:** [Page X] or chapter source.
3. Total rubric marks must match each question's allocated marks.`;

  const result = await callAI(
    'You are an authoritative university chief examiner providing the official exam answer key and step-by-step marking rubrics.',
    prompt,
    4500
  );

  let markdownKey = result;
  if (!markdownKey || markdownKey.length < 100) {
    markdownKey = `# ${institution}\n## ${college}\n### OFFICIAL ANSWER KEY & STEP-BY-STEP MARKING SCHEME\n**Subject:** ${subject} | **Total Marks:** ${marks}\n\n---\n\n`;
    for (const sec of (paperObj.sections || [])) {
      markdownKey += `### ${sec.qNum || 'Section'}: ${sec.instruction || ''}\n\n`;
      for (const q of (sec.questions || [])) {
        markdownKey += `#### ${q.id || ''} ${q.text} (${q.marks || ''} Marks)\n\n`;
        markdownKey += `**Model Answer:**\nExplain key principles, architectural components, and formulas for ${subject} as detailed in the course curriculum.\n\n`;
        markdownKey += `**Step-by-Step Marking Rubric:**\n- Correct definition & terminology: 40% of marks\n- Detailed explanation & working: 40% of marks\n- Diagram / example: 20% of marks\n\n`;
        markdownKey += `**Source Grounding:** [Page 1, ${subject}]\n\n---\n\n`;
      }
    }
  }

  return {
    markdown: markdownKey,
    paperMeta: {
      institution,
      college,
      subject,
      marks,
      examType
    }
  };
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

  if (docType === 'computer_science') {
    domainPrompt = `You are a distinguished Professor of Computer Science and master technical note-taker.
You MUST format EVERY algorithmic concept, data structure, or software engineering topic found in the text using this EXACT computer science hierarchy:

# Chapter [Number]: [Chapter Title / Computational Topic]

## Topic: [Algorithm, Data Structure, or Technical Concept]

DEFINITION: One rigorous, complete formal definition of the algorithm, data structure, or computational problem.

SUMMARY: 4-5 sentences detailing the problem formulation, input/output specifications, algorithmic strategy (e.g., divide-and-conquer, greedy, dynamic programming, amortization), and core invariants.

### Subtopic: Algorithmic Mechanics & Step-by-Step Logic
EXPLANATION:
- Step 1: Initialization and base case handling
- Step 2: Invariant maintenance and recursive/iterative state transition
- Step 3: Termination condition and correctness proof or convergence
- Step 4: Edge cases, constraint boundaries, and data transformations
- Provide 6-10 bullet points per topic detailing the exact mechanics.

### Subtopic: Complexity & Performance Specifications
| Metric / Case | Time / Space Bound | Operational Behavior & Conditions |
|---|---|---|
| Best-Case Time | O(...) | Conditions under which optimal runtime occurs |
| Worst-Case Time | O(...) | Adversarial input conditions or worst-case bounds |
| Auxiliary Space | O(...) | Memory overhead, in-place vs extra storage required |

### Subtopic: Implementation Insights & Real-World Applications
EXAMPLE:
- Practical Application: Real-world systems, database, networking, or software application
- Implementation Pitfall: Common algorithmic bug, recursion depth, or performance bottleneck
- Key Takeaway: Essential design pattern, invariant, or interview/exam insight`;
  } else if (docType === 'novel_fiction' || docType === 'poetry_literature') {
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

  const langRule = getLanguageInstruction(lang, docPrimaryLang);
  const normLang = resolveOutputLanguage(lang).name;

  const sysPrompt = `You are a professional educational scriptwriter and academic animator for Notivexa.
CRITICAL RULES:
1. STRICT DOCUMENT GROUNDING: Use ONLY the concepts, definitions, and technical facts present in the provided document. DO NOT include generic jokes, meme humor, or unrelated comedy tropes.
2. ${langRule}
3. Structure format (Professional Classroom Lecture between Professor and Student):
TOPIC: [Core Concept Name from document - in ${normLang}]
[BOARD POINTS]
• 1. [First key syllabus principle from document - in ${normLang}]
• 2. [Second key mechanism/method from document - in ${normLang}]
• 3. [Third key rule/impact from document - in ${normLang}]
[DIALOGUE]
Professor: [Teacher opening lecture in ${normLang} - introducing the core concept and asking student a foundational question]
Student: [Student responding in ${normLang} with an insightful question about how it works]
Professor: [Teacher explaining the key mechanism clearly in ${normLang}]
Student: [Student acknowledging and asking about practical exam/impact in ${normLang}]
Professor: [Teacher concluding with final core takeaway in ${normLang}]
4. TONE: Clear, academic, engaging, easy for university/high-school students to understand.
5. Total dialogue length: 60-80 words (ideal for 25-30s educational short).
IMPORTANT: Keep the structural labels "TOPIC:", "[BOARD POINTS]", "[DIALOGUE]", "Professor:", "Student:" so the animation engine can parse them, but write ALL dialogue and explanatory content strictly in ${normLang}.`;

  const parts = [];
  for (let idx = 0; idx < toProcess.length; idx++) {
    const chunk = toProcess[idx];
    const prompt = `Write the Professional Academic Classroom Shorts script based strictly on this document.
Title: ${title} | Subject: ${subject} | Output Language: ${normLang}

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

  if (normLang !== 'English' && !containsDevanagari(combined) && ['Marathi', 'Hindi'].includes(normLang)) {
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
  const prompt = `Create a comprehensive, multi-tier academic mind map from this document.
Title: "${title}" | Output Language: ${lang}

Return ONLY valid JSON matching this EXACT hierarchical structure:
{
  "central": "${title.slice(0, 45)}",
  "branches": [
    {
      "topic": "Major Subject Domain / Chapter",
      "color": "#059669",
      "summary": "1-sentence high-level overview of this branch",
      "subtopics": [
        {
          "title": "Subtopic or Core Principle",
          "details": [
            "Specific mechanism or property from text",
            "Key formula, law, or equation",
            "Real-world application or case"
          ]
        },
        {
          "title": "Methodology or Mechanism",
          "details": [
            "Step 1: Input & initialization",
            "Step 2: Processing & state transitions",
            "Step 3: Verification & termination"
          ]
        }
      ]
    }
  ]
}

Rules:
- 5 to 8 main branches covering the entire document systematically.
- Each branch MUST have 2 to 4 structured subtopics.
- Each subtopic MUST have 2 to 4 concrete details extracted directly from the text.
- Ground all nodes strictly in the provided document content.

Document Content:
${text.slice(0, 10000)}`;

  const result = await callAI('Return ONLY valid JSON.', prompt, 3000);
  let data = parseJSON(result, null);
  if (data?.branches?.length > 0) {
    const colors = ['#059669', '#0284C7', '#D97706', '#7C3AED', '#DC2626', '#0D9488', '#4F46E5', '#10B981'];
    data.branches = data.branches.map((b, idx) => {
      const normalizedSubtopics = Array.isArray(b.subtopics) ? b.subtopics.map(st => {
        if (typeof st === 'string') {
          return { title: st, details: [] };
        }
        return {
          title: st.title || 'Concept',
          details: Array.isArray(st.details) ? st.details : []
        };
      }) : [];
      return {
        topic: b.topic || `Topic ${idx + 1}`,
        color: b.color || colors[idx % colors.length],
        summary: b.summary || '',
        subtopics: normalizedSubtopics
      };
    });
    return data;
  }
  return pdf.makeMindmap(text, title);
}

async function generateVocabulary(text, subject, lang = 'English', docPrimaryLang = 'eng') {
  const prompt = `Extract 15 to 20 key academic and technical vocabulary terms from this document.
Subject: "${subject}" | Output Language: ${lang}

Return ONLY a valid JSON array of 7-field entries:
[
  {
    "word": "Technical term directly from text",
    "meaning": "Rigorous academic definition (1-2 sentences)",
    "explanation": "Intuitive student-friendly explanation (2-3 sentences)",
    "context": "How it is applied or tested in university examinations",
    "example": "Practical real-world or textual example",
    "chapter": "Relevant chapter or domain",
    "pageReference": "Page X",
    "formula": "Formula or notation if applicable, else empty string"
  }
]

STRICT RULES:
- Extract ONLY terms that actually appear in the document.
- Ensure all 7 fields are populated accurately.
- Return ONLY the raw JSON array.

Document Excerpt:
${text.slice(0, 12000)}`;

  const result = await callAI('Return ONLY a valid JSON array.', prompt, 3000);
  let data = parseJSON(result, null);
  if (Array.isArray(data) && data.length > 0) {
    return data.map((v, i) => ({
      word: v.word || `Term ${i + 1}`,
      meaning: v.meaning || v.definition || 'Academic concept from document.',
      explanation: v.explanation || v.meaning || 'Core concept explained.',
      context: v.context || `Tested in ${subject} examinations.`,
      example: v.example || `Example application of ${v.word || 'this term'}.`,
      chapter: v.chapter || subject || 'General',
      pageReference: v.pageReference || `Page ${Math.floor(i / 2) + 1}`,
      formula: v.formula || ''
    }));
  }
  return pdf.makeVocabulary(text, subject);
}

// FIXED: Detailed chatbot that gives thorough answers
async function answerChat(question, docInput, history = [], outputLang = 'english', docPrimaryLang = 'eng', options = {}) {
  const docObj = (docInput && typeof docInput === 'object') ? docInput : { extractedText: String(docInput || '') };
  const rawText = docObj.extractedText || '';

  if (!rawText || rawText.trim().length < 20) {
    return {
      reply: "Please select an academic document first. I can only answer questions based on your uploaded document content.",
      citations: [],
      passages: []
    };
  }

  // Retrieve page-grounded excerpts across the entire document
  const retrievedPassages = searchDocumentPassages(docObj, question, { topK: 6 });
  const groundingContext = buildGroundingContext(retrievedPassages);

  const histText = history.slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`).join('\n\n');
  const targetInfo = resolveOutputLanguage(outputLang, docPrimaryLang);
  const qAnalysis = detectTextLanguage(question);
  const responseLanguage = (outputLang && outputLang.toLowerCase() !== 'english')
    ? targetInfo.name
    : (qAnalysis.primaryLanguage !== 'eng' ? resolveOutputLanguage(qAnalysis.primaryLanguage).name : 'English');

  const langPrompt = getLanguageInstruction(responseLanguage, docPrimaryLang);
  const allowGeneral = options.allowGeneralKnowledge === true;

  const prompt = `You are Notivexa's University-Level Academic AI Tutor. Answer the student's question with authoritative, document-grounded accuracy.

AUTHENTIC DOCUMENT EXCERPTS (from student's uploaded material):
${groundingContext}

CONVERSATION HISTORY:
${histText}

STUDENT QUESTION: ${question}

LANGUAGE INSTRUCTIONS:
${langPrompt}

STRICT ACADEMIC CITATION & GROUNDING RULES:
1. Grounding First: Answer primarily and thoroughly using the provided document excerpts above.
2. Mandatory Citations: For each key definition, algorithm step, formula, and conceptual explanation, explicitly cite the source page using bracketed citations, e.g. [Page X] or [Page X, Chapter Y].
3. Anti-Hallucination: Never invent page numbers, textbook chapters, or fake quotes not present in the excerpts.
4. Out-of-Document Queries: If the concept is not found in the uploaded excerpts:
   ${allowGeneral 
     ? '- State clearly: "This specific concept is not covered in your uploaded document." Then provide a clearly marked supplemental section: "### 🌐 Supplemental Academic Knowledge" explaining the topic from general academic curriculum.' 
     : '- State clearly and honestly: "This specific concept is not covered in your uploaded document. I can only answer from the uploaded material unless General Knowledge mode is enabled."'}
5. Tone & Depth: Provide a well-structured, university-examination ready answer (200-400 words) with clear headings, bullet points, formulas, and examples where applicable.
6. Respond in ${responseLanguage}.`;

  const result = await callAI(
    `You are a strict, authoritative university AI tutor. Always cite source pages like [Page X] and answer in ${responseLanguage}.`,
    prompt,
    2000
  );

  const finalReply = result || pdf.answerQuestion(question, rawText);
  const citations = extractCitationsFromText(finalReply);

  const responseObj = {
    reply: finalReply,
    citations,
    passages: retrievedPassages.map(p => ({
      pageNumber: p.pageNumber,
      chapter: p.chapter,
      snippet: p.snippet
    }))
  };

  // Enable string coercion for backward compatibility
  responseObj.toString = () => finalReply;
  return responseObj;
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
        rej(new Error('Edge TTS WebSocket timeout (10s limit reached, fast fallback)'));
      }, 10000);

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
  generatePracticeQuiz, generateQuestionPaper, generatePaperAnswerKey,
  generateHandwrittenNotes, generateVideoScript,
  generatePPT, generateMindmap, generateVocabulary,
  answerChat, generateAudio, translateFree, generatePodcast
};








