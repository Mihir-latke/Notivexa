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
  if (raw.length < 50) throw new Error('PDF has no readable text (may be scanned/image-only). Upload as image instead.');

  const text = cleanText(raw);
  const sections = buildSections(text);
  const words = text.split(/\s+/).filter(Boolean).length;

  console.log(`[PDF ✅] pages=${data.numpages} words=${words} sections=${sections.length} chars=${text.length}`);
  return { text, sections, pages: data.numpages || 0, words };
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
    return /^(chapter|unit|section|module|topic|part)\s+[\d\w]/i.test(t) ||
           /^\d+\.\s+[A-Z]/.test(t) ||
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
  const defs = getDefinitions(text, 10);
  const facts = getKeyFacts(text, 15);
  const chunks = getChunks(text, 6);

  const college = options.college || "Pillai HOC College of Engineering and Technology, Rasayani.";
  const status = options.status || "(Autonomous)";
  const department = options.department || "Department of Computer Application";
  const examType = options.examType || (totalMarks <= 25 ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination");
  const className = options.class || options.className || "SY-MCA";
  const dateStr = options.date || "22/8/2026";
  const timeStr = options.time || (totalMarks <= 25 ? "10.30am - 11.30am" : "10.30am - 12.30pm");

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
      marks: totalMarks <= 25 ? "[ 02 ]" : "[ 05 ]",
      co: `CO${(i % 3) + 1}`,
      bl: i === 0 ? "L2" : i === 1 ? "L1" : i === 2 ? "L2" : i === 3 ? "L6" : "L2"
    });
  }

  const q2List = [
    {
      id: "A.",
      text: `Discuss the architecture and components of ${subject} with a suitable diagram.`,
      marks: totalMarks <= 25 ? "[ 05 ]" : "[ 10 ]",
      co: "CO1",
      bl: "L2"
    },
    {
      id: "B.",
      text: `What are the different types and implementation models in ${subject}? Explain each in short.`,
      marks: totalMarks <= 25 ? "[ 05 ]" : "[ 10 ]",
      co: "CO3",
      bl: "L2"
    }
  ];

  const q3List = [
    {
      id: "A.",
      text: `Discuss the structure, working mechanism, and fault tolerance of ${subject} with a suitable diagram.`,
      marks: totalMarks <= 25 ? "[ 05 ]" : "[ 10 ]",
      co: "CO3",
      bl: "L2"
    },
    {
      id: "B.",
      text: `Explain computational workflow, data processing, and execution model of ${subject} with a suitable example.`,
      marks: totalMarks <= 25 ? "[ 05 ]" : "[ 10 ]",
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
    class: className,
    date: dateStr,
    time: timeStr,
    duration: `${timeHours}Hr`,
    marks: `${totalMarks}`,
    note: "Note: Assume suitable data wherever necessary.",
    sections: [
      {
        qNum: "1",
        instruction: totalMarks <= 25 ? "Attempt Any Five out of Six" : "Attempt Any Four out of Six",
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
  const chunks = getChunks(text, 7);
  const facts = getKeyFacts(text, 8);
  let s = '';
  s += `[SLIDE 1: TITLE]\nTitle: ${title}\nSubject: ${subject}\nSource: Your Uploaded PDF Document\nNarration: Namaste! Today we study "${title}". All content is from your PDF.\nDuration: 30s\n\n`;
  chunks.forEach((c, i) => {
    const lines = c.split('\n').filter(l => l.trim().length > 8);
    const head = lines[0]?.slice(0,70) || `Topic ${i+1}`;
    const bullets = lines.slice(1,6).map(l => l.replace(/^[-•*\d.]+\s*/,'').slice(0,100)).filter(l=>l.length>5);
    const narr = firstN(c, 3);
    s += `[SLIDE ${i+2}: ${head.toUpperCase()}]\nVisual:\n${bullets.map(b=>`  • ${b}`).join('\n')||`  • ${head}`}\nNarration: ${narr}\nDuration: 90s\n\n`;
  });
  s += `[SLIDE ${chunks.length+2}: KEY TAKEAWAYS]\nVisual:\n${facts.slice(0,5).map(f=>`  • ${f.slice(0,90)}`).join('\n')}\nNarration: Let us recap. ${facts.slice(0,3).join(' ')} Thank you!\nDuration: 60s\n`;
  return s;
}

function makePPT(text, title, subject) {
  const chunks = getChunks(text, 8);
  const topics = getTopics(text);
  const facts = getKeyFacts(text, 8);
  const slides = [
    {
      slideNumber: 1, title: title.slice(0,60),
      bullets: [`Subject: ${subject}`, 'Source: Your uploaded PDF document', topics.length > 0 ? `Topics: ${topics.slice(0,3).join(', ')}` : 'See following slides'],
      speakerNotes: 'Introduce the document topic.', layout: 'title'
    }
  ];
  chunks.forEach((c, i) => {
    const lines = c.split('\n').filter(l=>l.trim().length>8);
    const head = lines[0]?.slice(0,60) || `Part ${i+1}`;
    const bullets = lines.slice(1,7).map(l=>l.replace(/^[-•*\d.]+\s*/,'').slice(0,100)).filter(l=>l.length>5);
    slides.push({ slideNumber:i+2, title:head, bullets:bullets.length>0?bullets:[firstN(c,2)], speakerNotes:`Explain ${head}. Duration: ~2 min.`, layout:'content' });
  });
  slides.push({ slideNumber:slides.length+1, title:'Summary & Key Points', bullets:facts.slice(0,6).map(f=>f.slice(0,90)), speakerNotes:'Recap main points. Open for Q&A.', layout:'content' });
  return { title, subtitle:'From your uploaded PDF', slides };
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
  makeNotes, makeSummary, makeFlashcards, makeQuestions, makeQuestionPaper,
  makePodcastScript, makeVideoScript, makePPT, makeMindmap, makeVocabulary,
  answerQuestion, getKeyFacts, getDefinitions, getSentences, getChunks
};
