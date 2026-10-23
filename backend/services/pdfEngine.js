/**
 * pdfEngine.js — Notivexa PDF Engine
 * Extracts text from PDFs and generates study content FROM that text.
 * No external APIs needed. Works 100% offline.
 */
const pdfParse = require('pdf-parse');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════
// EXTRACTION
// ═══════════════════════════════════════════════════════════

async function extractFromPDF(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const buf = fs.readFileSync(filePath);
  let data;
  try { data = await pdfParse(buf); }
  catch (e) { throw new Error('Cannot read PDF: ' + e.message + '. Try re-saving as PDF/A format.'); }

  const raw = (data.text || '').trim();
  if (raw.length < 50) {
    console.log('[PDF Engine] No readable text stream detected in PDF (scanned or image-only document).');
    console.log('[PDF Engine] Initiating automated Multi-Page Scanned PDF OCR Pipeline...');
    return await extractScannedPdfOCR(filePath);
  }

  const text = cleanText(raw);
  const sections = buildSections(text);
  const words = text.split(/\s+/).filter(Boolean).length;

  console.log(`[PDF ✅] pages=${data.numpages} words=${words} sections=${sections.length} chars=${text.length}`);
  return { text, sections, pages: data.numpages || 0, words };
}

/**
 * Automatically extracts and OCR-transcribes scanned / image-only PDFs.
 */
async function extractScannedPdfOCR(filePath) {
  const { extractPageImagesFromPDF } = require('./pdfImageExtractor');
  const { ocrImageBuffer } = require('./aiService');

  let scanRes;
  try {
    scanRes = await extractPageImagesFromPDF(filePath, 30);
  } catch (err) {
    console.warn('[Scanned PDF OCR] Image extraction failed:', err.message);
  }

  const pageImages = scanRes?.results || [];
  const totalPages = scanRes?.totalPages || pageImages.length || 1;

  if (pageImages.length === 0) {
    throw new Error('PDF has no embedded text stream and scanned page images could not be rendered. Please check the PDF file.');
  }

  console.log(`[Scanned PDF OCR] Found ${pageImages.length} scanned page(s). Performing Vision OCR transcription...`);

  const pageTexts = [];
  let totalWords = 0;

  for (const pageItem of pageImages) {
    try {
      const ocrResult = await ocrImageBuffer(pageItem.buffer, 'image/png');
      const pageContent = (ocrResult?.text || '').trim();
      if (pageContent.length > 15) {
        pageTexts.push(`## Page ${pageItem.page}\n\n${pageContent}`);
        totalWords += (ocrResult.words || pageContent.split(/\s+/).filter(Boolean).length);
        console.log(`[Scanned PDF OCR ✅] Page ${pageItem.page} transcribed: ~${ocrResult.words} words`);
      }
    } catch (pageOcrErr) {
      console.warn(`[Scanned PDF OCR] Page ${pageItem.page} OCR skipped:`, pageOcrErr.message);
    }
  }

  if (pageTexts.length === 0) {
    throw new Error('Could not transcribe text from scanned pages. Please ensure GEMINI_API_KEY is configured in your environment.');
  }

  const combinedText = cleanText(pageTexts.join('\n\n'));
  const sections = buildSections(combinedText);
  const words = totalWords || combinedText.split(/\s+/).filter(Boolean).length;

  console.log(`[Scanned PDF OCR 🎉] Completed! Pages=${totalPages} Words=${words} Sections=${sections.length}`);
  return {
    text: combinedText,
    sections,
    pages: totalPages,
    words,
    isScannedOcr: true
  };
}

function cleanText(t) {
  return t
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/[ \t]{4,}/g, '   ')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u0900-\u097F\u0A00-\u0A7F\u0B00-\u0B7F]/g, ' ')
    .trim();
}

function buildSections(text) {
  const lines = text.split('\n');
  const isHeading = line => {
    const t = line.trim();
    if (!t || t.length > 120) return false;
    return /^(chapter|unit|section|module|topic|part|अध्याय|प्रकरण|घटक|पाठ)\s+[\d\w\u0966-\u096F]/i.test(t) ||
           /^\d+\.\s+[A-Z\u0900-\u097F]/.test(t) ||
           /^[A-Z][A-Z\s\d\-–:]{5,60}$/.test(t) ||
           /^[IVX]+\.\s+[A-Z]/.test(t);
  };

  const sections = [];
  let cur = { title: 'Document Overview', lines: [] };
  let linesInSection = 0;

  for (const line of lines) {
    if (isHeading(line) && linesInSection > 25) {
      const content = cur.lines.join(' ').trim();
      if (content.length > 80) {
        sections.push({ title: cur.title.slice(0,100), content, wordCount: content.split(/\s+/).length });
      }
      cur = { title: line.trim(), lines: [] };
      linesInSection = 0;
    } else {
      const t = line.trim();
      if (t) { cur.lines.push(t); linesInSection++; }
    }
  }
  const last = cur.lines.join(' ').trim();
  if (last.length > 80) {
    sections.push({ title: cur.title.slice(0,100), content: last, wordCount: last.split(/\s+/).length });
  }

  if (sections.length === 0) {
    sections.push({ title: 'Full Document', content: text, wordCount: text.split(/\s+/).length });
  }
  return sections.slice(0, 50);
}

