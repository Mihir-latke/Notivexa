/**
 * SpeechRecognitionService.js
 * Browser Speech Recognition adapter with live interim streaming and language mapping.
 */

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

class SpeechRecognitionService {
  constructor() {
    const SpeechRecognition = typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
      : null;
    this.recognitionClass = SpeechRecognition;
    this.instance = null;
    this.isListening = false;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
  }

  isSupported() {
    return Boolean(this.recognitionClass);
  }

  resolveLangCode(lang) {
    if (!lang) return 'en-US';
    const clean = String(lang).toLowerCase().trim();
    return LANG_CODE_MAP[clean] || 'en-US';
  }

  /**
   * Initialize microphone visualizer stream (Web Audio API AnalyserNode)
   */
  async initVisualizer(onVolumeUpdate) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      let animId = null;

      const track = () => {
        if (!this.isListening || !this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1.0, avg / 128); // 0.0 to 1.0
        if (typeof onVolumeUpdate === 'function') {
          onVolumeUpdate(normalized);
        }
        animId = requestAnimationFrame(track);
      };
      track();

      return () => {
        if (animId) cancelAnimationFrame(animId);
      };
    } catch (err) {
      console.warn('[SpeechRecognition Visualizer] Mic stream info:', err.message);
      return null;
    }
  }

  stopVisualizer() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
    this.analyser = null;
  }

  /**
   * Start recording and speech recognition
   */
  start({
    language = 'english',
    continuous = false,
    interimResults = true,
    onStart,
    onResult,
    onError,
    onEnd,
    onVolume
  }) {
    if (!this.isSupported()) {
      if (typeof onError === 'function') {
        onError({
          code: 'not-supported',
          message: 'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.'
        });
      }
      return false;
    }

    if (this.isListening) {
      this.stop();
    }

    try {
      this.instance = new this.recognitionClass();
      this.instance.lang = this.resolveLangCode(language);
      this.instance.continuous = continuous;
      this.instance.interimResults = interimResults;
      this.instance.maxAlternatives = 1;

      this.instance.onstart = () => {
        this.isListening = true;
        this.initVisualizer(onVolume);
        if (typeof onStart === 'function') onStart();
      };

      this.instance.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans;
          } else {
            interimTranscript += trans;
          }
        }

        if (typeof onResult === 'function') {
          onResult({
            interim: interimTranscript.trim(),
            final: finalTranscript.trim(),
            isFinal: Boolean(finalTranscript.trim())
          });
        }
      };

      this.instance.onerror = (event) => {
        let friendly = 'Microphone error occurred.';
        if (event.error === 'not-allowed') {
          friendly = 'Microphone access denied. Please click the lock icon in your browser URL bar to allow microphone access.';
        } else if (event.error === 'no-speech') {
          friendly = 'No speech was detected. Please speak closer to your microphone.';
        } else if (event.error === 'network') {
          friendly = 'Network connection issue during speech recognition.';
        }

        if (typeof onError === 'function') {
          onError({
            code: event.error,
            message: friendly
          });
        }
      };

      this.instance.onend = () => {
        this.isListening = false;
        this.stopVisualizer();
        if (typeof onEnd === 'function') onEnd();
      };

      this.instance.start();
      return true;
    } catch (err) {
      this.isListening = false;
      this.stopVisualizer();
      if (typeof onError === 'function') {
        onError({ code: 'exception', message: err.message });
      }
      return false;
    }
  }

  stop() {
    if (this.instance && this.isListening) {
      try {
        this.instance.stop();
      } catch {}
    }
    this.isListening = false;
    this.stopVisualizer();
  }

  abort() {
    if (this.instance) {
      try {
        this.instance.abort();
      } catch {}
    }
    this.isListening = false;
    this.stopVisualizer();
  }
}

export default new SpeechRecognitionService();
