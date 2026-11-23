/**
 * TextToSpeechService.js
 * Multi-engine text-to-speech service with markdown stripping,
 * sentence chunking for long academic explanations, and voice selection.
 */

import AudioPlaybackManager from './AudioPlaybackManager';

const LANG_CODE_MAP = {
  english: 'en-US',
  en: 'en-US',
  hindi: 'hi-IN',
  hi: 'hi-IN',
  marathi: 'mr-IN',
  mr: 'mr-IN',
  gujarati: 'gu-IN',
  gu: 'gu-IN',
  tamil: 'ta-IN',
  ta: 'ta-IN',
  telugu: 'te-IN',
  te: 'te-IN',
  bengali: 'bn-IN',
  bn: 'bn-IN',
  kannada: 'kn-IN',
  kn: 'kn-IN',
  urdu: 'ur-PK',
  ur: 'ur-PK',
  auto: 'en-US'
};

class TextToSpeechService {
  constructor() {
    this.voices = [];
    this.selectedVoice = null;
    this.speaking = false;
    this.initVoices();
  }

  initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const load = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
    };

    load();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  getAvailableVoices() {
    if (!this.voices.length && typeof window !== 'undefined' && window.speechSynthesis) {
      this.voices = window.speechSynthesis.getVoices() || [];
    }
    return this.voices;
  }

  resolveLangCode(lang) {
    if (!lang) return 'en-US';
    const clean = String(lang).toLowerCase().trim();
    return LANG_CODE_MAP[clean] || 'en-US';
  }

  /**
   * Clean markdown symbols, latex, citations and code blocks for natural speech
   */
  cleanTextForSpeech(markdown) {
    if (!markdown) return '';
    return markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, ' [Code example omitted] ')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove LaTeX math
      .replace(/\$\$[\s\S]*?\$\$/g, ' [Mathematical formula] ')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\\\([^\\]+\\\)/g, ' [Equation] ')
      // Remove headers #
      .replace(/#{1,6}\s+/g, '')
      // Remove bold/italics
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      // Remove Markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove citation badges like [Page 3, Chapter 2]
      .replace(/\[Page\s*\d+[^\]]*\]/gi, '')
      // Remove blockquotes >
      .replace(/^>\s+/gm, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Split long academic text into short natural sentence chunks
   */
  chunkText(text, maxLen = 180) {
    if (!text) return [];
    const sentences = text.match(/[^.!?।\n]+[.!?।\n]+|[^.!?।\n]+$/g) || [text];
    const chunks = [];
    let current = '';

    for (const s of sentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if ((current + ' ' + trimmed).length <= maxLen) {
        current = current ? (current + ' ' + trimmed) : trimmed;
      } else {
        if (current) chunks.push(current);
        current = trimmed;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * Best voice match for target language
   */
  findVoiceForLanguage(langCode, preferredVoiceName = null) {
    const list = this.getAvailableVoices();
    if (preferredVoiceName) {
      const match = list.find(v => v.name === preferredVoiceName);
      if (match) return match;
    }

    const norm = (langCode || 'en-US').toLowerCase();
    // 1. Exact language match (e.g. en-US, mr-IN, hi-IN)
    let match = list.find(v => v.lang.toLowerCase() === norm);
    if (match) return match;

    // 2. Prefix match (e.g. 'mr', 'hi', 'en')
    const prefix = norm.split('-')[0];
    match = list.find(v => v.lang.toLowerCase().startsWith(prefix));
    if (match) return match;

    // 3. Fallback to default or English
    return list.find(v => v.default) || list[0] || null;
  }

  /**
   * Speak response using browser SpeechSynthesis with sentence chunking
   */
  speak(text, {
    language = 'english',
    rate = 1.0,
    pitch = 1.0,
    voiceName = null,
    onStart,
    onSentenceStart,
    onEnd,
    onError
  } = {}) {
    // Cut off any currently playing audio immediately
    AudioPlaybackManager.interrupt();

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (typeof onError === 'function') {
        onError(new Error('Speech synthesis is not supported on this device.'));
      }
      return;
    }

    const clean = this.cleanTextForSpeech(text);
    if (!clean) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }

    const langCode = this.resolveLangCode(language);
    const selectedVoice = this.findVoiceForLanguage(langCode, voiceName);
    const chunks = this.chunkText(clean, 160);

    let currentChunkIndex = 0;
    this.speaking = true;

    const speakNextChunk = () => {
      if (!this.speaking || currentChunkIndex >= chunks.length) {
        this.speaking = false;
        AudioPlaybackManager.isPlaying = false;
        if (typeof onEnd === 'function') onEnd();
        return;
      }

      const sentence = chunks[currentChunkIndex];
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = Math.max(0.7, Math.min(1.8, rate));
      utterance.pitch = Math.max(0.8, Math.min(1.4, pitch));
      utterance.lang = langCode;
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onstart = () => {
        AudioPlaybackManager.isPlaying = true;
        if (currentChunkIndex === 0 && typeof onStart === 'function') {
          onStart();
        }
        if (typeof onSentenceStart === 'function') {
          onSentenceStart({ sentence, index: currentChunkIndex, total: chunks.length });
        }
      };

      utterance.onend = () => {
        currentChunkIndex++;
        speakNextChunk();
      };

      utterance.onerror = (err) => {
        if (err.error === 'interrupted' || err.error === 'canceled') {
          this.speaking = false;
          AudioPlaybackManager.isPlaying = false;
          return;
        }
        console.warn('[TextToSpeech Chunk Error]:', err.error);
        currentChunkIndex++;
        speakNextChunk();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakNextChunk();
  }

  stop() {
    this.speaking = false;
    AudioPlaybackManager.interrupt();
  }

  pause() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.pause(); } catch {}
    }
  }

  resume() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.resume(); } catch {}
    }
  }
}

export default new TextToSpeechService();
