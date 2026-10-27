/**
 * multilingual.test.js — Automated Tests for Multilingual OCR and Output Pipeline
 * 
 * Verifies:
 * 1. Script & Language Detection (Latin, Devanagari Hindi/Marathi, Gujarati, Arabic, Cyrillic)
 * 2. Mixed script detection and RTL classification
 * 3. Canonical output language resolution (codes, full names, 'original', 'english' fallback)
 * 4. Tesseract language code mappings and graceful offline fallback
 * 5. Unicode-safe PDF rendering with TrueType fonts (Devanagari, Cyrillic, Latin)
 * 6. Multilingual Office exports (DOCX / PPTX) with RTL support
 */

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_automated_testing_32chars_long';
process.env.ALLOW_DEMO_MODE = 'true';
process.env.OCR_CONCURRENCY = '2';
jest.setTimeout(30000);

const {
  detectTextLanguage,
  resolveOutputLanguage,
  SUPPORTED_LANGUAGES,
  SCRIPT_RANGES
} = require('../services/ocr/languageDetectionService');

const { ensureTrainedData, terminatePool } = require('../services/ocr/ocrService');
const { notesPDF, handwrittenPDF } = require('../services/pdfGenerator');
const { generateDocx, generatePPTX } = require('../services/officeGenerator');

afterAll(async () => {
  await terminatePool();
});

