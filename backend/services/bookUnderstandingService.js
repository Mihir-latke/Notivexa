/**
 * bookUnderstandingService.js — Universal Book Classification & Structure Understanding Engine
 * 
 * Provides:
 * 1. Deep Multi-class Book Classification (Novels, Textbooks, Poetry, History, CS, Research Papers, etc.)
 * 2. Multi-lingual Chapter & Section Boundary Detection (English, Marathi, Hindi, etc.)
 * 3. Front-Matter & Running-Header Filtering (eliminates ISBN, copyright, bare page numbers from becoming topics)
 * 4. Entity & Narrative Extraction (Characters, Themes, Timelines, Definitions, Research Problems)
 * 5. Extraction Quality & Readability Assessment
 * 
 * 100% Offline, Deterministic, and Local.
 */

const DOCUMENT_TYPES = {
  academic_textbook: {
    id: 'academic_textbook',
    name: 'Academic Textbook',
    icon: '📚',
    description: 'Syllabus-oriented textbook with concepts, definitions, and review questions'
  },
  novel_fiction: {
    id: 'novel_fiction',
    name: 'Novel & Fiction',
    icon: '📖',
    description: 'Literary narrative with characters, dialogue, plot progression, and themes'
  },
  poetry_literature: {
    id: 'poetry_literature',
    name: 'Poetry & Drama',
    icon: '🎭',
    description: 'Poetic verses, stanzas, dramatic plays, dialogues, or literary prose'
  },
  history_biography: {
    id: 'history_biography',
    name: 'History & Biography',
    icon: '📜',
    description: 'Chronological historical accounts, biographical life stages, dynasties, and battles'
  },
  science_mathematics: {
    id: 'science_mathematics',
    name: 'Science & Mathematics',
    icon: '🔬',
    description: 'Theorems, formulas, derivations, proofs, and scientific observations'
  },
  computer_science: {
    id: 'computer_science',
    name: 'Computer Science & Tech',
    icon: '💻',
    description: 'Software architecture, algorithms, coding paradigms, data structures, and APIs'
  },
  research_paper: {
    id: 'research_paper',
    name: 'Research Paper',
    icon: '📑',
    description: 'Peer-reviewed academic research with abstract, methodology, results, and citations'
  },
  study_guide: {
    id: 'study_guide',
    name: 'Study Guide & Question Bank',
    icon: '📝',
    description: 'Exam preparation summaries, sample question papers, model answers, and revision notes'
  },
  reference_manual: {
    id: 'reference_manual',
    name: 'Reference Manual & Handbook',
    icon: '📕',
    description: 'Encyclopedic reference, operational documentation, dictionary, or catalog'
  },
  general_nonfiction: {
    id: 'general_nonfiction',
    name: 'General Non-Fiction',
    icon: '💡',
    description: 'Informative essays, self-help, philosophy, business, or journalistic writing'
  }
};

/**
 * Strips noisy running headers, page numbers, and standalone artifact lines.
 * Examples: "Page 1", "Page 25", "1 of 83", "chhava • General", etc.
 */
function cleanRunningHeadersAndNoise(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // Keep paragraph breaks

      // Filter bare page numbers: "Page 1", "Page 12", "page 10 of 83", "[1]", "p. 45"
      if (/^(page|pg\.?|p\.)\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(trimmed)) return false;
      if (/^\d+\s*(of|\/)\s*\d+$/i.test(trimmed)) return false;
      if (/^\[\d+\]$/.test(trimmed)) return false;
      if (/^\d{1,4}$/.test(trimmed)) return false; // Standalone number line

      // Filter running headers like "chhava • General", "Document Name  |  Chapter 1"
      if (/^[A-Za-z0-9\u0900-\u097F\s-]{2,40}\s*[•|–—]\s*[A-Za-z0-9\u0900-\u097F\s-]{2,40}(\s*Page\s*\d+)?$/i.test(trimmed)) {
        return false;
      }

      // Filter barcode / ISBN lines from body text
      if (/^ISBN(-1[03])?:\s*[0-9-Xx]+$/i.test(trimmed)) return false;
      if (/^ISBN\s+for\s+(printed|e-?book)/i.test(trimmed)) return false;

      return true;
    })
    .join('\n');
}

/**
 * Classifies document content into a domain type.
 * Evaluates semantic vocabulary across English, Marathi, Hindi, and technical terms.
 * 
 * @param {string} text - Extracted document text
 * @param {Object} metadata - Optional title, filename, subject
 * @returns {{ type: string, confidence: number, reasoning: string, details: Object }}
 */
