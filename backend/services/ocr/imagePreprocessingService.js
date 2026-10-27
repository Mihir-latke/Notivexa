/**
 * imagePreprocessingService.js — Pure JavaScript OCR Image Preprocessing Pipeline
 * 
 * Provides deterministic image enhancements for scanned documents, mobile photos,
 * and low-contrast textbook pages without requiring native C++ compilation (libvips/opencv).
 * Uses pure JS pngjs for pixel-level RGBA manipulation.
 */

const { PNG } = require('pngjs');

/**
 * Bilinear downscaling for oversized scan images (e.g. 2500x4200 down to max 1600px).
 */
function downscaleRGBA(srcData, srcW, srcH, maxDim = 1600) {
  if (srcW <= maxDim && srcH <= maxDim) {
    return { data: Buffer.from(srcData), width: srcW, height: srcH };
  }
  const scale = maxDim / Math.max(srcW, srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
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

/**
 * Standard ITU-R BT.601 Grayscale Conversion (0.299R + 0.587G + 0.114B).
 * Returns an 8-bit Uint8Array of luminance values.
 */
function toGrayscale(rgbaData, width, height) {
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * rgbaData[idx] +
      0.587 * rgbaData[idx + 1] +
      0.114 * rgbaData[idx + 2]
    );
  }
  return gray;
}

/**
 * Contrast Stretching (Min-Max Normalization with 1% tail clipping).
 * Cleans faded scans or shadows from paper curvature.
 */
function stretchContrast(grayData) {
  const len = grayData.length;
  const hist = new Int32Array(256);
  for (let i = 0; i < len; i++) {
    hist[grayData[i]]++;
  }

  const p1 = Math.floor(len * 0.01);
  const p99 = Math.floor(len * 0.99);

  let acc = 0;
  let minVal = 0;
  let maxVal = 255;

  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= p1 && minVal === 0) minVal = i;
    if (acc >= p99) {
      maxVal = i;
      break;
    }
  }

  if (maxVal <= minVal) return grayData;

  const result = new Uint8Array(len);
  const scale = 255 / (maxVal - minVal);
  for (let i = 0; i < len; i++) {
    const val = grayData[i];
    if (val <= minVal) result[i] = 0;
    else if (val >= maxVal) result[i] = 255;
    else result[i] = Math.round((val - minVal) * scale);
  }
  return result;
}

/**
 * Otsu's Global Adaptive Binarization.
 * Computes optimal threshold maximizing between-class variance.
 * Averages flat-valley thresholds to place the cut at the true midpoint.
 */
function computeOtsuThreshold(grayData) {
  const hist = new Int32Array(256);
  const total = grayData.length;
  for (let i = 0; i < total; i++) {
    hist[grayData[i]]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let thresholdSum = 0;
  let thresholdCount = 0;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      thresholdSum = t;
      thresholdCount = 1;
    } else if (varBetween === varMax && varMax > 0) {
      thresholdSum += t;
      thresholdCount++;
    }
  }
  return thresholdCount > 0 ? Math.round(thresholdSum / thresholdCount) : 128;
}

/**
 * Apply Binarization with given or Otsu threshold.
 */
function binarize(grayData, threshold = null) {
  const t = threshold !== null ? threshold : computeOtsuThreshold(grayData);
  const len = grayData.length;
  const bin = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bin[i] = grayData[i] >= t ? 255 : 0;
  }
  return bin;
}

/**
 * Fast 3x3 Median Denoise Filter for salt-and-pepper noise.
 */
function denoise3x3(grayData, width, height) {
  const out = new Uint8Array(width * height);
  const window = new Uint8Array(9);

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const nyOffset = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          window[k++] = grayData[nyOffset + (x + dx)];
        }
      }
      // Insertion sort 9 elements
      for (let i = 1; i < 9; i++) {
        const temp = window[i];
        let j = i - 1;
        while (j >= 0 && window[j] > temp) {
          window[j + 1] = window[j];
          j--;
        }
        window[j + 1] = temp;
      }
      out[rowOffset + x] = window[4]; // median is element 4
    }
  }

  // Copy borders
  for (let x = 0; x < width; x++) {
    out[x] = grayData[x];
    out[(height - 1) * width + x] = grayData[(height - 1) * width + x];
  }
  for (let y = 0; y < height; y++) {
    out[y * width] = grayData[y * width];
    out[y * width + (width - 1)] = grayData[y * width + (width - 1)];
  }

  return out;
}

/**
 * Convert 8-bit single-channel data back to PNG Buffer.
 */
function grayToPngBuffer(grayData, width, height) {
  const png = new PNG({ width, height });
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const val = grayData[i];
    const idx = i * 4;
    png.data[idx]     = val;
    png.data[idx + 1] = val;
    png.data[idx + 2] = val;
    png.data[idx + 3] = 255;
  }
  return PNG.sync.write(png);
}

/**
 * High-level image preprocessor.
 * Supports levels: 'light' (contrast stretch), 'standard' (contrast + Otsu), 'aggressive' (denoise + Otsu).
 * 
 * @param {Buffer} inputBuffer - PNG or raw RGBA buffer
 * @param {Object} options - { level: 'standard'|'light'|'aggressive', maxDim: 1600 }
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, level: string }>}
 */
async function preprocessImage(inputBuffer, options = {}) {
  const level = options.level || 'standard';
  const maxDim = options.maxDim || 1600;

  let png;
  try {
    png = PNG.sync.read(inputBuffer);
  } catch (err) {
    // If not valid PNG, return original buffer
    return { buffer: inputBuffer, width: 0, height: 0, level: 'raw', error: err.message };
  }

  // Step 1: Downscale if oversized
  const scaled = downscaleRGBA(png.data, png.width, png.height, maxDim);
  const w = scaled.width;
  const h = scaled.height;

  // Step 2: Grayscale
  let processed = toGrayscale(scaled.data, w, h);

  // Step 3: Contrast stretch
  processed = stretchContrast(processed);

  // Step 4: Denoise if aggressive (skip for complex Asian & Indic scripts to preserve fine conjuncts & matras)
  const isComplexScript = options.script && ['Devanagari', 'Han', 'Hangul', 'Japanese', 'Arabic', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Gujarati'].includes(options.script);
  if (level === 'aggressive' && !isComplexScript) {
    processed = denoise3x3(processed, w, h);
  }

  // Step 5: Binarization for standard or aggressive
  if (level === 'standard' || level === 'aggressive') {
    processed = binarize(processed);
  }

  const outBuffer = grayToPngBuffer(processed, w, h);
  return {
    buffer: outBuffer,
    width: w,
    height: h,
    level,
    downscaled: w !== png.width || h !== png.height
  };
}

module.exports = {
  downscaleRGBA,
  toGrayscale,
  stretchContrast,
  computeOtsuThreshold,
  binarize,
  denoise3x3,
  grayToPngBuffer,
  preprocessImage
};
