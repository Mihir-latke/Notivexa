/**
 * geminiVisionService.js — High-Fidelity Multimodal Educational Vision & OCR Service
 * 
 * Invoked when:
 * 1. An image is uploaded (photo of textbook, handwritten notes, academic diagram, formula sheet, lecture slide)
 *    and local OCR yields empty, unreadable, low-confidence, or insufficient text.
 * 2. A scanned PDF page fails local OCR or contains complex diagrams/handwriting.
 * 3. A user manually requests re-extraction/enhancement via AI Vision.
 * 
 * Powered by Google Gemini Vision (Flash 3.5 / 3.1 / Flash-Lite).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { detectTextLanguage } = require('./languageDetectionService');

const GEMINI_VISION_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash'
];

/**
 * Determine accurate image MIME type from extension or buffer magic bytes.
 */
function resolveImageMimeType(filePathOrBuffer, fallbackMime = 'image/jpeg') {
  if (typeof filePathOrBuffer === 'string') {
    const ext = path.extname(filePathOrBuffer).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.bmp') return 'image/bmp';
  } else if (Buffer.isBuffer(filePathOrBuffer) && filePathOrBuffer.length >= 8) {
    if (filePathOrBuffer[0] === 0x89 && filePathOrBuffer[1] === 0x50 && filePathOrBuffer[2] === 0x4E && filePathOrBuffer[3] === 0x47) {
      return 'image/png';
    }
    if (filePathOrBuffer[0] === 0xFF && filePathOrBuffer[1] === 0xD8 && filePathOrBuffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    if (filePathOrBuffer.subarray(0, 4).toString('ascii') === 'RIFF' && filePathOrBuffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
  }
  return fallbackMime || 'image/jpeg';
}

/**
 * Split Markdown / academic text into structured sections for Notivexa tools (Notes, Quizzes, Flashcards).
 */
function parseTextIntoSections(fullText, defaultTitle = 'Overview & Concept Analysis') {
  if (!fullText || !fullText.trim()) {
    return [{ title: defaultTitle, content: '', wordCount: 0 }];
  }

  const lines = fullText.split('\n');
  const sections = [];
  let currentTitle = defaultTitle;
  let currentLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (wordCount > 0) {
          sections.push({ title: currentTitle, content, wordCount });
        }
        currentLines = [];
      }
      currentTitle = headingMatch[1].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0) {
      sections.push({ title: currentTitle, content, wordCount });
    }
  }

  if (sections.length === 0) {
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    sections.push({ title: defaultTitle, content: fullText.trim(), wordCount });
  }

  return sections;
}

/**
 * Primary Gemini Vision extraction function.
 * 
 * @param {string|Buffer} imageInput - File path or buffer of image
 * @param {string} mimeType - Optional MIME type
 * @param {Object} options - { filename, language, subject, promptOverride }
 * @returns {Promise<Object>}
 */
async function extractWithGeminiVision(imageInput, mimeType = null, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    console.warn('[Gemini Vision] No GEMINI_API_KEY configured in environment.');
    return null;
  }

  let buffer;
  let detectedMime = mimeType;

  if (typeof imageInput === 'string') {
    if (!fs.existsSync(imageInput)) {
      throw new Error(`Image file not found: ${imageInput}`);
    }
    buffer = fs.readFileSync(imageInput);
    detectedMime = resolveImageMimeType(imageInput, mimeType);
  } else if (Buffer.isBuffer(imageInput)) {
    buffer = imageInput;
    detectedMime = resolveImageMimeType(imageInput, mimeType);
  } else {
    throw new Error('Invalid imageInput provided to extractWithGeminiVision; expected path string or Buffer.');
  }

  const base64Data = buffer.toString('base64');
  const filename = options.filename || 'uploaded-image';
  const targetLanguage = options.language || 'original';

  const systemInstruction = `You are Notivexa's expert Academic Vision and Educational OCR Engine.
Your task is to transcribe, digitize, and explain all educational and academic content from this uploaded image with 100% precision.

Instructions:
1. Complete Text Transcription:
   - Transcribe all visible text faithfully.
   - Preserve headers and structure using Markdown (# Title, ## Section, ### Sub-topic, bullet points, numbered lists).
   - Transcribe all mathematical formulas, scientific equations, code snippets, and chemical notations cleanly.
   - Format tables into clear Markdown tables with columns and rows.
2. Handwritten & Classroom Notes:
   - If handwritten text, board handwriting, or student notes are present, carefully decipher and transcribe them with utmost accuracy.
3. Visuals, Diagrams & Charts:
   - If the image contains diagrams, illustrations, charts, circuits, anatomy sketches, or flowcharts, provide a dedicated section:
     ### 📊 Visual & Diagram Analysis
     Explain what the diagram illustrates, its labeled components, flow of processes, key values, and educational takeaways so the student can study the concept thoroughly.
4. Minimal Text / Pure Visuals:
   - If the image has little or no text (e.g. an experiment photo, conceptual graphic, or historical map), provide a rich, detailed educational explanation and study guide covering the subject matter shown.
5. Language:
   - Preserve the authentic language of the document (English, Marathi, Hindi, etc.). Do not translate unless the user explicitly requested it.
6. Clean Output:
   - Output directly the structured educational text in Markdown. Do not include conversational filler like "Here is the transcription of your image:".`;

  const promptText = options.promptOverride || `Please transcribe and analyze all academic text, notes, equations, and diagrams from this image (${filename}). Preserve full detail for study notes, flashcards, and summary generation.`;

  let lastError = null;

  for (const model of GEMINI_VISION_MODELS) {
    try {
      console.log(`[Gemini Vision 👁️] Invoking ${model} for image: ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${detectedMime})...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await axios.post(
        url,
        {
          contents: [
            {
              parts: [
                { text: `${systemInstruction}\n\n${promptText}` },
                {
                  inlineData: {
                    mimeType: detectedMime,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 45000
        }
      );

      const candidate = response.data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text?.trim() || '';

      if (text && text.length > 20) {
        const words = text.split(/\s+/).filter(Boolean).length;
        console.log(`[Gemini Vision ✅] ${model} succeeded: extracted ${words} words (${text.length} chars).`);

        const langAnalysis = detectTextLanguage(text);
        const sections = parseTextIntoSections(text, options.subject || 'Key Concepts & Transcribed Notes');

        return {
          text,
          words,
          sections,
          pages: 1,
          confidence: 98,
          method: 'gemini_vision',
          status: 'ready',
          provider: `Google Gemini Vision (${model})`,
          primaryLanguage: langAnalysis.primaryLanguage || 'eng',
          detectedLanguages: langAnalysis.detectedLanguages || ['eng'],
          isRTL: !!langAnalysis.isRTL,
          scripts: langAnalysis.scripts || {}
        };
      } else {
        console.warn(`[Gemini Vision ⚠️] ${model} returned empty or very short response: "${text}". Trying next model...`);
      }
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.warn(`[Gemini Vision ⚠️] Model ${model} failed (status ${status}): ${errorMsg}`);
      lastError = err;

      // If rate limited 429, continue to next model
      if (status === 404) {
        // Model deprecated, try next immediately
        continue;
      }
    }
  }

  console.error('[Gemini Vision ❌] All Gemini Vision models exhausted or failed:', lastError?.message);
  return null;
}

module.exports = {
  resolveImageMimeType,
  parseTextIntoSections,
  extractWithGeminiVision,
  GEMINI_VISION_MODELS
};

