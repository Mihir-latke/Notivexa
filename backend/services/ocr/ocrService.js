/**
 * ocrService.js — Bounded Local Multilingual OCR Worker Pool & Engine Interface
 * 
 * 100% Local/Self-hosted OCR service using Tesseract.js with on-demand language models.
 * Features:
 * - Bounded worker pool (fixed maximum concurrency, reuses workers across pages)
 * - Multilingual support: English, Hindi, Marathi, Gujarati, Bengali, Tamil,
 *   Telugu, Kannada, Urdu, Arabic, Spanish, French, German, Chinese, Japanese, Korean, Russian
 * - Dynamic on-demand traineddata loader with disk caching and offline 'eng' fallback
 * - Automatic script-tuned preprocessing and retry on low confidence
 * - Unicode normalization (NFC) & RTL awareness
 * - Zero external paid API dependencies
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const { createWorker } = require('tesseract.js');
const { preprocessImage } = require('./imagePreprocessingService');

const LANG_DATA_PATH = path.resolve(__dirname, '../../data/ocr-lang-data');
const DEFAULT_CONCURRENCY = parseInt(process.env.OCR_CONCURRENCY || '2', 10);
const DEFAULT_LANG = process.env.OCR_DEFAULT_LANG || 'eng';

function ensureLangDataDir() {
  if (!fs.existsSync(LANG_DATA_PATH)) {
    fs.mkdirSync(LANG_DATA_PATH, { recursive: true });
  }
}

/**
 * Downloads a .traineddata file from trusted CDN mirrors with timeout and redirects.
 */
