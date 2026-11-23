/**
 * academicRetrievalService.js — Notivexa Academic Document Grounding & Retrieval Engine
 * 
 * Provides unified RAG (Retrieval-Augmented Generation), page-grounded chunk indexing,
 * BM25 + keyword relevance scoring, and verifiable source citations for all 11 modules:
 * - Study Notes (source-anchored explanations)
 * - Summaries (page-referenced overviews)
 * - Practice Q&A (page-cited questions & answer explanations)
 * - Question Papers (syllabus-grounded questions)
 * - Document Chatbot (strict anti-hallucination document-grounded answers)
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'i', 'i\'m', 'i\'ve',
  'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most',
  'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll',
  'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when',
  'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with',
  'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours',
  'yourself', 'yourselves'
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function resolveChapterForPage(pageNumber, chapters = []) {
  if (!Array.isArray(chapters) || chapters.length === 0) return 'General';
  // If chapters have explicit page mappings or index
  for (let i = chapters.length - 1; i >= 0; i--) {
    const ch = chapters[i];
    if (ch.startPage && pageNumber >= ch.startPage) {
      return ch.title || `Chapter ${ch.index || i + 1}`;
    }
  }
  return chapters[0]?.title || 'Chapter 1';
}

/**
 * Breaks document content into indexed, page-tagged passages.
 */
function buildDocumentPassages(doc) {
  if (!doc) return [];
  const passages = [];

  // Case 1: Page results available from PDF / OCR extractor
  if (Array.isArray(doc.pageResults) && doc.pageResults.length > 0) {
    doc.pageResults.forEach((pageItem, pIdx) => {
      const pageText = (pageItem.text || '').trim();
      if (!pageText) return;

      const pageNum = pageItem.pageNumber || (pIdx + 1);
      const chapter = resolveChapterForPage(pageNum, doc.chapters);

      // Split page into manageable chunks of ~200-300 words
      const paragraphs = pageText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      let currentChunk = '';
      let chunkIndex = 1;

      paragraphs.forEach(p => {
        if ((currentChunk.length + p.length) > 1400) {
          if (currentChunk.trim().length > 40) {
            passages.push({
              id: `p${pageNum}_c${chunkIndex++}`,
              pageNumber: pageNum,
              chapter,
              text: currentChunk.trim(),
              tokens: tokenize(currentChunk)
            });
          }
          currentChunk = p;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + p;
        }
      });

      if (currentChunk.trim().length > 40) {
        passages.push({
          id: `p${pageNum}_c${chunkIndex}`,
          pageNumber: pageNum,
          chapter,
          text: currentChunk.trim(),
          tokens: tokenize(currentChunk)
        });
      }
    });
  }

  // Case 2: Fallback to chapters or full text if pageResults not available
  if (passages.length === 0) {
    const fullText = doc.extractedText || '';
    if (!fullText.trim()) return [];

    const rawParagraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let estimatedPage = 1;
    let wordAccumulator = 0;
    let currentChunk = '';
    let chunkIndex = 1;

    rawParagraphs.forEach(p => {
      const pWords = p.split(/\s+/).filter(Boolean).length;
      wordAccumulator += pWords;
      if (wordAccumulator > 320) {
        estimatedPage++;
        wordAccumulator = pWords;
      }

      if ((currentChunk.length + p.length) > 1400) {
        if (currentChunk.trim().length > 40) {
          passages.push({
            id: `p${estimatedPage}_c${chunkIndex++}`,
            pageNumber: estimatedPage,
            chapter: resolveChapterForPage(estimatedPage, doc.chapters),
            text: currentChunk.trim(),
            tokens: tokenize(currentChunk)
          });
        }
        currentChunk = p;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + p;
      }
    });

    if (currentChunk.trim().length > 40) {
      passages.push({
        id: `p${estimatedPage}_c${chunkIndex}`,
        pageNumber: estimatedPage,
        chapter: resolveChapterForPage(estimatedPage, doc.chapters),
        text: currentChunk.trim(),
        tokens: tokenize(currentChunk)
      });
    }
  }

  return passages;
}

