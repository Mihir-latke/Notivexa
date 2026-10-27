/**
 * languageDetectionService.js — Unicode Script & Language Detection Engine
 * 
 * Provides:
 * 1. Fast, deterministic script classification based on Unicode Character Blocks
 * 2. Mixed-script detection (e.g. Hindi document with English technical terms)
 * 3. Mapping from detected scripts to Tesseract language codes and ISO-639 codes
 * 4. RTL (Right-to-Left) script identification
 * 
 * 100% Offline — Zero external dependencies.
 */

// Supported Languages and their primary metadata
const SUPPORTED_LANGUAGES = {
  eng: { code: 'en', name: 'English', script: 'Latin', rtl: false, tesseract: 'eng', ttsVoice: 'en-US-JennyNeural' },
  hin: { code: 'hi', name: 'Hindi', script: 'Devanagari', rtl: false, tesseract: 'hin', ttsVoice: 'hi-IN-SwaraNeural' },
  mar: { code: 'mr', name: 'Marathi', script: 'Devanagari', rtl: false, tesseract: 'mar', ttsVoice: 'mr-IN-AarohiNeural' },
  guj: { code: 'gu', name: 'Gujarati', script: 'Gujarati', rtl: false, tesseract: 'guj', ttsVoice: 'gu-IN-DhwaniNeural' },
  ben: { code: 'bn', name: 'Bengali', script: 'Bengali', rtl: false, tesseract: 'ben', ttsVoice: 'bn-IN-TanishaaNeural' },
  tam: { code: 'ta', name: 'Tamil', script: 'Tamil', rtl: false, tesseract: 'tam', ttsVoice: 'ta-IN-PallaviNeural' },
  tel: { code: 'te', name: 'Telugu', script: 'Telugu', rtl: false, tesseract: 'tel', ttsVoice: 'te-IN-ShrutiNeural' },
  kan: { code: 'kn', name: 'Kannada', script: 'Kannada', rtl: false, tesseract: 'kan', ttsVoice: 'kn-IN-SapnaNeural' },
  urd: { code: 'ur', name: 'Urdu', script: 'Arabic', rtl: true, tesseract: 'urd', ttsVoice: 'ur-IN-GulNeural' },
  ara: { code: 'ar', name: 'Arabic', script: 'Arabic', rtl: true, tesseract: 'ara', ttsVoice: 'ar-SA-ZariyahNeural' },
  spa: { code: 'es', name: 'Spanish', script: 'Latin', rtl: false, tesseract: 'spa', ttsVoice: 'es-ES-ElviraNeural' },
  fra: { code: 'fr', name: 'French', script: 'Latin', rtl: false, tesseract: 'fra', ttsVoice: 'fr-FR-DeniseNeural' },
  deu: { code: 'de', name: 'German', script: 'Latin', rtl: false, tesseract: 'deu', ttsVoice: 'de-DE-KatjaNeural' },
  chi_sim: { code: 'zh', name: 'Chinese (Simplified)', script: 'Han', rtl: false, tesseract: 'chi_sim', ttsVoice: 'zh-CN-XiaoxiaoNeural' },
  jpn: { code: 'ja', name: 'Japanese', script: 'Japanese', rtl: false, tesseract: 'jpn', ttsVoice: 'ja-JP-NanamiNeural' },
  kor: { code: 'ko', name: 'Korean', script: 'Hangul', rtl: false, tesseract: 'kor', ttsVoice: 'ko-KR-SunHiNeural' },
  rus: { code: 'ru', name: 'Russian', script: 'Cyrillic', rtl: false, tesseract: 'rus', ttsVoice: 'ru-RU-SvetlanaNeural' }
};

// Unicode Block Range Checkers
const SCRIPT_RANGES = [
  { script: 'Devanagari', regex: /[\u0900-\u097F\uA8E0-\uA8FF]/g, defaultLang: 'hin' },
  { script: 'Gujarati',   regex: /[\u0A80-\u0AFF]/g, defaultLang: 'guj' },
  { script: 'Bengali',    regex: /[\u0980-\u09FF]/g, defaultLang: 'ben' },
  { script: 'Tamil',      regex: /[\u0B80-\u0BFF]/g, defaultLang: 'tam' },
  { script: 'Telugu',     regex: /[\u0C00-\u0C7F]/g, defaultLang: 'tel' },
  { script: 'Kannada',    regex: /[\u0C80-\u0CFF]/g, defaultLang: 'kan' },
  { script: 'Arabic',     regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, defaultLang: 'ara' },
  { script: 'Cyrillic',   regex: /[\u0400-\u04FF\u0500-\u052F]/g, defaultLang: 'rus' },
  { script: 'Hangul',     regex: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, defaultLang: 'kor' },
  { script: 'Japanese',   regex: /[\u3040-\u309F\u30A0-\u30FF]/g, defaultLang: 'jpn' },
  { script: 'Han',        regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, defaultLang: 'chi_sim' },
  { script: 'Latin',      regex: /[A-Za-z\u00C0-\u024F]/g, defaultLang: 'eng' }
];

/**
 * Detects scripts and languages present in a string of text.
 * 
 * @param {string} text - Raw input text
 * @returns {{
 *   primaryLanguage: string,
 *   detectedLanguages: string[],
 *   tesseractLangSet: string,
 *   isRTL: boolean,
 *   scripts: Object
 * }}
 */