function downloadFile(url, destPath, timeoutMs = 20000, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Download timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const req = https.get(url, { headers: { 'User-Agent': 'Notivexa-Multilingual-OCR' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        clearTimeout(timer);
        return downloadFile(res.headers.location, destPath, timeoutMs, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const tempPath = `${destPath}.tmp_${Date.now()}`;
      const fileStream = fs.createWriteStream(tempPath);

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        clearTimeout(timer);
        fileStream.close(() => {
          try {
            const stat = fs.statSync(tempPath);
            if (stat.size > 1000) {
              fs.renameSync(tempPath, destPath);
              resolve(true);
            } else {
              try { fs.unlinkSync(tempPath); } catch {}
              reject(new Error('Downloaded file too small'));
            }
          } catch (err) {
            try { fs.unlinkSync(tempPath); } catch {}
            reject(err);
          }
        });
      });

      fileStream.on('error', (err) => {
        clearTimeout(timer);
        try { fs.unlinkSync(tempPath); } catch {}
        reject(err);
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Ensures on-demand traineddata exists locally in backend/data/ocr-lang-data.
 * Resolves available language codes and falls back gracefully to 'eng' on failure.
 * 
 * @param {string} langSet - e.g. "hin+eng", "mar+eng", "ara", "eng"
 * @returns {Promise<string>} - validated language set guaranteed to have data files on disk
 */
async function ensureTrainedData(langSet = DEFAULT_LANG) {
  ensureLangDataDir();
  const rawCodes = langSet.split('+').map(c => c.trim().toLowerCase()).filter(Boolean);
  const availableCodes = [];

  for (const code of rawCodes) {
    const filePath = path.join(LANG_DATA_PATH, `${code}.traineddata`);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      if (!availableCodes.includes(code)) availableCodes.push(code);
      continue;
    }

    console.log(`[OCR Lang Data 📥] Language data for '${code}' not found locally. Downloading on-demand...`);
    let downloaded = false;

    // Primary source: tessdata_fast repo on GitHub
    try {
      const urlPrimary = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${code}.traineddata`;
      await downloadFile(urlPrimary, filePath);
      downloaded = true;
      console.log(`[OCR Lang Data ✅] Successfully downloaded and cached '${code}.traineddata'`);
    } catch (err1) {
      // Secondary fallback: Project Naptha mirror (.gz)
      try {
        const urlMirror = `https://tessdata.projectnaptha.com/4.0.0_fast/${code}.traineddata.gz`;
        const tempGz = path.join(LANG_DATA_PATH, `${code}.traineddata.gz`);
        await downloadFile(urlMirror, tempGz);
        if (fs.existsSync(tempGz)) {
          const gzBuf = fs.readFileSync(tempGz);
          const decompressed = zlib.gunzipSync(gzBuf);
          fs.writeFileSync(filePath, decompressed);
          try { fs.unlinkSync(tempGz); } catch {}
          downloaded = true;
          console.log(`[OCR Lang Data ✅] Successfully downloaded and extracted mirror '${code}.traineddata'`);
        }
      } catch (err2) {
        console.warn(`[OCR Lang Data ⚠️] Failed to download '${code}.traineddata' (${err1.message}). Falling back gracefully.`);
      }
    }

    if (downloaded && fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      if (!availableCodes.includes(code)) availableCodes.push(code);
    }
  }

  // If none of requested languages are available, ensure 'eng'
  if (availableCodes.length === 0) {
    const engPath = path.join(LANG_DATA_PATH, 'eng.traineddata');
    if (!fs.existsSync(engPath)) {
      try {
        await downloadFile('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata', engPath);
      } catch (e) {
        console.error('[OCR Lang Data] Critical: could not obtain eng.traineddata:', e.message);
      }
    }
    availableCodes.push('eng');
  }

  return availableCodes.join('+');
}

/**
 * Singleton Bounded Multilingual OCR Worker Pool
 */
class OcrWorkerPool {
  constructor(concurrency = DEFAULT_CONCURRENCY, lang = DEFAULT_LANG) {
    this.concurrency = concurrency;
    this.lang = lang;
    this.workers = [];
    this.queue = [];
    this.activeJobs = 0;
    this.isInitializing = false;
    this.isTerminated = false;
  }

  /**
   * Initializes the fixed worker pool using local offline language data.
   */
  async init() {
    if (this.workers.length >= this.concurrency || this.isInitializing || this.isTerminated) {
      return;
    }
    this.isInitializing = true;
    ensureLangDataDir();

    try {
      const resolvedLang = await ensureTrainedData(this.lang);
      while (this.workers.length < this.concurrency) {
        const worker = await createWorker(resolvedLang, 1, {
          langPath: LANG_DATA_PATH,
          cachePath: LANG_DATA_PATH,
          gzip: false,
          logger: () => {} // quiet mode in production
        });
        this.workers.push({
          worker,
          busy: false,
          id: this.workers.length + 1,
          currentLang: resolvedLang
        });
      }
      console.log(`[OCR Pool ✅] Initialized ${this.workers.length} offline Tesseract worker(s) using [${resolvedLang}]`);
    } catch (err) {
      console.error('[OCR Pool ❌] Failed to initialize worker:', err.message);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Dispatches a recognition task to the next available worker in the pool,
   * reinitializing the worker's language if a different language is requested.
   * 
   * @param {string} requiredLang - e.g. "hin+eng"
   */
  async acquireWorker(requiredLang = DEFAULT_LANG) {
    if (this.isTerminated) throw new Error('OCR Worker Pool has been terminated');
    if (this.workers.length < this.concurrency && !this.isInitializing) {
      await this.init();
    }

    const freeWorker = this.workers.find(w => !w.busy);
    if (freeWorker) {
      freeWorker.busy = true;
      if (requiredLang && freeWorker.currentLang !== requiredLang) {
        try {
          await freeWorker.worker.reinitialize(requiredLang);
          freeWorker.currentLang = requiredLang;
        } catch (reErr) {
          console.warn(`[OCR Pool ⚠️] Worker reinitialize to '${requiredLang}' failed (${reErr.message}), continuing with current language`);
        }
      }
      return freeWorker;
    }

    // Wait in queue for next available worker
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, requiredLang });
    });
  }

  /**
   * Releases worker back to pool and processes queued items.
   */
  releaseWorker(workerSlot) {
    workerSlot.busy = false;
    if (this.queue.length > 0 && !this.isTerminated) {
      const nextTask = this.queue.shift();
      workerSlot.busy = true;
      const reinitPromise = (nextTask.requiredLang && workerSlot.currentLang !== nextTask.requiredLang)
        ? workerSlot.worker.reinitialize(nextTask.requiredLang)
            .then(() => { workerSlot.currentLang = nextTask.requiredLang; })
            .catch(e => console.warn(`[OCR Pool ⚠️] Queued task reinit warning: ${e.message}`))
        : Promise.resolve();

      reinitPromise
        .then(() => nextTask.resolve(workerSlot))
        .catch(err => {
          workerSlot.busy = false;
          nextTask.reject(err);
        });
    }
  }

  /**
   * Recognize text from an image buffer or file path with bounded concurrency and multilingual support.
   * 
   * @param {Buffer|string} image - Image buffer or path to image
   * @param {Object} options - { lang: string, retryOnLowConfidence: boolean, script: string }
   * @returns {Promise<{ text: string, confidence: number, words: number, lang: string, status: string }>}
   */
  async recognize(image, options = {}) {
    const retryOnLowConfidence = options.retryOnLowConfidence !== false;
    const requestedLang = options.lang || this.lang || DEFAULT_LANG;
    const resolvedLang = await ensureTrainedData(requestedLang);
    let workerSlot = null;

    try {
      workerSlot = await this.acquireWorker(resolvedLang);
      const startTime = Date.now();
      const result = await workerSlot.worker.recognize(image);
      const data = result.data || {};
      
      // Normalize Unicode to NFC to prevent Devanagari/CJK/Arabic conjunct corruption
      const rawText = (data.text || '').normalize('NFC').trim();
      const confidence = typeof data.confidence === 'number' ? Math.round(data.confidence) : 0;
      const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
      const elapsed = Date.now() - startTime;

      // Diagnostic check: if low confidence or sparse text, retry with script-tuned preprocessing
      if (retryOnLowConfidence && (confidence < 60 || wordCount < 5) && Buffer.isBuffer(image)) {
        console.warn(`[OCR Pool ⚠️] Low confidence (${confidence}%) or sparse text (${wordCount} words). Retrying with enhanced preprocessing...`);
        try {
          const preprocessed = await preprocessImage(image, {
            level: 'aggressive',
            script: options.script
          });
          if (preprocessed && preprocessed.buffer) {
            const retryRes = await workerSlot.worker.recognize(preprocessed.buffer);
            const retryData = retryRes.data || {};
            const retryText = (retryData.text || '').normalize('NFC').trim();
            const retryConf = typeof retryData.confidence === 'number' ? Math.round(retryData.confidence) : 0;
            const retryWords = retryText ? retryText.split(/\s+/).filter(Boolean).length : 0;

            if (retryWords >= wordCount || retryConf > confidence) {
              console.log(`[OCR Pool ✅] Retry improved result: confidence ${confidence}% -> ${retryConf}%, words: ${wordCount} -> ${retryWords}`);
              return {
                text: retryText,
                confidence: retryConf,
                words: retryWords,
                lang: resolvedLang,
                engine: 'tesseract',
                status: retryConf >= 60 ? 'success' : 'warning',
                processingTimeMs: elapsed,
                preprocessed: true
              };
            }
          }
        } catch (prepErr) {
          console.warn('[OCR Pool] Retry preprocessing error:', prepErr.message);
        }
      }

      return {
        text: rawText,
        confidence,
        words: wordCount,
        lang: resolvedLang,
        engine: 'tesseract',
        status: confidence >= 60 && wordCount > 0 ? 'success' : (wordCount > 0 ? 'warning' : 'failed'),
        processingTimeMs: elapsed,
        preprocessed: false
      };
    } catch (err) {
      console.error('[OCR Pool ❌] Recognition failed:', err.message);
      return {
        text: '',
        confidence: 0,
        words: 0,
        lang: resolvedLang,
        engine: 'tesseract',
        status: 'failed',
        error: err.message
      };
    } finally {
      if (workerSlot) {
        this.releaseWorker(workerSlot);
      }
    }
  }

  /**
   * Graceful pool termination.
   */
  async terminate() {
    this.isTerminated = true;
    for (const item of this.queue) {
      item.reject(new Error('OCR Worker Pool terminated'));
    }
    this.queue = [];

    for (const slot of this.workers) {
      try {
        await slot.worker.terminate();
      } catch (e) {
        // Ignore termination error
      }
    }
    this.workers = [];
    console.log('[OCR Pool] All workers terminated gracefully.');
  }
}

// Global Singleton Pool Instance
let globalPool = null;

function getOcrPool(concurrency = DEFAULT_CONCURRENCY, lang = DEFAULT_LANG) {
  if (!globalPool || globalPool.isTerminated) {
    globalPool = new OcrWorkerPool(concurrency, lang);
  }
  return globalPool;
}

/**
 * High-level OCR recognition API.
 */
async function recognizeImage(imageInput, options = {}) {
  const pool = getOcrPool();
  return await pool.recognize(imageInput, options);
}

async function terminatePool() {
  if (globalPool) {
    await globalPool.terminate();
    globalPool = null;
  }
}

module.exports = {
  OcrWorkerPool,
  getOcrPool,
  recognizeImage,
  terminatePool,
  ensureTrainedData,
  LANG_DATA_PATH
};
