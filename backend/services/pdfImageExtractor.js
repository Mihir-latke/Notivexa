/**
 * pdfImageExtractor.js — Notivexa PDF Image & Diagram Extractor
 *
 * Extracts authentic embedded images, charts, and diagrams from uploaded PDFs.
 * 100% pure JS (pdfjs-dist legacy + pngjs), zero native dependencies, fully
 * compatible with Render.com and any Linux/Windows environment.
 */

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const IMAGES_DIR = path.join(__dirname, '../uploads/images/extracted');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Extract embedded images & diagrams from a PDF.
 * @param {string} pdfPath - Absolute or relative path to the PDF file.
 * @param {string} docId   - Document identifier for folder organization.
 * @returns {Promise<Array<{page: number, filePath: string, fileName: string, width: number, height: number}>>}
 */
async function extractImagesFromPDF(pdfPath, docId) {
  if (!fs.existsSync(pdfPath)) {
    console.warn('[ImgExtract] File not found:', pdfPath);
    return [];
  }

  const outDir = path.join(IMAGES_DIR, String(docId));
  ensureDir(outDir);

  let pdfjsLib;
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    pdfjsLib = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e) {
    console.warn('[ImgExtract] Cannot load pdfjs-dist:', e.message);
    return [];
  }

  let pdfDoc;
  try {
    const buf = fs.readFileSync(pdfPath);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
      useSystemFonts: true
    });
    pdfDoc = await loadingTask.promise;
  } catch (e) {
    console.warn('[ImgExtract] Cannot parse PDF:', e.message);
    return [];
  }

  const results = [];
  const numPages = pdfDoc.numPages;
  const OPS = pdfjsLib.OPS;

  // Process pages (up to 60 pages to cover full textbook/slides without lag)
  const maxPages = Math.min(numPages, 60);

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const ops  = await page.getOperatorList();

      const imgNames = new Set();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          const name = ops.argsArray[i]?.[0];
          if (name && typeof name === 'string') {
            imgNames.add(name);
          }
        }
      }

      for (const name of imgNames) {
        if (results.length >= 8) break; // 8 diagrams is optimal for study notes
        await new Promise(resolve => {
          try {
            page.objs.get(name, img => {
              if (!img || !img.data) return resolve();
              const w = img.width || 0;
              const h = img.height || 0;

              // Filter out tiny icons, buttons, single-color borders or bullets
              // Real diagrams range from square to wide flowcharts
              const aspect = Math.max(w / h, h / w);
              if (w < 80 || h < 45 || (w * h) < 6000 || aspect > 8.0) {
                return resolve();
              }

              // Check if image is all identical bytes (e.g. solid color background block)
              if (isSolidColor(img.data, w, h)) {
                return resolve();
              }

              const fileName = `page_${pageNum}_diag_${results.length + 1}.png`;
              const filePath = path.join(outDir, fileName);

              try {
                const png = new PNG({ width: w, height: h });
                const src = img.data;

                if (img.kind === 2) {
                  // RGB (24-bit)
                  for (let p = 0; p < w * h; p++) {
                    png.data[p * 4]     = src[p * 3];
                    png.data[p * 4 + 1] = src[p * 3 + 1];
                    png.data[p * 4 + 2] = src[p * 3 + 2];
                    png.data[p * 4 + 3] = 255;
                  }
                } else if (img.kind === 3) {
                  // RGBA (32-bit)
                  png.data.set(src);
                } else {
                  // Grayscale (8-bit)
                  for (let p = 0; p < w * h; p++) {
                    const val = src[p] !== undefined ? src[p] : 0;
                    png.data[p * 4]     = val;
                    png.data[p * 4 + 1] = val;
                    png.data[p * 4 + 2] = val;
                    png.data[p * 4 + 3] = 255;
                  }
                }

                const pngBuf = PNG.sync.write(png);
                fs.writeFileSync(filePath, pngBuf);
                results.push({
                  page: pageNum,
                  filePath,
                  fileName,
                  width: w,
                  height: h,
                  base64: pngBuf.toString('base64')
                });
                console.log(`[ImgExtract ✅] Page ${pageNum} diagram extracted: ${w}x${h} -> ${fileName}`);
              } catch (saveErr) {
                console.warn('[ImgExtract] PNG encode error:', saveErr.message);
              }

              resolve();
            });
            // Safety timeout
            setTimeout(resolve, 2000);
          } catch (objErr) {
            resolve();
          }
        });
      }
      if (results.length >= 8) break;
    } catch (pageErr) {
      console.warn(`[ImgExtract] Page ${pageNum} warning:`, pageErr.message);
    }
  }

  console.log(`[ImgExtract] Total authentic diagrams/images extracted: ${results.length}`);
  return results;
}