describe('1. Script & Language Detection Service', () => {
  it('detects English Latin script and language', () => {
    const text = 'Photosynthesis is the biological process used by plants to convert light energy into chemical energy.';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('eng');
    expect(res.scripts['Latin']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(false);
  });

  it('detects Hindi in Devanagari script', () => {
    const text = 'प्रकाश संश्लेषण वह प्रक्रिया है जिसके द्वारा हरे पौधे सूर्य के प्रकाश की उपस्थिति में भोजन बनाते हैं।';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('hin');
    expect(res.scripts['Devanagari']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(false);
  });

  it('detects Marathi in Devanagari script using vocabulary and retroflex L (ळ)', () => {
    const text = 'प्रकाशसंश्लेषण ही वनस्पतींमध्ये घडणारी एक अत्यंत महत्त्वाची प्रक्रिया आहे. यामध्ये सूर्यप्रकाशाची ऊर्जा साठवली जाते आणि फळे येतात.';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('mar');
    expect(res.scripts['Devanagari']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(false);
  });

  it('detects Gujarati script and language', () => {
    const text = 'પ્રકાશસંશ્લેષણ એ એક રાસાયણિક પ્રક્રિયા છે જે વનસ્પતિઓમાં થાય છે.';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('guj');
    expect(res.scripts['Gujarati']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(false);
  });

  it('detects Arabic script and flags isRTL as true', () => {
    const text = 'الخلية هي الوحدة التركيبية والوظيفية الأساسية في جميع الكائنات الحية المعروفة.';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('ara');
    expect(res.scripts['Arabic']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(true);
  });

  it('detects Cyrillic Russian text', () => {
    const text = 'Фотосинтез — это сложный химический процесс преобразования энергии видимого света.';
    const res = detectTextLanguage(text);
    expect(res.primaryLanguage).toBe('rus');
    expect(res.scripts['Cyrillic']).toBeGreaterThan(0);
    expect(res.isRTL).toBe(false);
  });

  it('handles mixed-language text gracefully and includes both in detectedLanguages', () => {
    const text = 'Cellular respiration and chloroplasts are fundamental concepts. प्रकाश संश्लेषण वह प्रक्रिया है जिसके द्वारा पौधे भोजन बनाते हैं।';
    const res = detectTextLanguage(text);
    expect(res.detectedLanguages.length).toBeGreaterThan(1);
    expect(res.detectedLanguages).toContain('hin');
    expect(res.detectedLanguages).toContain('eng');
  });
});

describe('2. Output Language Resolution (resolveOutputLanguage)', () => {
  it('resolves "original" to the document primary language', () => {
    expect(resolveOutputLanguage('original', 'hin').name).toBe('Hindi');
    expect(resolveOutputLanguage('original', 'mar').name).toBe('Marathi');
    expect(resolveOutputLanguage('original', 'fra').name).toBe('French');
  });

  it('defaults to "english" if "original" has no document primary language', () => {
    expect(resolveOutputLanguage('original', null).code).toBe('en');
    expect(resolveOutputLanguage('original', '').code).toBe('en');
  });

  it('resolves standard ISO 639 codes to canonical language details', () => {
    expect(resolveOutputLanguage('hi').code).toBe('hi');
    expect(resolveOutputLanguage('mr').code).toBe('mr');
    expect(resolveOutputLanguage('gu').code).toBe('gu');
    expect(resolveOutputLanguage('ar').code).toBe('ar');
    expect(resolveOutputLanguage('ur').code).toBe('ur');
    expect(resolveOutputLanguage('es').code).toBe('es');
    expect(resolveOutputLanguage('de').code).toBe('de');
    expect(resolveOutputLanguage('ru').code).toBe('ru');
    expect(resolveOutputLanguage('zh').code).toBe('zh');
  });

  it('resolves localized and English names case-insensitively', () => {
    expect(resolveOutputLanguage('Hindi').code).toBe('hi');
    expect(resolveOutputLanguage('MARATHI').code).toBe('mr');
    expect(resolveOutputLanguage('French').code).toBe('fr');
    expect(resolveOutputLanguage('German').code).toBe('de');
    expect(resolveOutputLanguage('Spanish').code).toBe('es');
  });

  it('defaults invalid or empty inputs to english', () => {
    expect(resolveOutputLanguage('').code).toBe('en');
    expect(resolveOutputLanguage(null).code).toBe('en');
    expect(resolveOutputLanguage(undefined).code).toBe('en');
    expect(resolveOutputLanguage('nonexistent_lang_1234').code).toBe('en');
  });
});

describe('3. Tesseract Traineddata & Offline Fallback', () => {
  it('finds local eng.traineddata file', async () => {
    const langCode = await ensureTrainedData('eng');
    expect(langCode).toBe('eng');
    const { LANG_DATA_PATH } = require('../services/ocr/ocrService');
    const dataPath = path.join(LANG_DATA_PATH, `${langCode}.traineddata`);
    expect(fs.existsSync(dataPath)).toBe(true);
  });

  it('safely falls back to eng.traineddata for invalid or un-downloadable codes', async () => {
    const langCode = await ensureTrainedData('invalid_fake_code_xyz');
    expect(langCode).toBe('eng');
    const { LANG_DATA_PATH } = require('../services/ocr/ocrService');
    const dataPath = path.join(LANG_DATA_PATH, `${langCode}.traineddata`);
    expect(fs.existsSync(dataPath)).toBe(true);
  });
});

describe('4. Multilingual PDF Generation (Unicode TrueType Fonts)', () => {
  const sampleHindiMarkdown = `
# प्रकाश संश्लेषण (Photosynthesis)
पौधे प्रकाश ऊर्जा का उपयोग करके रासायनिक ऊर्जा बनाते हैं।

## १. मुख्य संकल्पना (Core Concepts)
- प्रकाश प्रतिक्रिया (Light reactions) थाइलाकोइड में होती हैं।
- केल्विन चक्र (Calvin cycle) स्ट्रोमा में होता है।
- रासायनिक सूत्र: 6CO2 + 6H2O -> C6H12O6 + 6O2
`;

  it('generates structured notes PDF with Devanagari text using Kalam font without WinAnsi errors', async () => {
    const result = await notesPDF(sampleHindiMarkdown, { title: 'प्रकाश संश्लेषण', subject: 'जीव विज्ञान' });
    expect(result).toHaveProperty('filePath');
    expect(fs.existsSync(result.filePath)).toBe(true);
    const buf = fs.readFileSync(result.filePath);
    expect(buf.length).toBeGreaterThan(1000);
    // Standard PDF magic header
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  const sampleCyrillicMarkdown = `
# Фотосинтез и клеточное дыхание
Краткий конспект по биологии для подготовки к экзаменам.

## Основные этапы
- Световая фаза протекает на мембранах тиلاкоидов.
- Темновая фаза протекает в строме хлоропласта.
`;

  it('generates structured notes PDF with Cyrillic text using LiberationSans font', async () => {
    const result = await notesPDF(sampleCyrillicMarkdown, { title: 'Фотосинтез', subject: 'Биология' });
    expect(result).toHaveProperty('filePath');
    expect(fs.existsSync(result.filePath)).toBe(true);
    const buf = fs.readFileSync(result.filePath);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  it('generates handwritten notes PDF with multilingual content', async () => {
    const result = await handwrittenPDF(sampleHindiMarkdown, { title: 'प्रकाश संश्लेषण', style: 'yellow' });
    expect(result).toHaveProperty('filePath');
    expect(fs.existsSync(result.filePath)).toBe(true);
    const buf = fs.readFileSync(result.filePath);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});

describe('5. Multilingual Office Exports (DOCX & PPTX) with RTL Support', () => {
  const sampleArabicMarkdown = `
# علم الأحياء الخلوي
ملخص شامل عن الخلية ووظائفها الحيوية.

## مكونات الخلية
- الغشاء البلازمي ينظم حركة المواد داخل وخارج الخلية.
- الميتوكوندريا هي مصنع الطاقة (ATP) في الخلية.
`;

  it('exports Arabic notes to DOCX with isRTL flag enabled', async () => {
    const result = await generateDocx(sampleArabicMarkdown, {
      title: 'علم الأحياء الخلوي',
      subject: 'الأحياء',
      language: 'Arabic',
      isRTL: true
    });
    expect(result).toHaveProperty('filePath');
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.fileSize).toBeGreaterThan(500);
  });

  const sampleArabicSlides = [
    {
      title: 'مقدمة في علم الأحياء الخلوي',
      takeaway: 'الخلية هي الوحدة الأساسية للحياة في جميع الكائنات.',
      bullets: [
        'الغشاء البلازمي يحمي الخلية وينظم النقل الخلوي.',
        'السيتوبلازم يحتوي على العضيات والإنزيمات الحيوية.'
      ]
    }
  ];

  it('exports Arabic notes to PPTX with RTL mode enabled', async () => {
    const result = await generatePPTX(sampleArabicSlides, {
      title: 'علم الأحياء الخلوي',
      subject: 'الأحياء',
      theme: 'clean_light',
      language: 'Arabic',
      isRTL: true
    });
    expect(result).toHaveProperty('filePath');
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.fileSize).toBeGreaterThan(500);
  });
});
