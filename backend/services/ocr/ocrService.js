/**
 * ocrService.js — Bounded Local OCR Worker Pool & Engine Interface
 * 
 * 100% Offline OCR service using Tesseract.js with pre-bundled language models.
 * Features:
 * - Bounded worker pool (fixed maximum concurrency, reuses workers across pages)
 * - Automatic retry with image preprocessing on low confidence
 * - Zero external API dependency (No OpenAI, No Claude, No Gemini)
 * - Extensible architecture supporting additional local OCR backends (e.g. PaddleOCR)
 */

const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const { preprocessImage } = require('./imagePreprocessingService');

const LANG_DATA_PATH = path.resolve(__dirname, '../../data/ocr-lang-data');
const DEFAULT_CONCURRENCY = parseInt(process.env.OCR_CONCURRENCY || '2', 10);
const DEFAULT_LANG = process.env.OCR_DEFAULT_LANG || 'eng';

/**
 * Singleton Bounded OCR Worker Pool
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

    try {
      while (this.workers.length < this.concurrency) {
        const worker = await createWorker(this.lang, 1, {
          langPath: LANG_DATA_PATH,
          cachePath: LANG_DATA_PATH,
          gzip: false,
          logger: () => {} // quiet mode in production
        });
        this.workers.push({ worker, busy: false, id: this.workers.length + 1 });
      }
      console.log(`[OCR Pool ✅] Initialized ${this.workers.length} offline Tesseract worker(s) using ${this.lang}`);
    } catch (err) {
      console.error('[OCR Pool ❌] Failed to initialize worker:', err.message);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Dispatches a recognition task to the next available worker in the pool.
   */
  async acquireWorker() {
    if (this.isTerminated) throw new Error('OCR Worker Pool has been terminated');
    if (this.workers.length < this.concurrency && !this.isInitializing) {
      await this.init();
    }

    const freeWorker = this.workers.find(w => !w.busy);
    if (freeWorker) {
      freeWorker.busy = true;
      return freeWorker;
    }

    // Wait in queue for next available worker
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
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
      nextTask.resolve(workerSlot);
    }
  }

  /**
   * Recognize text from an image buffer or file path with bounded concurrency.
   * 
   * @param {Buffer|string} image - Image buffer or path to image
   * @param {Object} options - { retryOnLowConfidence: boolean, psm: number }
   * @returns {Promise<{ text: string, confidence: number, words: number, status: string }>}
   */
  async recognize(image, options = {}) {
    const retryOnLowConfidence = options.retryOnLowConfidence !== false;
    let workerSlot = null;

    try {
      workerSlot = await this.acquireWorker();
      const startTime = Date.now();
      const result = await workerSlot.worker.recognize(image);
      const data = result.data || {};
      const rawText = (data.text || '').trim();
      const confidence = typeof data.confidence === 'number' ? Math.round(data.confidence) : 0;
      const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
      const elapsed = Date.now() - startTime;

      // Diagnostic check: if low confidence or empty text, retry with aggressive image preprocessing
      if (retryOnLowConfidence && (confidence < 60 || wordCount < 5) && Buffer.isBuffer(image)) {
        console.warn(`[OCR Pool ⚠️] Low confidence (${confidence}%) or sparse text (${wordCount} words). Retrying with enhanced preprocessing...`);
        try {
          const preprocessed = await preprocessImage(image, { level: 'aggressive' });
          if (preprocessed && preprocessed.buffer) {
            const retryRes = await workerSlot.worker.recognize(preprocessed.buffer);
            const retryData = retryRes.data || {};
            const retryText = (retryData.text || '').trim();
            const retryConf = typeof retryData.confidence === 'number' ? Math.round(retryData.confidence) : 0;
            const retryWords = retryText ? retryText.split(/\s+/).filter(Boolean).length : 0;

            if (retryWords >= wordCount || retryConf > confidence) {
              console.log(`[OCR Pool ✅] Retry improved result: confidence ${confidence}% -> ${retryConf}%, words: ${wordCount} -> ${retryWords}`);
              return {
                text: retryText,
                confidence: retryConf,
                words: retryWords,
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
  terminatePool
};