/**
 * Checks whether an image buffer is essentially a solid single color (e.g. background block)
 */
function isSolidColor(data, w, h) {
  if (!data || data.length < 16) return true;
  const sampleStep = Math.max(1, Math.floor(data.length / 50));
  const firstR = data[0];
  const firstG = data[1];
  const firstB = data[2];

  let diffCount = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    if (Math.abs(data[i] - firstR) > 8 ||
        Math.abs(data[i + 1] - firstG) > 8 ||
        Math.abs(data[i + 2] - firstB) > 8) {
      diffCount++;
      if (diffCount > 3) return false; // Contains variation, likely a real image/diagram
    }
  }
  return true;
}

/**
 * Retrieve already-extracted images for a document.
 */
function getExtractedImages(docId) {
  const dir = path.join(IMAGES_DIR, String(docId));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort((a, b) => {
      const pA = parseInt((a.match(/page_(\d+)/) || [])[1] || '0');
      const pB = parseInt((b.match(/page_(\d+)/) || [])[1] || '0');
      return pA - pB;
    })
    .map(f => ({
      fileName: f,
      filePath: path.join(dir, f),
      page: parseInt((f.match(/page_(\d+)/) || [])[1] || '0')
    }));
}

/**
 * Cleanup images when document is removed or re-uploaded.
 */
function cleanupImages(docId) {
  const dir = path.join(IMAGES_DIR, String(docId));
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Extracts full-page images or largest scanned image from each page of a scanned PDF.
 * @param {string} pdfPath
 * @param {number} maxPages
 * @returns {Promise<{results: Array<{page: number, buffer: Buffer, width: number, height: number}>, totalPages: number}>}
 */
async function extractPageImagesFromPDF(pdfPath, maxPages = 30) {
  if (!fs.existsSync(pdfPath)) return { results: [], totalPages: 0 };

  let pdfjsLib;
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    pdfjsLib = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e) {
    console.warn('[PageImgExtract] Cannot load pdfjs-dist:', e.message);
    return { results: [], totalPages: 0 };
  }

  let pdfDoc;
  try {
    const buf = fs.readFileSync(pdfPath);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
      useSystemFonts: true
    });
    pdfDoc = await loadingTask.promise;
  } catch (e) {
    console.warn('[PageImgExtract] Cannot parse PDF:', e.message);
    return { results: [], totalPages: 0 };
  }

  const results = [];
  const numPages = pdfDoc.numPages;
  const OPS = pdfjsLib.OPS;
  const limit = Math.min(numPages, maxPages);

  for (let pageNum = 1; pageNum <= limit; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
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

      if (imgNames.length === 0) continue;

      // Find largest image on this page (in a scanned PDF, the scan of the page is the largest image)
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

function downscaleRGBA(srcData, srcW, srcH, maxDim = 1600) {
  if (srcW <= maxDim && srcH <= maxDim) {
    return { data: srcData, width: srcW, height: srcH };
  }
  const scale = maxDim / Math.max(srcW, srcH);
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);
  const dstData = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x / scale));
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;
      dstData[dstIdx]     = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }
  return { data: dstData, width: dstW, height: dstH };
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

        // Downscale oversized scans (e.g. 2525x4256) for optimal OCR speed & payload safety
        const scaled = downscaleRGBA(fullRgba, w, h, 1600);
        const png = new PNG({ width: scaled.width, height: scaled.height });
        png.data.set(scaled.data);

        const pngBuf = PNG.sync.write(png);
        results.push({
          page: pageNum,
          buffer: pngBuf,
          width: scaled.width,
          height: scaled.height
        });
        console.log(`[PageImgExtract ✅] Page ${pageNum} scanned page image extracted (${scaled.width}x${scaled.height})`);
      }
    } catch (err) {
      console.warn(`[PageImgExtract] Error on page ${pageNum}:`, err.message);
    }
  }

  return { results, totalPages: numPages };
}

module.exports = {
  extractImagesFromPDF,
  extractPageImagesFromPDF,
  getExtractedImages,
  cleanupImages
};