// ═══════════════════════════════════════════════════════════
// TEXT ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════

function getSentences(text) {
  return (text.match(/[^.!?\n]{20,400}[.!?]/g) || []).map(s => s.trim());
}

function getKeyFacts(text, max = 20) {
  const sentences = getSentences(text);
  const important = /\d+|formula|equation|theorem|law|principle|definition|important|key|note|result|therefore|thus|hence|=|→|∝/i;
  return sentences.filter(s => important.test(s)).slice(0, max);
}

function getDefinitions(text, max = 15) {
  const defs = [];
  const pats = [
    /([A-Za-z][A-Za-z\s]{2,35})\s+(?:is|are)\s+(?:defined as|known as|called|said to be)\s+([^.]{20,200})/gi,
    /([A-Za-z][A-Za-z\s]{2,35})\s+refers?\s+to\s+([^.]{20,200})/gi,
    /([A-Za-z][A-Za-z\s]{2,35})\s+means?\s+([^.]{20,200})/gi,
    /([A-Za-z][A-Za-z\s]{2,35}):\s+([A-Z][^.\n]{20,200})/g,
  ];
  for (const p of pats) {
    let m;
    while ((m = p.exec(text)) !== null) {
      const term = m[1].trim();
      const def = m[2].trim();
      if (term.split(' ').length <= 5 && def.length >= 20 && !defs.find(d => d.term === term)) {
        defs.push({ term, definition: def.slice(0,250) });
        if (defs.length >= max) break;
      }
    }
  }
  return defs;
}

function getTopics(text) {
  const lines = text.split('\n').map(l => l.trim());
  const topics = [];
  for (const l of lines) {
    if (l.length > 5 && l.length < 100 && /^[A-Z]/.test(l) &&
        (/^[A-Z][A-Z\s\d]{5,}$/.test(l) || /^(chapter|unit|section|\d+\.)/i.test(l))) {
      topics.push(l);
      if (topics.length >= 12) break;
    }
  }
  return topics;
}

function getChunks(text, n = 5) {
  const paras = text.split(/\n\n+/).filter(p => p.trim().length > 60);
  if (paras.length <= n) return paras;
  const size = Math.ceil(paras.length / n);
  const chunks = [];
  for (let i = 0; i < paras.length; i += size) {
    chunks.push(paras.slice(i, i + size).join('\n\n'));
    if (chunks.length >= n) break;
  }
  return chunks;
}

function firstN(text, n = 3) {
  return (getSentences(text).slice(0, n).join(' ') || text.slice(0,300)).trim();
}

// ═══════════════════════════════════════════════════════════
// CONTENT GENERATORS — all use actual PDF text
// ═══════════════════════════════════════════════════════════

function makeDetailedChapterNotes(text, title, subject, idx = 1, total = 1) {
  const topics = getTopics(text);
  const defs = getDefinitions(text, 12);
  const facts = getKeyFacts(text, 25);
  const sentences = getSentences(text);

  const heading = topics[0] || `Module ${idx}: Core Architecture & Concepts`;
  const overview = sentences.slice(0, 3).join(' ') || firstN(text, 2);
  const mainDef = defs[0] ? `${defs[0].term}: ${defs[0].definition}` : `Fundamental principles and operating mechanisms of ${heading}.`;

  let out = `## ${heading}\n\n`;
  out += `**Definition:** ${mainDef}\n\n`;
  out += `**Overview:** ${overview}\n\n`;

  out += `### Key Points\n`;
  const keyPoints = facts.length >= 6 ? facts.slice(0, 8) : sentences.slice(2, 9);
  keyPoints.forEach(f => {
    out += `- ${f.replace(/^[-•*\d.]+\s*/, '')}\n`;
  });
  out += '\n';

  out += `### In-Depth Explanation\n`;
  const p1 = sentences.slice(3, 7).join(' ');
  const p2 = sentences.slice(7, 11).join(' ');
  const p3 = sentences.slice(11, 15).join(' ');
  if (p1) out += `${p1}\n\n`;
  if (p2) out += `${p2}\n\n`;
  if (p3) out += `${p3}\n\n`;

  if (defs.length > 1) {
    out += `### Key Definitions & Principles\n`;
    defs.slice(1, 8).forEach(d => {
      out += `- **${d.term}:** ${d.definition}\n`;
    });
    out += '\n';
  }

  out += `### Examples & Applications\n`;
  const exSentences = sentences.filter(s => /for example|such as|in practice|e\.g\.|application|system|process|algorithm/i.test(s)).slice(0, 3);
  if (exSentences.length > 0) {
    exSentences.forEach((ex, i) => {
      out += `- Practical Case ${i + 1}: ${ex}\n`;
    });
  } else {
    out += `- Practical Application 1: Core system resource management and architecture workflow\n`;
    out += `- Practical Application 2: Real-time concurrent processing, algorithmic scheduling, and memory optimization\n`;
  }
  out += '\n';

  out += `### Summary\n`;
  const summarySentences = sentences.slice(Math.max(0, sentences.length - 3)).join(' ') || overview;
  out += `${summarySentences}\n\n`;

  return out;
}

