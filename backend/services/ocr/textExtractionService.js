/**
 * textExtractionService.js — Master Unified Text Extraction & OCR Coordinator
 * 
 * Orchestrates:
 * 1. SHA-256 Content Hashing & Persistent Disk Caching
 * 2. Native PDF Text Extraction (reading-order sorted)
 * 3. Scanned PDF Page Detection & Bounded Local OCR Fallback
 * 4. Standalone Image OCR (JPG, JPEG, PNG, WEBP)
 * 5. Structured Section Chunking & Memory Cleanup
 * 
 * 100% Offline — No external API calls.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { inspectAndExtractPdf } = require('./pdfService');
const { recognizeImage } = require('./ocrService');
const { chunkPageResults } = require('./chunkingService');

const CACHE_DIR = path.resolve(__dirname, '../../data/ocr-cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Computes SHA-256 hash of a file's binary content.
 */
function computeFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check disk cache for existing extraction.
 */
function getCachedResult(contentHash) {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${contentHash}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[OCR Cache ⚡] Cache HIT for content hash: ${contentHash.substring(0, 12)}...`);
      return parsed;
    } catch (e) {
      console.warn('[OCR Cache] Error reading cache file:', e.message);
    }
  }
  return null;
}

/**
 * Persist extraction result to disk cache.
 */
function saveCachedResult(contentHash, result) {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${contentHash}.json`);
  try {
    // Strip raw buffers before serializing
    const sanitized = {
      ...result,
      pageResults: (result.pageResults || []).map(p => ({
        pageNumber: p.pageNumber,
        text: p.text,
        method: p.method,
        status: p.status,
        confidence: p.confidence,
        wordCount: p.wordCount
      }))
    };
    fs.writeFileSync(cacheFile, JSON.stringify(sanitized, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[OCR Cache] Error writing cache file:', e.message);
  }
}

/**
 * Primary Extraction Function for Documents (PDFs & Images)
 * 
 * @param {string} filePath - Absolute path to uploaded document
 * @param {string} mimeType - MIME type of uploaded document
 * @param {Object} options - { useCache: boolean, maxPages: number }
 * @returns {Promise<Object>}
 */
async function extractDocumentText(filePath, mimeType = 'application/pdf', options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document file not found: ${filePath}`);
  }

  const useCache = options.useCache !== false;
  const contentHash = computeFileHash(filePath);

  // 1. Check cache
  if (useCache) {
    const cached = getCachedResult(contentHash);
    if (cached) return cached;
  }

  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(filePath);
  let pageResults = [];
  let totalPages = 1;

  if (isImage) {
    console.log(`[Text Extraction] Processing standalone image file: ${path.basename(filePath)}`);
    const ocrResult = await recognizeImage(filePath, { retryOnLowConfidence: true });
    const text = (ocrResult.text || '').trim();
    const words = ocrResult.words || text.split(/\s+/).filter(Boolean).length;

    pageResults.push({
      pageNumber: 1,
      text,
      method: 'ocr',
      status: ocrResult.status || (words > 0 ? 'success' : 'failed'),
      confidence: ocrResult.confidence || 0,
      wordCount: words
    });
  } else {
    // PDF Extraction
    console.log(`[Text Extraction] Inspecting PDF structure: ${path.basename(filePath)}`);
    const pdfData = await inspectAndExtractPdf(filePath, options);
    totalPages = pdfData.totalPages;
    pageResults = pdfData.pageResults;

    // Process any pages flagged for OCR
    const scannedPages = pageResults.filter(p => p.needsOcr && p.imageBuffer);
    if (scannedPages.length > 0) {
      console.log(`[Text Extraction] Performing local OCR on ${scannedPages.length} scanned page(s)...`);

      for (const pageItem of scannedPages) {
        try {
          const ocrRes = await recognizeImage(pageItem.imageBuffer, { retryOnLowConfidence: true });
          const ocrText = (ocrRes.text || '').trim();
          const words = ocrRes.words || ocrText.split(/\s+/).filter(Boolean).length;

          pageItem.text = ocrText;
          pageItem.confidence = ocrRes.confidence;
          pageItem.wordCount = words;
          pageItem.status = ocrRes.status;
          console.log(`[Text Extraction ✅] Page ${pageItem.pageNumber} OCR completed: ${words} words, ${ocrRes.confidence}% confidence`);
        } catch (pageErr) {
          console.warn(`[Text Extraction ⚠️] Page ${pageItem.pageNumber} OCR error:`, pageErr.message);
          pageItem.status = 'failed';
          pageItem.confidence = 0;
        } finally {
          // Free raw buffer immediately
          pageItem.imageBuffer = null;
        }
      }
    }
  }

  // 2. Validate that at least some text was extracted
  const validPages = pageResults.filter(p => (p.text || '').trim().length > 0);
  if (validPages.length === 0) {
    throw new Error('No readable text could be extracted from this document or scanned images.');
  }

  // 3. Chunk into structured sections
  const chunked = chunkPageResults(pageResults);

  // 4. Determine overall extraction method & confidence
  const methods = new Set(pageResults.map(p => p.method));
  let overallMethod = 'native';
  if (methods.has('native') && methods.has('ocr')) overallMethod = 'hybrid';
  else if (methods.has('ocr')) overallMethod = 'ocr';

  const confidences = pageResults.map(p => p.confidence || 0);
  const avgConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 100;

  const finalResult = {
    text: chunked.text,
    sections: chunked.sections,
    pages: totalPages,
    words: chunked.words,
    contentHash,
    extractionMethod: overallMethod,
    ocrConfidence: avgConfidence,
    pageResults: pageResults.map(p => ({
      pageNumber: p.pageNumber,
      text: p.text,
      method: p.method,
      status: p.status,
      confidence: p.confidence,
      wordCount: p.wordCount
    })),
    status: chunked.words > 0 ? 'ready' : 'error',
    isPartial: validPages.length < pageResults.length
  };

  // 5. Save to disk cache
  if (useCache) {
    saveCachedResult(contentHash, finalResult);
  }

  console.log(`[Text Extraction 🎉] Finished: ${finalResult.words} words, ${finalResult.sections.length} sections, method=${overallMethod}, confidence=${avgConfidence}%`);
  return finalResult;
}

module.exports = {
  computeFileHash,
  getCachedResult,
  saveCachedResult,
  extractDocumentText
};

