/**
 * textExtractionService.js — Master Unified Text Extraction & Multilingual OCR Coordinator
 * 
 * Orchestrates:
 * 1. SHA-256 Content Hashing & Language-keyed Persistent Disk Caching
 * 2. Native PDF Text Extraction (reading-order sorted)
 * 3. Automatic Unicode Script & Language Detection (17 core languages)
 * 4. Scanned PDF Page Detection & Bounded Local Multilingual OCR Fallback
 * 5. Standalone Image OCR (JPG, JPEG, PNG, WEBP)
 * 6. Structured Section Chunking & Memory Cleanup
 * 
 * 100% Local & Offline capable — Zero external paid APIs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { inspectAndExtractPdf } = require('./pdfService');
const { recognizeImage } = require('./ocrService');
const { chunkPageResults } = require('./chunkingService');
const { detectTextLanguage, resolveOutputLanguage } = require('./languageDetectionService');

const CACHE_DIR = path.resolve(__dirname, '../../data/ocr-cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Computes SHA-256 hash of a file's binary content using 64KB chunks to avoid large memory allocations.
 */
function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for hashing: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size > 2 * 1024 * 1024) {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    return hash.digest('hex');
  }
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getCacheKey(contentHash, langSet = 'auto') {
  if (!langSet || langSet === 'auto') return contentHash;
  const safeLang = langSet.replace(/[^a-zA-Z0-9_+]/g, '_');
  return `${contentHash}_${safeLang}`;
}

/**
 * Check disk cache for existing extraction.
 */