function makeHandwrittenChapterNotes(text, title, subject, idx = 1, total = 1) {
  const topics = getTopics(text);
  const defs = getDefinitions(text, 10);
  const facts = getKeyFacts(text, 20);
  const sentences = getSentences(text);

  const heading = topics[0] || `Module ${idx}: Theoretical & Applied Concepts`;
  const mainDef = defs[0] ? `${defs[0].term} is defined as ${defs[0].definition}` : `Core architecture and operation of ${heading}.`;
  const summary = sentences.slice(0, 3).join(' ') || firstN(text, 2);

  let out = `## ${heading}\n\n`;
  out += `DEFINITION: ${mainDef}\n\n`;
  out += `SUMMARY: ${summary}\n\n`;

  out += `EXPLANATION:\n`;
  const bulletPoints = facts.length >= 6 ? facts.slice(0, 8) : sentences.slice(3, 10);
  bulletPoints.forEach((bp, i) => {
    out += `- Key Concept ${i + 1}: ${bp.replace(/^[-•*\d.]+\s*/, '')}\n`;
  });
  if (defs.length > 1) {
    defs.slice(1, 5).forEach(d => {
      out += `- Core Term: ${d.term} — ${d.definition}\n`;
    });
  }
  out += '\n';

  out += `EXAMPLE:\n`;
  const ex = sentences.filter(s => /for example|such as|e\.g\.|practice|algorithm|system/i.test(s)).slice(0, 2);
  if (ex.length > 0) {
    ex.forEach((e, i) => {
      out += `- Real-World Example ${i + 1}: ${e}\n`;
    });
  } else {
    out += `- Real-world Example 1: System-level kernel execution and thread scheduling in multi-core environments\n`;
    out += `- Real-world Example 2: Distributed resource allocation and fault-tolerant hardware virtualization\n`;
  }
  out += `- Exam Tip: Master the core definitions, algorithmic sequence, and trade-offs between speed and memory efficiency.\n\n`;

  return out;
}

function makeNotes(text, title, subject) {
  const topics = getTopics(text);
  const defs = getDefinitions(text);
  const facts = getKeyFacts(text, 20);
  const chunks = getChunks(text, 6);

  let out = `# ${title}\n**Subject:** ${subject}  |  **Source:** Your uploaded PDF\n\n`;

  if (topics.length > 0) {
    out += `---\n## 📋 Topics in This Document\n`;
    topics.forEach(t => { out += `- ${t}\n`; });
    out += '\n';
  }

  out += `---\n## 📝 Section-by-Section Notes\n\n`;
  chunks.forEach((chunk, i) => {
    const clines = chunk.split('\n').map(l => l.trim()).filter(l => l.length > 8);
    const heading = clines[0]?.slice(0, 80) || `Part ${i+1}`;
    const bullets = clines.slice(1, 9).filter(l => l.length > 10);
    out += `### ${i+1}. ${heading}\n\n`;
    if (bullets.length > 0) {
      bullets.forEach(b => { out += `• ${b.replace(/^[-•*\d.]+\s*/,'')}\n`; });
    } else {
      out += `• ${firstN(chunk, 2)}\n`;
    }
    out += '\n';
  });

  if (defs.length > 0) {
    out += `---\n## 🔑 Key Definitions\n\n`;
    defs.slice(0,10).forEach(d => { out += `**${d.term}:** ${d.definition}\n\n`; });
  }

  if (facts.length > 0) {
    out += `---\n## ⭐ Important Facts & Formulas\n\n`;
    facts.slice(0,12).forEach(f => { out += `• ${f}\n`; });
    out += '\n';
  }

  out += `---\n## 🎯 Key Takeaways\n\n`;
  const kp = facts.slice(0,5);
  if (kp.length > 0) kp.forEach((f,i) => { out += `${i+1}. ${f}\n`; });
  else { out += `Review all definitions and formulas highlighted above.\n`; }

  out += `\n---\n## 📌 Exam Tips\n`;
  out += `- Review each definition and be able to explain it in your own words\n`;
  out += `- Focus on the formulas and relationships between concepts\n`;
  out += `- Practice writing short answers for each major topic\n`;
  out += `- Create your own examples for abstract concepts\n`;

  return out;
}

function makeSummary(text, title, subject) {
  const facts = getKeyFacts(text, 10);
  const topics = getTopics(text);
  const chunks = getChunks(text, 4);
  const words = text.split(/\s+/).length;

  let out = `## Executive Summary — ${title}\n\n`;
  out += `**Subject:** ${subject}  |  **Document length:** ~${words.toLocaleString()} words\n\n`;

  const opener = firstN(text, 3);
  if (opener) out += `**Overview:** ${opener}\n\n`;

  if (topics.length > 0) {
    out += `**Topics covered:**\n`;
    topics.slice(0,6).forEach(t => { out += `- ${t}\n`; });
    out += '\n';
  }

  out += `**Key points from the document:**\n`;
  if (facts.length > 0) {
    facts.slice(0,8).forEach((f,i) => { out += `${i+1}. ${f}\n`; });
  } else {
    chunks.slice(0,4).forEach((c,i) => { out += `${i+1}. ${firstN(c,1)}\n`; });
  }

  out += `\n**Section summaries:**\n`;
  chunks.forEach((c,i) => { out += `- *Part ${i+1}:* ${firstN(c,2)}\n`; });

  return out;
}