function classifyDocument(text, metadata = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      type: 'academic_textbook',
      confidence: 0.5,
      reasoning: 'Insufficient text to classify; defaulted to academic textbook.',
      details: {}
    };
  }

  const sample = text.slice(0, 45000); // 45KB sample
  const lower = sample.toLowerCase();
  const titleHint = ((metadata.title || '') + ' ' + (metadata.filename || '') + ' ' + (metadata.subject || '')).toLowerCase();

  const scores = {
    academic_textbook: 0,
    novel_fiction: 0,
    poetry_literature: 0,
    history_biography: 0,
    science_mathematics: 0,
    computer_science: 0,
    research_paper: 0,
    study_guide: 0,
    reference_manual: 0,
    general_nonfiction: 0
  };

  // 1. Research Paper Indicators
  const researchTerms = /\b(abstract|introduction|methodology|related work|experimental setup|evaluation|discussion|conclusion|references|doi:|et al\.|arxiv)\b/gi;
  const researchMatches = (sample.match(researchTerms) || []).length;
  scores.research_paper += researchMatches * 8;
  if (/^abstract\b/im.test(sample)) scores.research_paper += 25;

  // 2. Computer Science / Technical Indicators
  const csTerms = /\b(algorithm|data structure|complexity|runtime|database|sql|nosql|api|endpoint|backend|frontend|framework|compiler|source code|function|class|object-oriented|variable|memory allocation|cpu|cache|thread|concurrency|networking|protocol|tcp\/ip)\b/gi;
  const csMatches = (sample.match(csTerms) || []).length;
  scores.computer_science += csMatches * 6;

  // 3. Science & Mathematics Indicators
  const sciMathTerms = /\b(theorem|lemma|corollary|proof|formula|equation|derivative|integral|matrix|vector|chemical|molecule|reaction|thermodynamics|velocity|acceleration|dna|rna|cellular|organism|chromosome|gravity|quantum)\b/gi;
  const sciMathMatches = (sample.match(sciMathTerms) || []).length;
  scores.science_mathematics += sciMathMatches * 6;

  // 4. History & Biography Indicators
  // Multilingual: English + Marathi (इतिहास, साम्राज्य, राजे, महाराज, लढाई, किल्ला, पेशवे) + Hindi (इतिहास, सम्राट, युद्ध, क्रांति)
  const historyTerms = /\b(history|century|dynasty|reign|emperor|empire|battle|treaty|coronation|kingdom|monarch|sultan|rebellion|biography|memoir|इतिहास|साम्राज्य|महाराज|छत्रपती|राजे|किल्ला|पेशवे|लढाई|तहाची|मोगल|बादशाह|स्वराज्य|अष्टप्रधान|संभाजी|शिवाजी|औरंगजेब|सेनापती|दरबार|शके|क्रांती|सम्राट|युद्ध)\b/gi;
  const historyMatches = (sample.match(historyTerms) || []).length;
  scores.history_biography += historyMatches * 8;

  // 5. Novel & Fiction Indicators
  // Dialogue quotes, narrative storytelling, emotion, character interaction
  const dialogueQuotes = (sample.match(/["'“][^"'”\n]{5,100}["'”]/g) || []).length;
  scores.novel_fiction += Math.min(dialogueQuotes * 3, 40);

  // Literary terms in English, Marathi, Hindi
  const fictionTerms = /\b(novel|chapter|story|scene|character|protagonist|narrator|dialogue|whispered|screamed|glanced|smiled|tears|कादंबरी|कथा|प्रकरण|पात्रे|संवाद|उद्गार|दृश्य|मनोगत|वेदना|हसू|अश्रू|उपन्यास|कहानी|पात्र|नायक|नायिका)\b/gi;
  const fictionMatches = (sample.match(fictionTerms) || []).length;
  scores.novel_fiction += fictionMatches * 7;

  // 6. Poetry & Drama
  const poetryTerms = /\b(poem|poetry|stanza|rhyme|verse|meter|sonnet|soliloquy|act\s+[ivx\d]+|scene\s+[ivx\d]+|कविता|पद्य|कवी|कवयित्री|चरण|यमक|वृत्त|शायरी|गझल|गीत|नाटक|अंक\s+[१२३४५\d]+|प्रवेश)\b/gi;
  const poetryMatches = (sample.match(poetryTerms) || []).length;
  scores.poetry_literature += poetryMatches * 9;

  // 7. Study Guide & Question Bank
  const studyGuideTerms = /\b(question paper|model question|sample questions|multiple choice|mcq|marks|time allowed|maximum marks|attempt any|fill in the blanks|true or false|प्रश्नपत्रिका|गुण|उत्तर|स्वाध्याय|वस्तुनिष्ठ)\b/gi;
  const studyGuideMatches = (sample.match(studyGuideTerms) || []).length;
  scores.study_guide += studyGuideMatches * 10;

  // 8. Academic Textbook (Syllabus, Learning Objectives, Exercises)
  const textbookTerms = /\b(syllabus|learning objectives|chapter summary|review questions|exercise|case study|problems|unit\s+\d+|module\s+\d+|पाठ्यपुस्तक|अभ्यासक्रम|उद्दिष्टे|स्वाध्याय|प्रकरण)\b/gi;
  const textbookMatches = (sample.match(textbookTerms) || []).length;
  scores.academic_textbook += textbookMatches * 6;

  // Contextual Title / Metadata Boost
  if (titleHint) {
    if (/(chhava|chhaava|panipat|yayati|mrityunjay|radheya|novel|fiction|story)/i.test(titleHint)) {
      scores.novel_fiction += 30;
      if (/(chhava|panipat|mrityunjay)/i.test(titleHint)) scores.history_biography += 25;
    }
    if (/(history|dynasty|empire|biography|life of|shivaji|sambhaji|peshwa)/i.test(titleHint)) scores.history_biography += 25;
    if (/(textbook|course|introduction to|principles of|fundamentals of|grade|standard|class\s+\d+)/i.test(titleHint)) scores.academic_textbook += 20;
    if (/(paper|proceedings|journal|conference|ieee|acm|arxiv)/i.test(titleHint)) scores.research_paper += 30;
    if (/(poem|poetry|verses|geet|kavita)/i.test(titleHint)) scores.poetry_literature += 35;
    if (/(guide|handbook|manual|reference)/i.test(titleHint)) scores.reference_manual += 20;
  }

  // If text is novel / historical novel (e.g. Chhava is a renowned Marathi historical novel)
  // If fiction and history are both high, fiction takes precedent for narrative literary structure,
  // but we flag it as historical fiction in reasoning.
  let bestType = 'academic_textbook';
  let bestScore = -1;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // If fiction and history are close, it's historical fiction (e.g., Chhava, Mrityunjay, Panipat)
  let reasoning = `Classified as ${DOCUMENT_TYPES[bestType]?.name || bestType} based on vocabulary and structure.`;
  if (bestType === 'novel_fiction' && scores.history_biography > 25) {
    reasoning = 'Historical novel / Biographical literature with rich narrative, characters, and historical timeline.';
  } else if (bestType === 'history_biography' && scores.novel_fiction > 25) {
    // If dialogue and prose are heavy or title explicitly indicates novel, prioritize novel_fiction
    if (dialogueQuotes > 5 || /(novel|fiction|कादंबरी|उपन्यास)/i.test(titleHint)) {
      bestType = 'novel_fiction';
      reasoning = 'Historical novel / Biographical drama focusing on narrative events and character arcs.';
    }
  }

  const confidence = Math.min(0.98, Math.max(0.70, bestScore / (bestScore + 20)));

  return {
    type: bestType,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    details: scores
  };
}