function getCachedResult(contentHash, langSet = 'auto') {
  ensureCacheDir();
  const specificKey = getCacheKey(contentHash, langSet);
  const cacheFile = path.join(CACHE_DIR, `${specificKey}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && (parsed.status === 'ready' || parsed.words > 0)) {
        console.log(`[OCR Cache ⚡] Cache HIT for content hash: ${specificKey.substring(0, 16)}... (${parsed.words} words)`);
        return parsed;
      }
      console.log(`[OCR Cache 🔄] Invalidating stale or empty cache entry: ${specificKey.substring(0, 16)}...`);
      try { fs.unlinkSync(cacheFile); } catch {}
    } catch (e) {
      console.warn('[OCR Cache] Error reading cache file:', e.message);
    }
  }

  // Fallback to unadorned contentHash.json if specific key missed
  if (specificKey !== contentHash) {
    const fallbackFile = path.join(CACHE_DIR, `${contentHash}.json`);
    if (fs.existsSync(fallbackFile)) {
      try {
        const data = fs.readFileSync(fallbackFile, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed && (parsed.status === 'ready' || parsed.words > 0)) {
          return parsed;
        }
      } catch (e) {}
    }
  }

  return null;
}

/**
 * Persist extraction result to disk cache.
 */
function saveCachedResult(contentHash, result, langSet = 'auto') {
  if (!result || !result.words || result.words === 0) return;
  ensureCacheDir();
  const specificKey = getCacheKey(contentHash, langSet);
  const cacheFile = path.join(CACHE_DIR, `${specificKey}.json`);
  try {
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

    // Also persist base key if not existing
    const baseFile = path.join(CACHE_DIR, `${contentHash}.json`);
    if (!fs.existsSync(baseFile)) {
      fs.writeFileSync(baseFile, JSON.stringify(sanitized, null, 2), 'utf-8');
    }
  } catch (e) {
    console.warn('[OCR Cache] Error writing cache file:', e.message);
  }
}

/**
 * Primary Multilingual Extraction Function for Documents (PDFs & Images)
 * 
 * @param {string} filePath - Absolute path to uploaded document
 * @param {string} mimeType - MIME type of uploaded document
 * @param {Object} options - { useCache: boolean, maxPages: number, language: string }
 * @returns {Promise<Object>}
 */
async function extractDocumentText(filePath, mimeType = 'application/pdf', options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document file not found: ${filePath}`);
  }

  const useCache = options.useCache !== false;
  const contentHash = computeFileHash(filePath);

  // Check user manual language override
  const manualLang = options.language || options.lang || options.manualLanguage || null;
  let targetLangSet = 'auto';
  if (manualLang) {
    const resolved = resolveOutputLanguage(manualLang);
    targetLangSet = resolved.code !== 'en' ? `${resolved.code}+eng` : 'eng';
  }

  // 1. Check disk cache
  if (useCache) {
    const cached = getCachedResult(contentHash, targetLangSet);
    if (cached) return cached;
  }

  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(filePath);
  let pageResults = [];
  let totalPages = 1;

  if (isImage) {
    console.log(`[Text Extraction] Processing standalone image file: ${path.basename(filePath)}`);
    let ocrLang = (targetLangSet !== 'auto') ? targetLangSet : 'eng';

    // First OCR recognition pass
    let ocrResult = await recognizeImage(filePath, { lang: ocrLang, retryOnLowConfidence: true });
    let text = (ocrResult.text || '').trim();

    // If auto mode and text has non-Latin script or very low confidence, check script detection
    if (targetLangSet === 'auto') {
      const detected = detectTextLanguage(text);
      if (detected.primaryLanguage !== 'eng' && detected.tesseractLangSet !== ocrLang) {
        console.log(`[Text Extraction 🌐] Detected script for image: ${detected.primaryLanguage} (${detected.tesseractLangSet}). Re-running OCR with optimized model...`);
        const refinedResult = await recognizeImage(filePath, {
          lang: detected.tesseractLangSet,
          script: Object.keys(detected.scripts)[0],
          retryOnLowConfidence: true
        });
        if ((refinedResult.words || 0) >= (ocrResult.words || 0) || (refinedResult.confidence || 0) > (ocrResult.confidence || 0)) {
          ocrResult = refinedResult;
          text = (ocrResult.text || '').trim();
          targetLangSet = detected.tesseractLangSet;
        }
      }
    }

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

    // Check if there is native digital text to determine language
    const sampleNativeText = pageResults
      .filter(p => p.method === 'native' && p.text)
      .map(p => p.text)
      .slice(0, 5)
      .join('\n');

    let pdfLangSet = (targetLangSet !== 'auto') ? targetLangSet : 'eng';
    let detectedScript = null;

    if (sampleNativeText.trim().length > 30) {
      const nativeDetected = detectTextLanguage(sampleNativeText);
      pdfLangSet = (targetLangSet !== 'auto') ? targetLangSet : nativeDetected.tesseractLangSet;
      detectedScript = Object.keys(nativeDetected.scripts)[0];
      console.log(`[Text Extraction 🌐] PDF native text language detected: ${nativeDetected.primaryLanguage} (${pdfLangSet})`);
    }

    // Process any pages flagged for OCR
    const scannedPages = pageResults.filter(p => p.needsOcr && p.imageBuffer);
    if (scannedPages.length > 0) {
      console.log(`[Text Extraction] Performing local multilingual OCR on ${scannedPages.length} scanned page(s) using [${pdfLangSet}]...`);

      for (let i = 0; i < scannedPages.length; i++) {
        const pageItem = scannedPages[i];
        try {
          // On first scanned page without prior native text, test language detection
          if (i === 0 && targetLangSet === 'auto' && (!sampleNativeText || sampleNativeText.length < 30)) {
            let initialOcr = await recognizeImage(pageItem.imageBuffer, { lang: 'eng', retryOnLowConfidence: true });
            const pageText = (initialOcr.text || '').trim();
            const pageDetect = detectTextLanguage(pageText);
            if (pageDetect.primaryLanguage !== 'eng') {
              console.log(`[Text Extraction 🌐] First scanned page detected as ${pageDetect.primaryLanguage} (${pageDetect.tesseractLangSet})`);
              pdfLangSet = pageDetect.tesseractLangSet;
              detectedScript = Object.keys(pageDetect.scripts)[0];
              initialOcr = await recognizeImage(pageItem.imageBuffer, {
                lang: pdfLangSet,
                script: detectedScript,
                retryOnLowConfidence: true
              });
            }
            pageItem.text = (initialOcr.text || '').trim();
            pageItem.confidence = initialOcr.confidence;
            pageItem.wordCount = initialOcr.words || pageItem.text.split(/\s+/).filter(Boolean).length;
            pageItem.status = initialOcr.status;
          } else {
            const ocrRes = await recognizeImage(pageItem.imageBuffer, {
              lang: pdfLangSet,
              script: detectedScript,
              retryOnLowConfidence: true
            });
            const ocrText = (ocrRes.text || '').trim();
            const words = ocrRes.words || ocrText.split(/\s+/).filter(Boolean).length;

            pageItem.text = ocrText;
            pageItem.confidence = ocrRes.confidence;
            pageItem.wordCount = words;
            pageItem.status = ocrRes.status;
          }
          console.log(`[Text Extraction ✅] Page ${pageItem.pageNumber} OCR completed: ${pageItem.wordCount} words, ${pageItem.confidence}% confidence`);
        } catch (pageErr) {
          console.warn(`[Text Extraction ⚠️] Page ${pageItem.pageNumber} OCR error:`, pageErr.message);
          pageItem.status = 'failed';
          pageItem.confidence = 0;
        } finally {
          pageItem.imageBuffer = null;
        }
      }
    }
  }

  // 2. Validate that readable text exists
  const validPages = pageResults.filter(p => (p.text || '').trim().length > 0);
  if (validPages.length === 0) {
    throw new Error('No readable text could be extracted from this document or scanned images.');
  }

  // 3. Chunk into structured sections
  const chunked = chunkPageResults(pageResults);

  // 4. Authoritative multilingual analysis on the unified extracted text
  const langAnalysis = detectTextLanguage(chunked.text);
  const detectedLanguages = langAnalysis.detectedLanguages || ['eng'];
  const primaryLanguage = langAnalysis.primaryLanguage || 'eng';
  const isRTL = !!langAnalysis.isRTL;

  // 5. Determine overall extraction method & confidence
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
    detectedLanguages,
    primaryLanguage,
    isRTL,
    scripts: langAnalysis.scripts,
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

  // 6. Save to disk cache
  if (useCache) {
    saveCachedResult(contentHash, finalResult, targetLangSet);
  }

  console.log(`[Text Extraction 🎉] Finished: ${finalResult.words} words, lang=${primaryLanguage} (${detectedLanguages.join('+')}), method=${overallMethod}, confidence=${avgConfidence}%`);
  return finalResult;
}

module.exports = {
  computeFileHash,
  getCachedResult,
  saveCachedResult,
  extractDocumentText
};