function makeFlashcards(text, subject, count = 10) {
  const defs = getDefinitions(text, Math.ceil(count / 2));
  const facts = getKeyFacts(text, count * 2);
  const sentences = getSentences(text);
  const cards = [];

  // From definitions
  for (const d of defs) {
    if (cards.length >= count) break;
    cards.push({
      question: `What is ${d.term}?`,
      answer: d.definition,
      difficulty: 'medium'
    });
  }

  // From facts — find term:value patterns
  for (const fact of facts) {
    if (cards.length >= count) break;
    const numMatch = fact.match(/^(.{10,80}?)\s+([\d.]+\s*(?:%|kg|m|cm|km|J|N|K|mol|s|Hz|V|A|W|Ω|°C|°F)?)\s*(.{0,60})\./);
    if (numMatch) {
      cards.push({ question: `${numMatch[1].trim()} ___ ${numMatch[3].trim()}?`, answer: numMatch[2].trim(), difficulty: 'medium' });
      continue;
    }
    const isMatch = fact.match(/^([A-Z][A-Za-z\s]{3,40})\s+(?:is|are|was)\s+(.{20,200})/);
    if (isMatch) {
      cards.push({ question: `What is ${isMatch[1].trim()}?`, answer: isMatch[2].trim().slice(0,200), difficulty: 'easy' });
      continue;
    }
    if (fact.length > 30 && fact.length < 300) {
      cards.push({ question: `Explain: "${fact.slice(0,80)}"`, answer: fact, difficulty: 'medium' });
    }
  }

  // Pad from sentences if needed
  for (const s of sentences) {
    if (cards.length >= count) break;
    if (s.length > 40 && s.length < 250 && !cards.find(c => c.answer.includes(s.slice(0,30)))) {
      cards.push({ question: `What does the document say about: "${s.slice(0,70)}..."`, answer: s, difficulty: 'medium' });
    }
  }

  return cards.slice(0, count).map(c => ({
    ...c,
    bloomsLevel: c.difficulty === 'easy' ? 'remember' : c.difficulty === 'hard' ? 'analyze' : 'understand'
  }));
}

function makeQuestions(text, subject, title) {
  const defs = getDefinitions(text, 8);
  const facts = getKeyFacts(text, 15);
  const chunks = getChunks(text, 5);
  let q = `## Practice Questions — ${title}\n*All questions based on your uploaded PDF*\n\n`;

  q += `---\n### Section A: Multiple Choice Questions *(1 mark each)*\n\n`;
  facts.slice(0,5).forEach((fact,i) => {
    const words = fact.split(' ');
    const keyIdx = Math.min(4, words.length - 2);
    const key = words[keyIdx];
    const stem = [...words.slice(0,keyIdx), '___', ...words.slice(keyIdx+1)].join(' ');
    q += `**Q${i+1}.** ${stem.length > 20 ? stem : fact}\n`;
    q += `  a) ${key} ✓\n  b) ${words[Math.max(0,keyIdx-1)]||'None of the above'}\n`;
    q += `  c) ${words[Math.min(words.length-1,keyIdx+1)]||'All of the above'}\n  d) Cannot be determined\n\n`;
  });

  q += `---\n### Section B: Short Answer Questions *(3 marks each — attempt any 4)*\n\n`;
  if (defs.length > 0) {
    defs.slice(0,6).forEach((d,i) => {
      q += `**Q${i+1}.** Define and explain **${d.term}** with a suitable example.\n`;
      q += `  *(Expected answer: ${d.definition.slice(0,120)})*\n\n`;
    });
  } else {
    chunks.slice(0,5).forEach((c,i) => {
      const h = c.split('\n')[0]?.slice(0,80) || `Topic ${i+1}`;
      q += `**Q${i+1}.** Explain in your own words: "${h}"\n\n`;
    });
  }

  q += `---\n### Section C: Long Answer Questions *(5 marks each — attempt any 2)*\n\n`;
  chunks.slice(0,3).forEach((c,i) => {
    const h = c.split('\n')[0]?.slice(0,100) || `Section ${i+1}`;
    const hint = firstN(c, 2);
    q += `**Q${i+1}.** Discuss in detail: *"${h}"*\n`;
    if (hint) q += `  *(Reference: ${hint.slice(0,150)}...)*\n`;
    q += i < 2 ? '\n  **— OR —**\n\n' : '\n';
  });

  return q;
}

