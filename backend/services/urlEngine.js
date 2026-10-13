/**
 * urlEngine.js — URL Content Extractor for Notivexa
 * Extracts full academic content from:
 * 1. YouTube videos (Transcripts, Video details, and AI Lecture Synthesis fallback)
 * 2. Online PDF links (Direct download & offline PDF parsing)
 * 3. Web articles and educational pages
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { YoutubeTranscript } = require('youtube-transcript');
const { extractFromPDF } = require('./pdfEngine');
const { callAI } = require('./aiService');

const PDF_DIR = path.join(__dirname, '../uploads/pdfs');
const DOC_DIR = path.join(__dirname, '../uploads/docs');
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(DOC_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════
// DETECTORS
// ═══════════════════════════════════════════════════════════════

const RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

function isYouTubeUrl(url) {
  return RE_YOUTUBE.test(url);
}

function extractYouTubeId(url) {
  const m = url.match(RE_YOUTUBE);
  return m ? m[1] : null;
}

function isPdfUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE EXTRACTOR
// ═══════════════════════════════════════════════════════════════

async function extractYouTube(url, userSubject = 'General') {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('Invalid YouTube URL. Please provide a valid YouTube video or shorts link.');

  console.log(`[URL Engine] Processing YouTube video: ${videoId}`);

  // 1. Fetch metadata via YouTube oEmbed
  let meta = { title: 'YouTube Video Lecture', author_name: 'YouTube Educator' };
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const r = await fetch(oembedUrl, { timeout: 10000 });
    if (r.ok) {
      const d = await r.json();
      if (d.title) meta.title = d.title;
      if (d.author_name) meta.author_name = d.author_name;
    }
  } catch (e) {
    console.warn('[YouTube oEmbed]', e.message);
  }

  // 2. Fetch page HTML for description
  let description = '';
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
      },
      timeout: 12000
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
                        html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
      if (descMatch) description = descMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    }
  } catch (e) {
    console.warn('[YouTube HTML]', e.message);
  }

  // 3. Attempt to fetch real transcript
  let transcript = null;
  try {
    transcript = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (e1) {
    console.warn(`[YouTubeTranscript] Default failed (${e1.message}), trying English...`);
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    } catch (e2) {
      console.warn(`[YouTubeTranscript] English failed, trying Hindi...`);
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'hi' });
      } catch {}
    }
  }

  let fullText = '';
  const sections = [];

  if (transcript && transcript.length > 0) {
    console.log(`[YouTubeTranscript ✅] Fetched ${transcript.length} transcript lines`);
    
    // Group into timestamped blocks (every ~40 entries or ~2 minutes)
    const chunkSize = 35;
    let currentChunk = [];
    let chunkIndex = 1;

    for (let i = 0; i < transcript.length; i++) {
      const item = transcript[i];
      // Clean HTML entities from transcript text
      const cleanLine = (item.text || '')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\[[^\]]+\]/g, '') // remove [Music], [Applause]
        .trim();

      if (cleanLine) currentChunk.push(cleanLine);

      if (currentChunk.length >= chunkSize || i === transcript.length - 1) {
        const chunkText = currentChunk.join(' ').replace(/\s+/g, ' ').trim();
        if (chunkText) {
          const startSec = Math.floor(transcript[Math.max(0, i - currentChunk.length + 1)].offset / 1000) || 0;
          const mins = Math.floor(startSec / 60);
          const secs = startSec % 60;
          const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;
          
          sections.push({
            title: `Part ${chunkIndex} (${timestamp})`,
            content: chunkText,
            wordCount: chunkText.split(/\s+/).filter(Boolean).length
          });
          chunkIndex++;
        }
        currentChunk = [];
      }
    }

    fullText = `Title: ${meta.title}\nChannel: ${meta.author_name}\n\n` +
      sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');

  } else {
    // 4. Captions disabled or not found -> Use AI to generate comprehensive lecture transcript from video details
    console.log('[URL Engine] No transcript available. Synthesizing lecture content via AI...');
    const sysPrompt = `You are an expert academic educator and lecture transcription AI for CBSE, JEE, NEET, and University students.
The user provided a YouTube educational video where subtitles were unavailable.
Based on the video's title, channel, subject, and description, generate a VERY DETAILED, comprehensive lecture transcript and academic breakdown.
Write in clear, formal academic language. Cover all fundamental concepts, definitions, formulas, derivations, examples, and key insights that an in-depth lecture on this topic would contain.
The output MUST be extensive (at least 1200 words) so that it can be used to generate study notes, flashcards, and exam papers.`;

    const userPrompt = `Video Title: "${meta.title}"
Channel / Instructor: "${meta.author_name}"
Subject: "${userSubject}"
Video Description / Context: "${description || 'Comprehensive educational lecture on ' + meta.title}"

Please generate the complete, exhaustive lecture transcript and study text.`;

    const generated = await callAI(sysPrompt, userPrompt, 4000);
    if (!generated || generated.length < 200) {
      throw new Error(`Could not extract or synthesize content from YouTube video "${meta.title}". Please verify the URL or try another video.`);
    }

    fullText = `Title: ${meta.title}\nChannel: ${meta.author_name}\n\n${generated}`;

    // Split generated text into logical sections
    const rawSections = generated.split(/(?=^##\s+)/m);
    if (rawSections.length > 1) {
      rawSections.forEach((sec, idx) => {
        const lines = sec.trim().split('\n');
        const title = lines[0].replace(/^##\s*/, '').trim() || `Topic ${idx + 1}`;
        const content = lines.slice(1).join('\n').trim() || sec.trim();
        sections.push({
          title: title.slice(0, 100),
          content,
          wordCount: content.split(/\s+/).filter(Boolean).length
        });
      });
    } else {
      // Split into 350-word chunks
      const wordsArr = generated.split(/\s+/);
      const CHUNK = 300;
      for (let i = 0; i < wordsArr.length; i += CHUNK) {
        const chunkText = wordsArr.slice(i, i + CHUNK).join(' ');
        sections.push({
          title: `Section ${Math.floor(i / CHUNK) + 1}`,
          content: chunkText,
          wordCount: chunkText.split(/\s+/).length
        });
      }
    }
  }

  // Save transcript locally for reference
  const docPath = path.join(DOC_DIR, `yt_${videoId}_${Date.now()}.txt`);
  fs.writeFileSync(docPath, fullText, 'utf8');

  const words = fullText.split(/\s+/).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(words / 350));

  return {
    text: fullText,
    sections,
    pages,
    words,
    title: meta.title,
    originalName: `YouTube: ${meta.title}`,
    fileType: 'youtube',
    filePath: docPath,
    size: Buffer.byteLength(fullText, 'utf8')
  };
}

