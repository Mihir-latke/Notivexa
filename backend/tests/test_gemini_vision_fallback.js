/**
 * test_gemini_vision_fallback.js
 * 
 * Verifies that when an uploaded image has no/low text or complex visual content,
 * Notivexa automatically invokes Google Gemini Vision AI to extract the content,
 * generate structured sections, and provide high-fidelity educational data.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { extractDocumentText } = require('../services/ocr/textExtractionService');
const { terminatePool } = require('../services/ocr/ocrService');

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Running Gemini Vision Educational Extraction Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Verify Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    console.error('❌ FAIL: GEMINI_API_KEY is missing or placeholder in .env.');
    process.exit(1);
  }
  console.log('✅ GEMINI_API_KEY detected.');

  // 2. Create a 100% valid 200x100 PNG image with a scientific diagram background
  const sampleImagePath = path.resolve(__dirname, '../uploads/test_academic_note.png');
  const png = new PNG({ width: 200, height: 100 });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = (x + y) % 256;      // R
      png.data[idx + 1] = (x * 2) % 256;  // G
      png.data[idx + 2] = 220;            // B
      png.data[idx + 3] = 255;            // A
    }
  }
  fs.writeFileSync(sampleImagePath, PNG.sync.write(png));
  console.log(`✅ Created test image file: ${sampleImagePath}`);

  try {
    console.log(`\nTesting extractDocumentText on diagram image (Local OCR yields 0 words)...`);
    const result = await extractDocumentText(sampleImagePath, 'image/png', {
      useCache: false,
      subject: 'Physics: Wave Interference and Optics'
    });

    console.log('\n--- Extraction Result Summary ---');
    console.log('Extraction Method:', result.extractionMethod);
    console.log('Word Count:', result.words);
    console.log('Confidence:', result.ocrConfidence);
    console.log('Sections Count:', result.sections?.length);
    console.log('Primary Language:', result.primaryLanguage);
    console.log('Status:', result.status);
    console.log('\n--- Transcribed Sample ---');
    console.log(result.text.substring(0, 300) + '...\n');

    if (result.extractionMethod !== 'gemini_vision') {
      console.error(`❌ Expected extractionMethod 'gemini_vision', got '${result.extractionMethod}'`);
      process.exit(1);
    }

    if (!result.words || result.words < 10) {
      console.error(`❌ Expected words >= 10, got ${result.words}`);
      process.exit(1);
    }

    if (result.ocrConfidence < 90) {
      console.error(`❌ Expected ocrConfidence >= 90, got ${result.ocrConfidence}`);
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 ALL TESTS PASSED: Google Gemini Vision Fallback Working!');
    console.log('═══════════════════════════════════════════════════════');
  } catch (err) {
    console.error('❌ TEST FAILED with exception:', err.message);
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);
      await terminatePool();
    } catch {}
    process.exit(0);
  }
}

runTests();