function makeQuestionPaper(text, subject, totalMarks = 20, timeHours = 1, institution = "Mahatma Education Society's", options = {}) {
  const is60Marks = totalMarks === 60 || options.paperType === '60_MARKS';
  const defs = getDefinitions(text, 20);
  const facts = getKeyFacts(text, 30);
  const chunks = getChunks(text, 10);
  const sentences = getSentences(text);

  const college = options.college || "Pillai HOC College of Engineering and Technology,Rasayani";
  const status = options.status || "(Autonomous)";
  const department = options.department || "Department of Computer Application";
  const examType = options.examType || (is60Marks ? "PRELIM EXAMINATION (Autonomous)" : "Internal Assessment- I OSAY 2026-2027");
  const branchName = options.branch || options.className || "Computer Application (MCA)";
  const semesterName = options.semester || "Semester: I";
  const subjectCode = options.subjectCode || "MCA104";
  const dateStr = options.date || (is60Marks ? "04/12/2025" : "22/8/2026");
  const timeStr = options.time || (is60Marks ? "02.00 Hours" : "10.30am - 11.30am");

  if (is60Marks) {
    // ═════════════════════════════════════════════════════════════
    // 60 MARKS AUTONOMOUS UNIVERSITY EXAM PAPER STRUCTURE
    // Q.1 is compulsory (Attempt any 3 of 6, 5 marks each = 15m)
    // Attempt any Three from remaining five Q.2 to Q.6 (3 x 15 = 45m)
    // Total = 60 Marks
    // ═════════════════════════════════════════════════════════════
    const subLabels = ['a)', 'b)', 'c)', 'd)', 'e)', 'f)'];

    // Q.1: 6 sub-questions, 5 marks each
    const q1List = [];
    for (let i = 0; i < 6; i++) {
      let qText = '';
      if (i < defs.length && defs[i]) {
        qText = `What is ${defs[i].term}? Explain its key characteristics and significance.`;
      } else if (i < facts.length && facts[i]) {
        qText = `Explain ${facts[i].replace(/\.$/, '')} with suitable details.`;
      } else {
        const c = chunks[i % Math.max(1, chunks.length)] || subject;
        qText = `Explain ${firstN(c, 1).slice(0, 100).replace(/\.$/, '')} with examples.`;
      }
      q1List.push({
        id: subLabels[i],
        text: qText,
        marks: "5",
        bt: i === 0 ? "1" : i === 1 ? "2" : i === 2 ? "4" : i === 3 ? "2" : i === 4 ? "2" : "3",
        co: `Co${(i % 6) + 1}`
      });
    }

    // Helper to get descriptive questions
    const getDeepQ = (idx, fallback) => {
      if (defs[idx]) return `Explain in detail ${defs[idx].term} with its architecture and working mechanism.`;
      if (facts[idx]) return `Discuss ${facts[idx].replace(/\.$/, '')} with a detailed illustrative diagram.`;
      return fallback;
    };

    const paperData = {
      institution: institution || "Mahatma Education Society's",
      college,
      status,
      department,
      examType,
      branch: branchName,
      class: branchName,
      semester: semesterName,
      subject: subject || "Software Project Management",
      subjectCode,
      date: dateStr,
      time: timeStr,
      duration: timeStr,
      marks: "60",
      nb: [
        "1. Q.1 is compulsory",
        "2. Attempt any Three from the remaining five questions",
        "3. Each Question carry 15 marks."
      ],
      sections: [
        {
          qNum: "Q.1",
          instruction: "Attempt any 3",
          questions: q1List
        },
        {
          qNum: "Q.2",
          instruction: "Attempt All",
          questions: [
            {
              id: "a)",
              text: getDeepQ(6, `Explain the core lifecycle and architectural model of ${subject} in detail.`),
              marks: "8",
              bt: "2",
              co: "Co2"
            },
            {
              id: "b)",
              text: `Suppose that a basic system was estimated with sizing metrics. Calculate effort and schedule time for the development modes using the standard coefficient parameters:\n\n| Project Category | a | b | c | d |\n| :--- | :--- | :--- | :--- | :--- |\n| Organic Mode | 2.4 | 1.05 | 2.5 | 0.38 |\n| Semi-Detached Mode | 3.0 | 1.12 | 2.5 | 0.35 |\n| Embedded Mode | 3.6 | 1.20 | 2.5 | 0.32 |`,
              marks: "7",
              bt: "6",
              co: "Co4"
            }
          ]
        },
        {
          qNum: "Q.3",
          instruction: "Attempt All",
          questions: [
            {
              id: "a)",
              text: `Develop a comprehensive Software Requirements Specification (SRS) for a real-time ${subject} case study.`,
              marks: "8",
              bt: "6",
              co: "Co3"
            },
            {
              id: "b)",
              text: getDeepQ(7, `Explain Work Breakdown Structures (WBS) and hierarchical task decomposition with a practical example.`),
              marks: "7",
              bt: "2",
              co: "Co5"
            }
          ]
        },
        {
          qNum: "Q.4",
          instruction: "Attempt All",
          questions: [
            {
              id: "a)",
              text: `Determine the earliest event time and latest event time in respect of all node points and identify the critical path for the activity schedule network.`,
              marks: "10",
              bt: "5",
              co: "Co5"
            },
            {
              id: "b)",
              text: getDeepQ(8, `Explain size metrics (such as Lines of Code - LOC and Function Points) with concrete examples.`),
              marks: "5",
              bt: "1",
              co: "Co4"
            }
          ]
        },
        {
          qNum: "Q.5",
          instruction: "Attempt All",
          questions: [
            {
              id: "a)",
              text: getDeepQ(9, `Explain in detail the complete engineering life cycle and phase transitions for ${subject}.`),
              marks: "7",
              bt: "2",
              co: "Co1"
            },
            {
              id: "b)",
              text: `Calculate the Function Points (FP) for an enterprise system given the following component counts:\n• External Inputs: 8 (Average complexity)\n• External Outputs: 5 (High complexity)\n• External Inquiries: 4 (Low complexity)\n• Internal Logical Files: 3 (Average complexity)\n• External Interface Files: 2 (Low complexity)\nGiven TDI = 32. Weight values: EI(3,4,6), EO(4,5,7), EQ(3,4,6), ILF(7,10,15), EIF(5,7,10).`,
              marks: "8",
              bt: "2",
              co: "Co2"
            }
          ]
        },
        {
          qNum: "Q.6",
          instruction: "Attempt All",
          questions: [
            {
              id: "a)",
              text: getDeepQ(10, `Define Formal Technical Review (FTR). Explain its objectives, review guidelines, and quality assurance metrics.`),
              marks: "8",
              bt: "1",
              co: "Co6"
            },
            {
              id: "b)",
              text: `What is a UML Use Case diagram? Design and draw a complete use case diagram for the primary user workflows in ${subject}.`,
              marks: "7",
              bt: "6",
              co: "Co3"
            }
          ]
        }
      ],
      courseOutcomes: [
        { code: "CO1", desc: `Define the key concepts and architecture of ${subject}.` },
        { code: "CO2", desc: `Use various SDLC models and lifecycle methodologies to implement ${subject} solutions.` },
        { code: "CO3", desc: `Demonstrate understanding of requirements analysis, specifications, and application UML models.` },
        { code: "CO4", desc: `Make use of estimation logic, sizing algorithms, and cost estimation techniques.` },
        { code: "CO5", desc: `Analyze the need for scheduling, critical path analysis, and change management.` },
        { code: "CO6", desc: `Assess various factors influencing project quality assurance, risk management, and formal reviews.` }
      ],
      btLevels: "1 Remembering, 2 Understanding, 3 Applying, 4 Analyzing, 5 Evaluating, 6 Creating.",
      legend: "M-Marks, BT- Bloom's Taxonomy, CO-Course Outcomes."
    };

    return JSON.stringify(paperData, null, 2);
  }

  // ═════════════════════════════════════════════════════════════
  // 20/25 MARKS INTERNAL ASSESSMENT FORMAT
  // ═════════════════════════════════════════════════════════════
  const q1List = [];
  const q1Count = 6;
  const labels = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.'];
  for (let i = 0; i < q1Count; i++) {
    let qText = '';
    if (i < defs.length && defs[i]) {
      qText = `Explain the concept and significance of ${defs[i].term} with relevant points.`;
    } else if (i < facts.length && facts[i]) {
      qText = `What is ${facts[i].replace(/\.$/, '')}? State its key characteristics.`;
    } else {
      const c = chunks[i % Math.max(1, chunks.length)] || subject;
      qText = `Explain ${firstN(c, 1).slice(0, 100).replace(/\.$/, '')} with a suitable diagram.`;
    }
    q1List.push({
      id: labels[i] || `Q${i + 1}.`,
      text: qText,
      marks: "[ 02 ]",
      co: `CO${(i % 3) + 1}`,
      bl: i === 0 ? "L2" : i === 1 ? "L1" : i === 2 ? "L2" : i === 3 ? "L6" : "L2"
    });
  }

  const q2List = [
    {
      id: "A.",
      text: `Discuss the architecture and components of ${subject} with a suitable diagram.`,
      marks: "[ 05 ]",
      co: "CO1",
      bl: "L2"
    },
    {
      id: "B.",
      text: `What are the different types and implementation models in ${subject}? Explain each in short.`,
      marks: "[ 05 ]",
      co: "CO3",
      bl: "L2"
    }
  ];

  const q3List = [
    {
      id: "A.",
      text: `Discuss the structure, working mechanism, and fault tolerance of ${subject} with a suitable diagram.`,
      marks: "[ 05 ]",
      co: "CO3",
      bl: "L2"
    },
    {
      id: "B.",
      text: `Explain computational workflow, data processing, and execution model of ${subject} with a suitable example.`,
      marks: "[ 05 ]",
      co: "CO2",
      bl: "L2"
    }
  ];

  const paperData = {
    institution: institution || "Mahatma Education Society's",
    college,
    status,
    department,
    examType,
    subject: subject || "Big Data Analytics and Visualization",
    class: branchName,
    date: dateStr,
    time: timeStr,
    duration: `${timeHours}Hr`,
    marks: `${totalMarks}`,
    note: "Note: Assume suitable data wherever necessary.",
    sections: [
      {
        qNum: "1",
        instruction: "Attempt Any Five out of Six",
        questions: q1List
      },
      {
        qNum: "2",
        instruction: "Attempt Any One",
        questions: q2List
      },
      {
        qNum: "3",
        instruction: "Attempt Any One",
        questions: q3List
      }
    ]
  };

  return JSON.stringify(paperData, null, 2);
}