/**
 * Parses real chapters and sections from a book, discarding ISBN, copyright, and running headers.
 * 
 * @param {string} rawText - Document text
 * @param {string} docType - Document classification
 * @returns {{
 *   title: string,
 *   author: string,
 *   chapters: Array<{ index: number, title: string, content: string, wordCount: number, isInferred: boolean }>,
 *   frontMatter: string,
 *   quality: { score: number, warning?: string }
 * }}
 */
function detectBookStructure(rawText, docType = 'academic_textbook', metadata = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      title: 'Document',
      author: '',
      chapters: [],
      frontMatter: '',
      quality: { score: 0, warning: 'No content available.' }
    };
  }

  // 1. Initial cleanup of page numbers and running noise
  const clean = cleanRunningHeadersAndNoise(rawText);
  const lines = clean.split('\n');

  // 2. Extract potential Title and Author from the first 50 lines
  let extractedTitle = '';
  let extractedAuthor = '';
  const first50 = lines.slice(0, 50).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < first50.length; i++) {
    const l = first50[i];
    // Exclude noise from title candidates
    if (/^(page|isbn|copyright|all rights|published|edition|printed|price|rs\.|cover)/i.test(l)) continue;

    // Detect Author line: "By [Author]", "लेखक : [Author]", "[Name] Sawant"
    const authorMatch = l.match(/(?:by|written by|author|लेखक|रचयिता|कवी)\s*[:–-]?\s*([A-Za-z\u0900-\u097F\s.]+)/i);
    if (authorMatch && authorMatch[1].length > 3) {
      extractedAuthor = authorMatch[1].trim();
      continue;
    }

    if (!extractedTitle && l.length > 2 && l.length < 80) {
      // First clean strong line is usually the title
      extractedTitle = l.replace(/^#+\s*/, '').trim();
    }
  }

  // 3. Chapter Heading Regex covering Multilingual patterns
  const chapterRegexes = [
    // Marathi & Hindi Chapter Patterns: प्रकरण १, अध्याय २, भाग ३, अंक १
    /^(प्रकरण|अध्याय|भाग|अंक|सत्र|पाठ)\s*([०-९\d]+|एक|दोन|तीन|चार|पाच|सहा|सात|आठ|नऊ|दहा)[\s:–-]*(.*)$/i,
    // English Chapter Patterns: Chapter 1, Part I, Module 2, Act 3
    /^(chapter|part|module|unit|act|scene)\s*([0-9]+|[ivxlcdm]+)[\s:–-]*(.*)$/i,
    // Markdown Level 1/2 headings that resemble chapters
    /^#{1,2}\s+(chapter|part|module|unit|प्रकरण|अध्याय|भाग)\s*([0-9\u0966-\u096F]+)[\s:–-]*(.*)$/i
  ];

  const chapters = [];
  let currentChapter = {
    index: 1,
    title: '',
    lines: [],
    isInferred: false
  };

  let hasExplicitChapters = false;
  let frontMatterLines = [];
  let pastFrontMatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentChapter.lines.length > 0) currentChapter.lines.push('');
      continue;
    }

    // Check for explicit chapter heading
    let matchedHeading = false;
    let headingText = '';

    for (const r of chapterRegexes) {
      const m = trimmed.match(r);
      if (m) {
        matchedHeading = true;
        hasExplicitChapters = true;
        pastFrontMatter = true;
        const prefix = m[1];
        const num = m[2];
        const subtitle = m[3] ? ` — ${m[3].trim()}` : '';
        headingText = `${prefix} ${num}${subtitle}`.trim();
        break;
      }
    }

    if (matchedHeading) {
      if (currentChapter.title && currentChapter.lines.length > 0) {
        const content = currentChapter.lines.join('\n').trim();
        if (content.length > 25) {
          chapters.push({
            index: chapters.length + 1,
            title: currentChapter.title,
            content,
            wordCount: content.split(/\s+/).filter(Boolean).length,
            isInferred: false
          });
        }
      } else if (!currentChapter.title && currentChapter.lines.length > 0) {
        frontMatterLines.push(...currentChapter.lines);
      }
      currentChapter = {
        index: chapters.length + 1,
        title: headingText,
        lines: [],
        isInferred: false
      };
    } else {
      if (!pastFrontMatter) {
        frontMatterLines.push(line);
      } else {
        currentChapter.lines.push(line);
      }
    }
  }

  // Push last chapter
  if (currentChapter.lines.length > 0) {
    const content = currentChapter.lines.join('\n').trim();
    if (content.length > 25) {
      chapters.push({
        index: chapters.length + 1,
        title: currentChapter.title || (hasExplicitChapters ? `Chapter ${chapters.length + 1}` : 'Document Content'),
        content,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        isInferred: !hasExplicitChapters
      });
    }
  }

  // 4. Inferred Structure Fallback: If no explicit "Chapter" markers were found,
  // chunk by major section breaks or natural paragraph blocks instead of leaving as 1 giant lump.
  if (chapters.length <= 1) {
    const paragraphs = clean.split(/\n\s*\n+/).filter(p => p.trim().length > 40);
    if (paragraphs.length >= 6) {
      const chunkSize = Math.max(3, Math.ceil(paragraphs.length / 6));
      const inferredChapters = [];
      for (let i = 0; i < paragraphs.length; i += chunkSize) {
        const slice = paragraphs.slice(i, i + chunkSize);
        const textChunk = slice.join('\n\n').trim();
        const firstLine = slice[0]?.split('\n')[0]?.trim().slice(0, 60) || `Part ${inferredChapters.length + 1}`;
        inferredChapters.push({
          index: inferredChapters.length + 1,
          title: `Section ${inferredChapters.length + 1}: ${firstLine} (Inferred)`,
          content: textChunk,
          wordCount: textChunk.split(/\s+/).filter(Boolean).length,
          isInferred: true
        });
      }
      return {
        title: extractedTitle || metadata.title || 'Document',
        author: extractedAuthor,
        chapters: inferredChapters,
        frontMatter: frontMatterLines.join('\n'),
        quality: calculateExtractionQuality(clean)
      };
    }
  }

  return {
    title: extractedTitle || metadata.title || 'Document',
    author: extractedAuthor,
    chapters,
    frontMatter: frontMatterLines.join('\n'),
    quality: calculateExtractionQuality(clean)
  };
}