/**
 * Searches document passages using hybrid BM25 + keyword relevance scoring.
 * 
 * @param {Object} doc - Document object with extractedText, pageResults, chapters
 * @param {string} query - Natural language search query or topic
 * @param {Object} options - { topK, chapterFilter, minScore }
 * @returns {Array<Object>} Ranked passages with page numbers, citations and snippets
 */
function searchDocumentPassages(doc, query, options = {}) {
  const { topK = 5, chapterFilter = null, minScore = 0.5 } = options;
  if (!query || typeof query !== 'string') return [];

  const passages = buildDocumentPassages(doc);
  if (passages.length === 0) return [];

  const qTokens = tokenize(query);
  const qLower = query.toLowerCase().trim();
  if (qTokens.length === 0) return passages.slice(0, topK);

  // Compute document frequencies for tokens
  const df = {};
  passages.forEach(p => {
    const uniqueTokens = new Set(p.tokens);
    uniqueTokens.forEach(t => {
      df[t] = (df[t] || 0) + 1;
    });
  });

  const totalPassages = passages.length;
  const scored = [];

  passages.forEach(p => {
    // Optional chapter filter
    if (chapterFilter && p.chapter && !p.chapter.toLowerCase().includes(chapterFilter.toLowerCase())) {
      return;
    }

    let score = 0;
    const passageTokens = p.tokens;
    const pLen = passageTokens.length || 1;
    const tokenFreq = {};
    passageTokens.forEach(t => { tokenFreq[t] = (tokenFreq[t] || 0) + 1; });

    // BM25 scoring
    const k1 = 1.2;
    const b = 0.75;
    const avgLen = 120;

    qTokens.forEach(qt => {
      const tf = tokenFreq[qt] || 0;
      if (tf > 0) {
        const idf = Math.log(1 + (totalPassages - (df[qt] || 1) + 0.5) / ((df[qt] || 1) + 0.5));
        const num = tf * (k1 + 1);
        const den = tf + k1 * (1 - b + b * (pLen / avgLen));
        score += idf * (num / den);
      }
    });

    // Exact phrase match bonus
    if (p.text.toLowerCase().includes(qLower)) {
      score += 15.0;
    }

    // Sub-phrase matching bonus
    const queryWords = qLower.split(/\s+/).filter(w => w.length > 3);
    let matchedWords = 0;
    queryWords.forEach(w => {
      if (p.text.toLowerCase().includes(w)) matchedWords++;
    });
    if (queryWords.length > 0 && matchedWords === queryWords.length) {
      score += 5.0;
    }

    if (score >= minScore) {
      scored.push({
        id: p.id,
        pageNumber: p.pageNumber,
        chapter: p.chapter,
        text: p.text,
        score,
        snippet: p.text.length > 250 ? p.text.slice(0, 250) + '...' : p.text,
        citation: `[Page ${p.pageNumber}${p.chapter && p.chapter !== 'General' ? `, ${p.chapter}` : ''}]`
      });
    }
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Fallback: return first passages to avoid total emptiness
    return passages.slice(0, topK).map(p => ({
      id: p.id,
      pageNumber: p.pageNumber,
      chapter: p.chapter,
      text: p.text,
      score: 1.0,
      snippet: p.text.length > 250 ? p.text.slice(0, 250) + '...' : p.text,
      citation: `[Page ${p.pageNumber}]`
    }));
  }

  return scored.slice(0, topK);
}

/**
 * Formats retrieved passages into an academic grounding block with source citations.
 */
function buildGroundingContext(passages = []) {
  if (!Array.isArray(passages) || passages.length === 0) {
    return 'NO RELEVANT EXCERPTS FOUND IN UPLOADED DOCUMENT.';
  }

  return passages.map((p, idx) => {
    return `--- EXCERPT ${idx + 1} ${p.citation} ---\n${p.text}`;
  }).join('\n\n');
}

/**
 * Validates and extracts page citations from generated text.
 */
function extractCitationsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [...text.matchAll(/\[(?:Page|Source)\s*(\d+)(?:,\s*([^\]]+))?\]/gi)];
  return matches.map(m => ({
    pageNumber: parseInt(m[1], 10),
    chapter: m[2] ? m[2].trim() : null,
    raw: m[0]
  }));
}

module.exports = {
  tokenize,
  buildDocumentPassages,
  searchDocumentPassages,
  buildGroundingContext,
  extractCitationsFromText
};
