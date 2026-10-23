/**
 * chunkingService.js — Semantic Chunking, Heading Preservation & Text Normalization
 * 
 * Segments extracted text from native PDF and OCR streams into clean, structured sections
 * suitable for study material generation (summaries, flashcards, quizzes, mind maps).
 */

/**
 * Normalizes raw text from PDF/OCR:
 * - Unwraps hyphenated line breaks ("exam-\nple" -> "example")
 * - Cleans excessive newlines and tabs
 * - Normalizes Unicode quotation marks and dashes
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\w+)-\n(\w+)/g, '$1$2') // unwrap hyphenated words across lines
    .replace(/[\u2018\u2019]/g, "'")    // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')    // smart double quotes
    .replace(/[\u2013\u2014]/g, '-')    // en/em dashes
    .replace(/[ \t]{4,}/g, '   ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/**
 * Checks if a line is likely an academic heading or section title.
 */
function isHeading(line) {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;

  // Explicit markdown heading
  if (/^#{1,4}\s+/.test(trimmed)) return true;

  // Chapter, Unit, Section or Module pattern
  if (/^(Chapter|Unit|Section|Module|Part|Lecture)\s+\d+[:.]?/i.test(trimmed)) return true;

  // Numbered heading: "1. Introduction" or "2.3 Database Management"
  if (/^\d+(\.\d+)*\s+[A-Z]/.test(trimmed)) return true;

  // ALL CAPS heading with at least two words
  if (/^[A-Z0-9\s:,\-]{5,60}$/.test(trimmed) && trimmed.split(/\s+/).length >= 2) return true;

  return false;
}

/**
 * Clean title for a heading
 */
function cleanHeadingTitle(line) {
  return line
    .replace(/^#{1,4}\s+/, '')
    .replace(/^\d+(\.\d+)*\s+/, '')
    .trim();
}

/**
 * Chunks page results into structured sections while preserving page boundaries and headings.
 * 
 * @param {Array<Object>} pageResults - [{ pageNumber, text, method, confidence }]
 * @returns {{ text: string, sections: Array<Object>, words: number, pages: number }}
 */
function chunkPageResults(pageResults = []) {
  if (!Array.isArray(pageResults) || pageResults.length === 0) {
    return { text: '', sections: [], words: 0, pages: 0 };
  }

  const sections = [];
  const fullTextParts = [];
  let totalWords = 0;

  for (const page of pageResults) {
    const rawPageText = normalizeText(page.text || '');
    if (!rawPageText) continue;

    const pageNum = page.pageNumber || 1;
    fullTextParts.push(`## Page ${pageNum}\n\n${rawPageText}`);

    const lines = rawPageText.split('\n').map(l => l.trim()).filter(Boolean);
    let currentSectionTitle = `Page ${pageNum}`;
    let currentSectionLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isHeading(line)) {
        // Save current section if it has content
        if (currentSectionLines.length > 0) {
          const content = currentSectionLines.join('\n\n').trim();
          const words = content.split(/\s+/).filter(Boolean).length;
          if (words > 0) {
            sections.push({
              title: currentSectionTitle,
              content,
              pageNumber: pageNum,
              wordCount: words
            });
            totalWords += words;
          }
          currentSectionLines = [];
        }
        currentSectionTitle = cleanHeadingTitle(line) || `Section - Page ${pageNum}`;
      } else {
        currentSectionLines.push(line);
      }
    }

    // Flush remaining lines for this page
    if (currentSectionLines.length > 0) {
      const content = currentSectionLines.join('\n\n').trim();
      const words = content.split(/\s+/).filter(Boolean).length;
      if (words > 0) {
        sections.push({
          title: currentSectionTitle,
          content,
          pageNumber: pageNum,
          wordCount: words
        });
        totalWords += words;
      }
    }
  }

  // Fallback if no sections were created
  const consolidatedText = fullTextParts.join('\n\n');
  if (sections.length === 0 && consolidatedText) {
    const words = consolidatedText.split(/\s+/).filter(Boolean).length;
    sections.push({
      title: 'Full Document Content',
      content: consolidatedText,
      pageNumber: 1,
      wordCount: words
    });
    totalWords = words;
  }

  return {
    text: consolidatedText,
    sections,
    words: totalWords,
    pages: pageResults.length
  };
}

module.exports = {
  normalizeText,
  isHeading,
  cleanHeadingTitle,
  chunkPageResults
};