/**
 * Calculates extraction quality score and flags unreadable/corrupted scans.
 */
function calculateExtractionQuality(text) {
  if (!text || text.trim().length === 0) {
    return { score: 0, isLowQuality: true, warning: 'Empty document. No readable text extracted.' };
  }

  const totalChars = text.length;
  const words = text.split(/\s+/).filter(Boolean);
  const letterMatches = text.match(/[\p{L}]/gu) || [];
  const letterCount = letterMatches.length;

  // Ratio of real alphabetic/syllabic letters to total characters
  const letterRatio = letterCount / Math.max(totalChars, 1);

  // Check if text is just noise/punctuation: e.g. ", - . , . , ."
  if (letterRatio < 0.25) {
    const score = Math.round(letterRatio * 100);
    return {
      score,
      isLowQuality: true,
      warning: 'Extracted text contains excessive punctuation/noise and very few letters. Scanned document may need manual OCR language configuration.'
    };
  }

  if (words.length < 20 && totalChars > 200) {
    return {
      score: 30,
      isLowQuality: true,
      warning: 'Low word count detected. Pages may be image-heavy or contain unreadable handwritten fonts.'
    };
  }

  const score = Math.min(100, Math.round(letterRatio * 125));
  return {
    score,
    isLowQuality: score < 50,
    warning: score < 50 ? 'Medium-low extraction quality. Verify extracted text before generating exam materials.' : null
  };
}

