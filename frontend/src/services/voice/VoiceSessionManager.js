/**
 * VoiceSessionManager.js
 * State machine and orchestrator for ChatGPT-style continuous voice dialogue.
 * States: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'interrupted' | 'error'
 */

import SpeechRecognitionService from './SpeechRecognitionService';
import TextToSpeechService from './TextToSpeechService';
import AudioPlaybackManager from './AudioPlaybackManager';

class VoiceSessionManager {
  constructor() {
    this.state = 'idle';
    this.continuous = true;
    this.sessionStartTime = null;
    this.sessionTimer = null;
    this.elapsedSeconds = 0;
    this.listeners = new Set();
    this.volume = 0;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  setState(newState, payload = {}) {
    this.state = newState;
    this.emit({ state: newState, ...payload });
  }

  emit(data) {
    this.listeners.forEach(cb => {
      try { cb({ state: this.state, elapsedSeconds: this.elapsedSeconds, ...data }); } catch {}
    });
  }

  startSession() {
    this.elapsedSeconds = 0;
    this.sessionStartTime = Date.now();
    if (this.sessionTimer) clearInterval(this.sessionTimer);
    this.sessionTimer = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      this.emit({ type: 'tick', elapsedSeconds: this.elapsedSeconds });
    }, 1000);

    this.setState('idle');
  }

  endSession() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    SpeechRecognitionService.abort();
    TextToSpeechService.stop();
    AudioPlaybackManager.interrupt();
    this.setState('idle');
  }

  /**
   * Start listening for student speech
   */
  startListening({ language = 'english', onTranscription, onFinalSpeech, onError }) {
    // If AI is speaking, interrupt it first
    if (this.state === 'speaking') {
      this.interrupt();
    }

    this.setState('listening');

    const started = SpeechRecognitionService.start({
      language,
      continuous: false,
      interimResults: true,
      onStart: () => {
        this.setState('listening');
      },
      onVolume: (vol) => {
        this.volume = vol;
        this.emit({ type: 'volume', volume: vol });
      },
      onResult: ({ interim, final, isFinal }) => {
        if (interim && !isFinal) {
          this.setState('transcribing', { transcript: interim, isFinal: false });
          if (typeof onTranscription === 'function') onTranscription(interim, false);
        }
        if (isFinal && final) {
          this.setState('thinking', { transcript: final, isFinal: true });
          if (typeof onFinalSpeech === 'function') onFinalSpeech(final);
        }
      },
      onError: (err) => {
        this.setState('error', { error: err.message || 'Microphone error' });
        if (typeof onError === 'function') onError(err);
      },
      onEnd: () => {
        // If ended without speech and was listening
        if (this.state === 'listening') {
          this.setState('idle');
        }
      }
    });

    if (!started) {
      this.setState('error', { error: 'Could not access speech recognition.' });
    }
  }

  /**
   * User interrupts the AI speech immediately
   */
  interrupt() {
    TextToSpeechService.stop();
    AudioPlaybackManager.interrupt();
    this.setState('interrupted');
  }

  /**
   * Speak AI reply and manage transition to next turn
   */
  speakResponse(text, {
    language = 'english',
    rate = 1.0,
    voiceName = null,
    onSentenceStart,
    onComplete
  }) {
    this.setState('speaking', { text });

    TextToSpeechService.speak(text, {
      language,
      rate,
      voiceName,
      onStart: () => {
        this.setState('speaking', { text });
      },
      onSentenceStart: (info) => {
        this.emit({ type: 'sentence', ...info });
        if (typeof onSentenceStart === 'function') onSentenceStart(info);
      },
      onEnd: () => {
        // Finished speaking
        if (this.continuous) {
          // In continuous mode, transition back to listening after a small pause
          setTimeout(() => {
            if (this.state !== 'idle' && this.state !== 'error') {
              this.setState('idle', { autoResume: true });
              if (typeof onComplete === 'function') onComplete({ autoListen: true });
            }
          }, 450);
        } else {
          this.setState('idle');
          if (typeof onComplete === 'function') onComplete({ autoListen: false });
        }
      },
      onError: (err) => {
        console.warn('[VoiceSessionManager] TTS Error:', err.message);
        this.setState('idle');
        if (typeof onComplete === 'function') onComplete({ autoListen: this.continuous });
      }
    });
  }
}

export default new VoiceSessionManager();