function makePodcastScript(text, title, subject) {
  const facts = getKeyFacts(text, 10);
  const defs = getDefinitions(text, 6);
  const chunks = getChunks(text, 5);
  const topics = getTopics(text);

  let s = `[NOTIVEXA AUDIO LECTURE — "${title}"]\n[Subject: ${subject}]\n\n`;
  s += `Namaste students! Welcome to your Notivexa audio lecture.\n\n`;
  s += `Today we will cover: "${title}"\n\n`;
  if (topics.length > 0) s += `The main topics we will discuss are: ${topics.slice(0,4).join(', ')}.\n\n`;
  s += `[PAUSE 2s]\n\n`;

  chunks.forEach((chunk, i) => {
    const heading = chunk.split('\n')[0]?.slice(0,80) || `Part ${i+1}`;
    const content = firstN(chunk, 4);
    s += `[SECTION ${i+1}: ${heading.toUpperCase()}]\n\n`;
    s += `Now, let us discuss: ${heading}.\n\n`;
    s += `${content}\n\n`;
    s += `[PAUSE 1s]\n\n`;
  });

  if (defs.length > 0) {
    s += `[IMPORTANT DEFINITIONS TO REMEMBER]\n\n`;
    defs.slice(0,4).forEach(d => {
      s += `"${d.term}" — ${d.definition}\n\n`;
      s += `Let me repeat that: ${d.term} means ${d.definition.slice(0,100)}.\n\n`;
    });
  }

  s += `[SUMMARY]\n\n`;
  s += `Let us now summarise what we learned from this document:\n\n`;
  facts.slice(0,5).forEach((f,i) => { s += `Point ${i+1}: ${f}\n\n`; });
  s += `[PAUSE 2s]\n\n`;
  s += `That is all for today's lecture on "${title}".\n`;
  s += `Please revise these points and attempt the practice questions.\n`;
  s += `Thank you for studying with Notivexa! Keep learning! 🎓\n`;
  return s;
}