/**
 * Extracts literary characters, historical figures, or key concepts grounded in the text.
 */
function extractEntitiesAndThemes(text, docType = 'academic_textbook') {
  if (!text) return { entities: [], themes: [] };

  const sentences = text.split(/(?<=[.!?।॥\n])\s+/).filter(s => s.trim().length > 15);
  const entities = new Set();
  const themes = new Set();

  if (docType === 'novel_fiction' || docType === 'history_biography') {
    // Look for recurring proper nouns and historical figures
    // English names: Two capitalized words (e.g., "Shivaji Sawant", "Chhatrapati Sambhaji")
    const engNames = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) || [];
    engNames.forEach(n => {
      if (!/^(University Exam|Page \d+|Key Takeaway|Real-world Application|Academic Notes)/i.test(n)) {
        entities.add(n);
      }
    });

    // Marathi / Hindi honorifics & characters
    const indicNames = text.match(/\b(छत्रपती|राजे|महाराज|संभाजी|शिवाजी|येसूबाई|सोयराबाई|कलश|हंबीरराव|औरंगजेब|सुलतान|राजाराम|जिजाऊ|तानाजी)\b/g) || [];
    indicNames.forEach(n => entities.add(n));

    // Common literary themes
    const themeCues = [
      { regex: /\b(bravery|courage|शौर्य|पराक्रम|वीरता)\b/i, theme: 'Bravery & Valor (शौर्य आणि पराक्रम)' },
      { regex: /\b(sacrifice|त्याग|बलिदान)\b/i, theme: 'Sacrifice & Devotion (आत्मत्याग आणि निष्ठा)' },
      { regex: /\b(justice|duty|कर्तव्य|धर्म|न्याय)\b/i, theme: 'Duty, Justice & Sovereignty (कर्तव्य आणि स्वराज्य)' },
      { regex: /\b(betrayal|conspiracy|षड्यंत्र|फितुरी|दगाबाजी)\b/i, theme: 'Intrigue & Betrayal (राजकीय संघर्ष आणि फितुरी)' },
      { regex: /\b(sorrow|struggle|वेदना|संघर्ष|वेदना)\b/i, theme: 'Emotional Resilience & Struggle (जीवनातील संघर्ष)' }
    ];
    themeCues.forEach(tc => {
      if (tc.regex.test(text)) themes.add(tc.theme);
    });
  }

  return {
    entities: Array.from(entities).slice(0, 15),
    themes: Array.from(themes)
  };
}

module.exports = {
  DOCUMENT_TYPES,
  classifyDocument,
  detectBookStructure,
  calculateExtractionQuality,
  cleanRunningHeadersAndNoise,
  extractEntitiesAndThemes
};