function detectTextLanguage(text) {
  if (!text || typeof text !== 'string') {
    return {
      primaryLanguage: 'eng',
      detectedLanguages: ['eng'],
      tesseractLangSet: 'eng',
      isRTL: false,
      scripts: { Latin: 1 }
    };
  }

  const scriptCounts = {};
  let totalChars = 0;

  for (const range of SCRIPT_RANGES) {
    const matches = text.match(range.regex);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      scriptCounts[range.script] = count;
      totalChars += count;
    }
  }

  if (totalChars === 0) {
    return {
      primaryLanguage: 'eng',
      detectedLanguages: ['eng'],
      tesseractLangSet: 'eng',
      isRTL: false,
      scripts: { Latin: 1 }
    };
  }

  // Sort scripts by frequency
  const sortedScripts = Object.entries(scriptCounts).sort((a, b) => b[1] - a[1]);
  const primaryScript = sortedScripts[0][0];

  // Specific heuristics for Devanagari (Hindi vs Marathi distinction)
  let primaryLang = SCRIPT_RANGES.find(r => r.script === primaryScript)?.defaultLang || 'eng';

  if (primaryScript === 'Devanagari') {
    // Marathi specific characters: ळ (\u0933) and common inflectional words (आहे, नाही, आणि, करून, होते)
    const hasMarathiLa = /\u0933/.test(text);
    const marathiWords = /\b(आहे|नाही|आणि|करून|होते|झाले|त्यांच्या|म्हणून|केले|येथे)\b/g;
    const marathiMatches = text.match(marathiWords) || [];

    if (hasMarathiLa || marathiMatches.length >= 2) {
      primaryLang = 'mar';
    } else {
      primaryLang = 'hin';
    }
  } else if (primaryScript === 'Arabic') {
    // Urdu specific letters: ے (\u06D2), ٹ (\u0679), ڈ (\u0688), ڑ (\u0691)
    if (/[\u06D2\u0679\u0688\u0691\u0686]/.test(text)) {
      primaryLang = 'urd';
    }
  } else if (primaryScript === 'Latin') {
    // Check for Spanish / French / German specific characters or words
    if (/[ñáéíóú¿¡]/i.test(text)) primaryLang = 'spa';
    else if (/[éèêëàâîïôûùçœæ]/i.test(text)) primaryLang = 'fra';
    else if (/[äöüß]/i.test(text)) primaryLang = 'deu';
  }

  const detectedLanguages = [primaryLang];

  // Detect any secondary scripts with significant representation (> 8% of total letters)
  for (const [script, count] of sortedScripts) {
    if (script !== primaryScript && (count / totalChars) > 0.08) {
      let secondaryLang = SCRIPT_RANGES.find(r => r.script === script)?.defaultLang;
      if (script === 'Devanagari') {
        const hasMarathiLa = /\u0933/.test(text);
        const marathiWords = /\b(आहे|नाही|आणि|करून|होते|झाले|त्यांच्या|म्हणून|केले|येथे)\b/g;
        const marathiMatches = text.match(marathiWords) || [];
        secondaryLang = (hasMarathiLa || marathiMatches.length >= 2) ? 'mar' : 'hin';
      }
      if (secondaryLang && !detectedLanguages.includes(secondaryLang)) {
        detectedLanguages.push(secondaryLang);
      }
    }
  }

  // Assemble Tesseract lang set (e.g. "hin+eng" or "mar+eng")
  const tesseractLangSet = detectedLanguages.join('+');
  const isRTL = primaryScript === 'Arabic';

  return {
    primaryLanguage: primaryLang,
    detectedLanguages,
    tesseractLangSet,
    isRTL,
    scripts: scriptCounts
  };
}

/**
 * Normalizes user language parameter into canonical language code and English name.
 * 
 * @param {string} langInput - "english", "original", "hi", "hindi", "marathi", etc.
 * @param {string} docPrimaryLang - Primary language of the document
 * @returns {{ code: string, name: string, isOriginal: boolean }}
 */
function resolveOutputLanguage(langInput, docPrimaryLang = 'eng') {
  if (!langInput || typeof langInput !== 'string') {
    return { code: 'en', name: 'English', isOriginal: false };
  }

  const lower = langInput.toLowerCase().trim();

  if (lower === 'original' || lower === 'source' || lower === 'auto') {
    const docInfo = SUPPORTED_LANGUAGES[docPrimaryLang] || SUPPORTED_LANGUAGES.eng;
    return { code: docInfo.code, name: docInfo.name, isOriginal: true };
  }

  // Check by Tesseract code
  if (SUPPORTED_LANGUAGES[lower]) {
    const match = SUPPORTED_LANGUAGES[lower];
    return { code: match.code, name: match.name, isOriginal: lower === docPrimaryLang };
  }

  // Check by ISO 2-letter code
  const byCode = Object.values(SUPPORTED_LANGUAGES).find(l => l.code === lower);
  if (byCode) {
    return { code: byCode.code, name: byCode.name, isOriginal: byCode.tesseract === docPrimaryLang };
  }

  // Check by English name
  const byName = Object.values(SUPPORTED_LANGUAGES).find(l => l.name.toLowerCase() === lower);
  if (byName) {
    return { code: byName.code, name: byName.name, isOriginal: byName.tesseract === docPrimaryLang };
  }

  // Default fallback
  return { code: 'en', name: 'English', isOriginal: false };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  SCRIPT_RANGES,
  detectTextLanguage,
  resolveOutputLanguage
};