// ═══════════════════════════════════════════════════════════════
// ONLINE PDF EXTRACTOR
// ═══════════════════════════════════════════════════════════════

async function extractOnlinePdf(url, userSubject = 'General') {
  console.log(`[URL Engine] Downloading online PDF: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000
  });

  if (!res.ok) throw new Error(`Failed to download online PDF (HTTP ${res.status}): ${res.statusText}`);

  const buffer = await res.buffer();
  if (!buffer || buffer.length < 500) throw new Error('Downloaded PDF file appears empty or corrupt.');

  // Extract a sensible title from the URL
  let title = 'Online PDF Document';
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base.toLowerCase().endsWith('.pdf')) {
      title = decodeURIComponent(base).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
    }
  } catch {}

  const tempFileName = `remote_${uuidv4()}.pdf`;
  const savedPath = path.join(PDF_DIR, tempFileName);
  fs.writeFileSync(savedPath, buffer);

  console.log(`[URL Engine] Saved remote PDF to ${savedPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const ext = await extractFromPDF(savedPath);

  return {
    text: ext.text,
    sections: ext.sections,
    pages: ext.pages,
    words: ext.words,
    title,
    originalName: path.basename(savedPath),
    fileType: 'pdf',
    filePath: savedPath,
    size: buffer.length
  };
}

// ═══════════════════════════════════════════════════════════════
// WEBPAGE / ARTICLE EXTRACTOR
// ═══════════════════════════════════════════════════════════════

async function extractWebpage(url, userSubject = 'General') {
  console.log(`[URL Engine] Fetching webpage: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 25000
  });

  if (!res.ok) throw new Error(`Failed to fetch URL (HTTP ${res.status}): ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return extractOnlinePdf(url, userSubject);
  }

  const html = await res.text();
  if (!html || html.length < 100) throw new Error('Webpage returned empty content.');

  // Extract Title
  let title = 'Web Article';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                     html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    // Clean common branding from title (e.g., " | Wikipedia", " - GeeksforGeeks")
    title = title.replace(/\s*[-–|]\s*(Wikipedia|GeeksforGeeks|Medium|Khan Academy|YouTube).*$/i, '').trim() || title;
  }

  // Clean HTML
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Extract Heading structure before full strip
  clean = clean
    .replace(/<h1[^>]*>/gi, '\n\n# ')
    .replace(/<h2[^>]*>/gi, '\n\n## ')
    .replace(/<h3[^>]*>/gi, '\n\n### ')
    .replace(/<li[^>]*>/gi, '\n* ')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n');

  // Strip remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');

  // Decode basic HTML entities
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ');

  // Normalize whitespace
  clean = clean
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  const wordsCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordsCount < 40) {
    throw new Error('Could not extract sufficient text from this webpage. It may require login or JavaScript rendering.');
  }

  // Create sections
  const sections = [];
  const lines = clean.split('\n');
  let currentTitle = 'Introduction & Overview';
  let currentLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed) && currentLines.length > 10) {
      const secContent = currentLines.join('\n').trim();
      if (secContent.length > 50) {
        sections.push({
          title: currentTitle.slice(0, 100),
          content: secContent,
          wordCount: secContent.split(/\s+/).filter(Boolean).length
        });
      }
      currentTitle = trimmed.replace(/^#{1,3}\s+/, '');
      currentLines = [];
    } else {
      if (trimmed) currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    const secContent = currentLines.join('\n').trim();
    if (secContent.length > 50) {
      sections.push({
        title: currentTitle.slice(0, 100),
        content: secContent,
        wordCount: secContent.split(/\s+/).filter(Boolean).length
      });
    }
  }

  // Fallback if no sections created
  if (sections.length === 0) {
    sections.push({
      title: 'Main Content',
      content: clean,
      wordCount: wordsCount
    });
  }

  const docPath = path.join(DOC_DIR, `web_${uuidv4()}.txt`);
  fs.writeFileSync(docPath, clean, 'utf8');

  const pages = Math.max(1, Math.ceil(wordsCount / 350));

  return {
    text: clean,
    sections,
    pages,
    words: wordsCount,
    title,
    originalName: url,
    fileType: 'url',
    filePath: docPath,
    size: Buffer.byteLength(clean, 'utf8')
  };
}

// ═══════════════════════════════════════════════════════════════
// MASTER EXTRACTOR
// ═══════════════════════════════════════════════════════════════

async function extractFromUrl(rawUrl, userSubject = 'General') {
  if (!rawUrl || typeof rawUrl !== 'string') throw new Error('Please enter a valid URL.');
  const url = rawUrl.trim();

  // Basic URL validation
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL must start with http:// or https://');
  }

  if (isYouTubeUrl(url)) {
    return await extractYouTube(url, userSubject);
  } else if (isPdfUrl(url)) {
    return await extractOnlinePdf(url, userSubject);
  } else {
    // Webpage or general link
    return await extractWebpage(url, userSubject);
  }
}

module.exports = {
  extractFromUrl,
  isYouTubeUrl,
  isPdfUrl
};