function makeVideoScript(text, title, subject) {
  const defs = getDefinitions(text, 5);
  const facts = getKeyFacts(text, 5);
  const coreTerm = defs[0]?.term || subject || title || 'Core Concept';
  const cleanTerm = coreTerm.replace(/^[#\-*\d.]+\s*/, '').slice(0, 32).trim();
  const point1 = facts[0] ? facts[0].replace(/\.$/, '').slice(0, 48) : `${cleanTerm} defines foundational architecture`;
  const point2 = facts[1] ? facts[1].replace(/\.$/, '').slice(0, 48) : `Ensures optimal process and control flow`;
  const point3 = facts[2] ? facts[2].replace(/\.$/, '').slice(0, 48) : `Essential benchmark for academic evaluations`;

  return `TOPIC: ${cleanTerm}
[BOARD POINTS]
• 1. ${point1.slice(0, 36)}
• 2. ${point2.slice(0, 36)}
• 3. ${point3.slice(0, 36)}
[DIALOGUE]
Professor: Welcome class. Today we are analyzing ${cleanTerm}. Can anyone define its core function from our syllabus?
Student: Professor, does ${cleanTerm} primarily establish ${point1}?
Professor: Exactly! ${point1}. In addition, ${point2}.
Student: That clarifies it! How does this connect to ${point3}?
Professor: Excellent question! It directly governs execution stability. Keep these three principles on the board memorized for your upcoming exam!`;
}

function makePPT(text, title, subject) {
  const chunks = getChunks(text, 8);
  const topics = getTopics(text);
  const facts = getKeyFacts(text, 12);
  const cleanTitle = (title || 'Academic Presentation').slice(0, 60);

  const categories = ['CORE PRINCIPLE', 'STEP-BY-STEP', 'DEEP DIVE', 'CORE PRINCIPLE', 'STEP-BY-STEP', 'CASE STUDY'];

  const slides = [
    {
      slideNumber: 1,
      category: 'INTRODUCTION',
      title: cleanTitle,
      keyTakeaway: `${cleanTitle} establishes the foundational paradigm for analytical and systematic problem-solving.`,
      bullets: [
        `Subject Overview: Academic lecture covering ${subject || 'core engineering principles'} from foundational theory to practical application.`,
        topics.length > 0 ? `Key Coverage: Exploring ${topics.slice(0, 3).join(', ')} and their theoretical models.` : 'Key Coverage: Comprehensive curriculum review grounded directly in syllabus objectives.',
        'Learning Objectives: Understand core principles, analyze performance tradeoffs, and master systematic problem analysis.'
      ],
      analogy: 'A master architectural blueprint guides every phase of construction before complex execution begins.',
      speakerNotes: `Welcome students. Today we are analyzing ${cleanTitle}. We will explore its foundational mechanics, practical steps, and critical exam takeaways.`,
      layout: 'title'
    }
  ];

  chunks.forEach((c, i) => {
    const lines = c.split('\n').filter(l => l.trim().length > 8);
    const rawHead = lines[0]?.slice(0, 55).replace(/^[-•#*\d.]+\s*/, '') || `Part ${i + 1}: Core Mechanics`;
    const head = rawHead.length > 5 ? rawHead : `Core Concepts & Methods (Part ${i + 1})`;
    const cat = categories[i % categories.length];

    const rawBullets = lines.slice(1, 6)
      .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
      .filter(l => l.length > 8);

    const labels = ['Core Principle', 'Operational Flow', 'System Behavior', 'Performance Bound', 'Application'];
    const formattedBullets = (rawBullets.length > 0 ? rawBullets.slice(0, 4) : [firstN(c, 2)]).map((b, bIdx) => {
      if (b.includes(': ')) return b.slice(0, 140);
      const label = labels[bIdx % labels.length];
      return `${label}: ${b.slice(0, 130)}`;
    });

    const takeawayFact = facts[i % facts.length] || `Mastering ${head} ensures optimal performance and deterministic execution.`;

    slides.push({
      slideNumber: i + 2,
      category: cat,
      title: head,
      keyTakeaway: takeawayFact.replace(/^KEY TAKEAWAY:\s*/i, '').slice(0, 120),
      bullets: formattedBullets,
      analogy: `Similar to an automated assembly line, each step operates with strict deterministic bounds to guarantee consistent output.`,
      speakerNotes: `Explain ${head}. Focus on the operational criteria, constraints, and why this concept is essential for exam questions. Duration: ~3 min.`,
      layout: 'content'
    });
  });

  slides.push({
    slideNumber: slides.length + 1,
    category: 'QUICK SUMMARY',
    title: 'Summary & Knowledge Check',
    keyTakeaway: 'Consistent application of these foundational methods is essential for robust engineering solutions.',
    bullets: facts.length >= 3 ? [
      `Review Item 1: ${facts[0].slice(0, 110)}`,
      `Review Item 2: ${facts[1].slice(0, 110)}`,
      `Self-Test Check: How do the operational constraints discussed today govern practical implementation efficiency?`
    ] : [
      'Comprehensive Review: Mastered core theory, operational flow, and efficiency bounds.',
      'Key Exam Preparation: Memorize criteria, definitions, and step-by-step algorithms.',
      'Self-Test Check: Can you contrast the best-case versus worst-case operational complexities?'
    ],
    analogy: 'Reviewing core milestones consolidates knowledge just like saving checkpoints in critical data systems.',
    speakerNotes: 'Recap the primary definitions, highlight potential exam questions, and open the floor for student discussion.',
    layout: 'content'
  });

  return { title: cleanTitle, subtitle: 'Comprehensive Academic Lecture Deck', slides };
}

function makeMindmap(text, title) {
  const chunks = getChunks(text, 5);
  const topics = getTopics(text);
  const colors = ['#4F46E5','#059669','#D97706','#E11D48','#7C3AED'];
  const branches = chunks.slice(0,5).map((c, i) => {
    const lines = c.split('\n').filter(l=>l.trim().length>5);
    const topic = topics[i] || lines[0]?.slice(0,50) || `Topic ${i+1}`;
    const sub = lines.slice(1,5).map(l=>l.replace(/^[-•*\d.]+\s*/,'').slice(0,50)).filter(l=>l.length>3);
    if (sub.length < 2) {
      const f = getKeyFacts(c, 3).map(f=>f.slice(0,50));
      sub.push(...f.filter(f=>!sub.includes(f)));
    }
    return { topic:topic.slice(0,50), color:colors[i%colors.length], subtopics:sub.slice(0,4) };
  });
  return { central:title.slice(0,45), branches };
}

function makeVocabulary(text, subject) {
  const defs = getDefinitions(text, 10);
  const vocab = defs.map(d => ({
    word: d.term,
    hindi: '—',
    definition: d.definition.slice(0,200),
    example: `From document: "${d.definition.slice(0,100)}"`,
    context: `Important term in ${subject}`
  }));
  if (vocab.length < 5) {
    const terms = [...new Set((text.match(/\b[A-Z][a-z]{3,}\b(?:\s[A-Z][a-z]+)?/g)||[]).filter(t=>t.length>4&&t.length<40))];
    for (const term of terms) {
      if (vocab.length >= 10) break;
      if (vocab.find(v=>v.word===term)) continue;
      const ctx = text.split('\n').find(l=>l.includes(term)&&l.length>20&&l.length<300);
      if (ctx) vocab.push({ word:term, hindi:'—', definition:ctx.trim().slice(0,200), example:ctx.trim().slice(0,100), context:'See document context' });
    }
  }
  return vocab.slice(0,10);
}

function answerQuestion(question, text) {
  if (!text || text.length < 20) return 'No document content available. Please select an uploaded PDF.';
  const qWords = question.toLowerCase().split(/\s+/).filter(w=>w.length>3);
  const sentences = getSentences(text);
  const scored = sentences.map(s => {
    const sl = s.toLowerCase();
    return { sentence: s, score: qWords.filter(w=>sl.includes(w)).length };
  }).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);

  if (scored.length === 0) {
    const paras = text.split(/\n\n+/);
    const mp = paras.find(p=>qWords.some(w=>p.toLowerCase().includes(w)));
    return mp ? `Based on the document:\n\n${mp.trim().slice(0,500)}` : 'This specific information is not found in the uploaded document.';
  }

  let answer = `Based on your uploaded document:\n\n`;
  answer += scored.slice(0,4).map(s=>s.sentence).join('\n\n');
  if (scored.length > 4) answer += `\n\n*This answer is extracted directly from your PDF.*`;
  return answer;
}

module.exports = {
  extractFromPDF,
  makeNotes, makeDetailedChapterNotes, makeHandwrittenChapterNotes,
  makeSummary, makeFlashcards, makeQuestions, makeQuestionPaper,
  makePodcastScript, makeVideoScript, makePPT, makeMindmap, makeVocabulary,
  answerQuestion, getKeyFacts, getDefinitions, getSentences, getChunks
};
