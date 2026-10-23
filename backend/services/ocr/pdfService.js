/**
 * pdfService.js — Robust PDF Inspection, Native Text Extraction & Scanned Page Detection
 * 
 * 100% Pure JavaScript (pdfjs-dist legacy + pngjs).
 * - Validates PDF magic header (%PDF-)
 * - Extracts native text page-by-page preserving reading order (Y-desc, X-asc)
 * - Detects pages with missing/unusable text (< 50 chars)
 * - Renders/extracts page images only for scanned pages for targeted OCR fallback
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { downscaleRGBA } = require('./imagePreprocessingService');

/**
 * Validates that the file exists and starts with standard PDF magic bytes '%PDF-'.
 */
function validatePdfHeader(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found: ${filePath}`);
  }
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(8);
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  const header = buffer.toString('utf-8');
  if (!header.startsWith('%PDF-')) {
    throw new Error('Invalid PDF format: Missing %PDF- file header signature.');
  }
  return true;
}

/**
 * Loads the pdfjs-dist legacy library.
 */
async function getPdfJs() {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err) {
    throw new Error(`Failed to load pdfjs-dist: ${err.message}`);
  }
}

/**
 * Inspects a PDF and extracts text page-by-page.
 * For pages with missing or sparse text (< 50 chars), extracts page image for OCR.
 * 
 * @param {string} filePath - Absolute path to PDF file
 * @param {Object} options - { maxPages: number, nativeThresholdChars: number }
 * @returns {Promise<{ totalPages: number, pageResults: Array<Object>, hasScannedPages: boolean }>}
 */
async function inspectAndExtractPdf(filePath, options = {}) {
  validatePdfHeader(filePath);

  const maxPages = options.maxPages || 60;
  const nativeThreshold = options.nativeThresholdChars || 50;

  const pdfjsLib = await getPdfJs();
  const fileBuffer = fs.readFileSync(filePath);

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages || 1;
  const pagesToProcess = Math.min(totalPages, maxPages);
  const OPS = pdfjsLib.OPS;

  const pageResults = [];
  let hasScannedPages = false;

  for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // 1. Extract Native Text
    const textContent = await page.getTextContent();
    const items = textContent.items || [];

    // Sort items by reading order (Y descending from top of page, X ascending left to right)
    const sorted = items.slice().sort((a, b) => {
      const yA = a.transform ? a.transform[5] : 0;
      const yB = b.transform ? b.transform[5] : 0;
      if (Math.abs(yB - yA) > 4) return yB - yA; // Different vertical line
      const xA = a.transform ? a.transform[4] : 0;
      const xB = b.transform ? b.transform[4] : 0;
      return xA - xB;
    });

    let reconstructedText = '';
    let lastY = null;

    for (const item of sorted) {
      const str = (item.str || '').trim();
      if (!str) continue;

      const currentY = item.transform ? Math.round(item.transform[5]) : 0;
      if (lastY !== null && Math.abs(currentY - lastY) > 8) {
        reconstructedText += '\n';
      } else if (reconstructedText.length > 0 && !reconstructedText.endsWith('\n') && !reconstructedText.endsWith(' ')) {
        reconstructedText += ' ';
      }
      reconstructedText += item.str;
      lastY = currentY;
    }

    const cleanNativeText = reconstructedText.replace(/\s+/g, ' ').trim();
    const wordCount = cleanNativeText ? cleanNativeText.split(/\s+/).filter(Boolean).length : 0;

    // 2. Check if native text is sufficient
    if (cleanNativeText.length >= nativeThreshold && wordCount >= 8) {
      pageResults.push({
        pageNumber: pageNum,
        text: reconstructedText.trim(),
        method: 'native',
        status: 'success',
        confidence: 100,
        wordCount,
        needsOcr: false,
        imageBuffer: null
      });
      continue;
    }

    // 3. Native text is missing or sparse (< 50 chars) -> Scanned page detected!
    hasScannedPages = true;

    // Extract largest embedded raster image representing the scanned page
    let pageImageBuffer = null;
    let imgWidth = 0;
    let imgHeight = 0;

    try {
      const ops = await page.getOperatorList();
      const imgNames = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          const name = ops.argsArray[i]?.[0];
          if (name && typeof name === 'string') {
            imgNames.push(name);
          }
        }
      }

      let largestImg = null;
      let maxArea = 0;

      for (const name of imgNames) {
        await new Promise(resolve => {
          try {
            page.objs.get(name, img => {
              if (img && img.data && (img.width * img.height) > maxArea) {
                maxArea = img.width * img.height;
                largestImg = img;
              }
              resolve();
            });
            setTimeout(resolve, 1500);
          } catch {
            resolve();
          }
        });
      }

      if (largestImg && maxArea >= 5000) {
        const w = largestImg.width;
        const h = largestImg.height;
        const src = largestImg.data;
        const fullRgba = Buffer.alloc(w * h * 4);

        if (largestImg.kind === 2) {
          // RGB (24-bit)
          for (let p = 0; p < w * h; p++) {
            fullRgba[p * 4]     = src[p * 3];
            fullRgba[p * 4 + 1] = src[p * 3 + 1];
            fullRgba[p * 4 + 2] = src[p * 3 + 2];
            fullRgba[p * 4 + 3] = 255;
          }
        } else if (largestImg.kind === 3) {
          // RGBA (32-bit)
          fullRgba.set(src);
        } else {
          // Grayscale (8-bit)
          for (let p = 0; p < w * h; p++) {
            const val = src[p] !== undefined ? src[p] : 0;
            fullRgba[p * 4]     = val;
            fullRgba[p * 4 + 1] = val;
            fullRgba[p * 4 + 2] = val;
            fullRgba[p * 4 + 3] = 255;
          }
        }

        const scaled = downscaleRGBA(fullRgba, w, h, 1600);
        const png = new PNG({ width: scaled.width, height: scaled.height });
        png.data.set(scaled.data);

        pageImageBuffer = PNG.sync.write(png);
        imgWidth = scaled.width;
        imgHeight = scaled.height;
      }
    } catch (scanErr) {
      console.warn(`[PDF Service] Could not extract scanned image for page ${pageNum}:`, scanErr.message);
    }

    pageResults.push({
      pageNumber: pageNum,
      text: cleanNativeText, // partial or empty
      method: 'ocr',
      status: pageImageBuffer ? 'queued' : (cleanNativeText ? 'partial' : 'failed'),
      confidence: cleanNativeText ? 80 : 0,
      wordCount,
      needsOcr: true,
      imageBuffer: pageImageBuffer,
      imageWidth: imgWidth,
      imageHeight: imgHeight
    });
  }

  return {
    totalPages,
    pagesProcessed: pageResults.length,
    pageResults,
    hasScannedPages
  };
}

module.exports = {
  validatePdfHeader,
  inspectAndExtractPdf
};
