/**
 * AudioPlaybackManager.js
 * Central audio and speech playback coordinator that prevents overlapping audio
 * and provides instant interruption with zero latency.
 */

class AudioPlaybackManager {
  constructor() {
    this.currentAudio = null;
    this.isPlaying = false;
    this.volume = 1.0;
    this.listeners = new Set();
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(state) {
    this.listeners.forEach(cb => {
      try { cb(state); } catch {}
    });
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1.0, vol));
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  /**
   * Instantly cut off any active audio or synthesis speech
   */
  interrupt() {
    // 1. Stop SpeechSynthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // 2. Stop HTML5 Audio
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch {}
      this.currentAudio = null;
    }

    this.isPlaying = false;
    this.notify({ isPlaying: false, interrupted: true });
  }

  /**
   * Play an audio URL (e.g. from backend TTS)
   */
  async playUrl(url, { onStart, onEnd, onError, onTimeUpdate } = {}) {
    this.interrupt();

    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.volume = this.volume;
      this.currentAudio = audio;

      audio.onplay = () => {
        this.isPlaying = true;
        this.notify({ isPlaying: true, audio });
        if (typeof onStart === 'function') onStart();
      };

      audio.ontimeupdate = () => {
        if (typeof onTimeUpdate === 'function') {
          onTimeUpdate({
            currentTime: audio.currentTime,
            duration: audio.duration || 0,
            progress: audio.duration ? (audio.currentTime / audio.duration) : 0
          });
        }
      };

      audio.onended = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        this.notify({ isPlaying: false, ended: true });
        if (typeof onEnd === 'function') onEnd();
        resolve(true);
      };

      audio.onerror = (e) => {
        this.isPlaying = false;
        this.currentAudio = null;
        this.notify({ isPlaying: false, error: e });
        if (typeof onError === 'function') onError(e);
        reject(e);
      };

      audio.play().catch(err => {
        this.isPlaying = false;
        this.currentAudio = null;
        if (typeof onError === 'function') onError(err);
        reject(err);
      });
    });
  }
}

export default new AudioPlaybackManager();
