/**
 * test_enhance_vision_endpoint.js
 * 
 * Verifies that the POST /api/documents/:id/enhance-vision endpoint works properly
 * and upgrades a document to 'gemini_vision' with high-fidelity content.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const localStore = require('../utils/localStore');
const documentController = require('../controllers/documentController');
const { terminatePool } = require('../services/ocr/ocrService');

async function testEnhanceEndpoint() {
  console.log('Testing enhanceWithVision controller...');
  
  // 1. Create a dummy image file
  const testImgPath = path.resolve(__dirname, '../uploads/test_formula_sheet.png');
  const png = new PNG({ width: 150, height: 80 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 240;
    png.data[i + 1] = 240;
    png.data[i + 2] = 240;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(testImgPath, PNG.sync.write(png));

  // 2. Create a localStore doc with 0 words
  const initialDoc = localStore.createDoc({
    user: 'test-user-123',
    title: 'Formula Sheet Photo',
    originalName: 'test_formula_sheet.png',
    fileType: 'image',
    mimeType: 'image/png',
    filePath: testImgPath,
    extractedText: '',
    wordCount: 0,
    extractionMethod: 'ocr',
    status: 'partial'
  });

  console.log('Initial doc created:', initialDoc._id, 'Words:', initialDoc.wordCount);

  // 3. Mock req, res
  const req = {
    params: { id: initialDoc._id },
    user: { id: 'test-user-123' }
  };

  let responseData = null;
  const res = {
    json: (d) => {
      responseData = d;
      return res;
    },
    status: (code) => {
      console.log('Status code:', code);
      return res;
    }
  };

  const next = (err) => {
    console.error('Next called with error:', err);
  };

  await documentController.enhanceWithVision(req, res, next);

  console.log('\nResponse received:', responseData?.success ? 'SUCCESS' : 'FAILED');
  console.log('Updated Word Count:', responseData?.document?.wordCount);
  console.log('Updated Method:', responseData?.document?.extractionMethod);
  console.log('Updated Quality Score:', responseData?.document?.extractionQuality?.score);
  console.log('Message:', responseData?.message);

  if (responseData?.success && responseData?.document?.extractionMethod === 'gemini_vision' && responseData?.document?.wordCount > 10) {
    console.log('✅ POST /api/documents/:id/enhance-vision endpoint test PASSED!');
  } else {
    console.error('❌ Endpoint test FAILED!');
    process.exit(1);
  }

  // Cleanup
  try {
    if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);
    localStore.deleteDoc(initialDoc._id, 'test-user-123');
    await terminatePool();
  } catch {}
  process.exit(0);
}

testEnhanceEndpoint();

