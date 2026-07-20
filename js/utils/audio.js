// ============================================================================
// audio.js – Simple audio manager for PixelCraft
// ============================================================================
export class AudioManager {
  constructor() {
    this.context = null; // AudioContext for fallback beeps
    this.sounds = new Map(); // name => {buffer: AudioBuffer, defaultVolume: 1}
    this.audioElements = new Map(); // for streaming/ambient (HTMLAudioElement)
    this.listener = null; // will be set to AudioListener if using positional audio (not needed now)
  }

  /** Initialize AudioContext (must be called after a user gesture) */
  init() {
    if (!this.context) {
      try {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported', e);
      }
    }
    return this.context;
  }

  /**
   * Load an audio file and decode it to an AudioBuffer.
   * @param {string} name – identifier to use later with play()
   * @param {string} url – relative path to the audio file (e.g. 'assets/sounds/step_grass.wav')
   * @returns {Promise<void>}
   */
  async loadSound(name, url) {
    await this.init();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.sounds.set(name, { buffer: audioBuffer, defaultVolume: 1 });
    } catch (err) {
      console.warn(`Failed to load sound '${name}' from ${url}:`, err);
      // Create a fallback beep synth so the game doesn't silence
      const fallback = this._createBeep(440, 0.1); // 440 Hz, 0.1s
      this.sounds.set(name, { buffer: fallback, defaultVolume: 0.2 });
    }
  }

  /**
   * Play a loaded sound.
   * @param {string} name – the identifier used in loadSound()
   * @param {Object} [options] – {volume, rate, loop, position}
   * @returns {AudioBufferSourceNode|null} the created source node (so caller can stop it if needed)
   */
  play(name, options = {}) {
    const sound = this.sounds.get(name);
    if (!sound) {
      console.warn(`Sound '${name}' not loaded`);
      return null;
    }
    if (!this.context) this.init();
    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = !!options.loop;
    const gainNode = this.context.createGain();
    gainNode.gain.value = options.volume ?? sound.defaultVolume;
    source.playbackRate.value = options.rate ?? 1;
    source.connect(gainNode).connect(this.context.destination);
    source.start(0);
    return source;
  }

  /** Create a simple beep buffer as fallback */
  _createBeep(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 4); // quick decay
    }
    return buffer;
  }

  /** Load and play a looping ambient sound using HTMLAudioElement (better for long loops) */
  async loadAmbient(name, url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = true;
      audio.addEventListener('canplaythrough', () => {
        this.audioElements.set(name, audio);
        resolve();
      });
      audio.addEventListener('error', err => {
        console.warn(`Failed to load ambient sound '${name}':`, err);
        // create a silent audio element so calls don't break
        audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAA';
        this.audioElements.set(name, audio);
        resolve();
      });
      audio.src = url;
    });
  }

  playAmbient(name, volume = 0.5) {
    const audio = this.audioElements.get(name);
    if (!audio) {
      console.warn(`Ambient sound '${name}' not loaded`);
      return;
    }
    audio.volume = volume;
    audio.play().catch(e => console.warn('Ambient play failed (likely user gesture required)', e));
  }

  pauseAmbient(name) {
    const audio = this.audioElements.get(name);
    if (audio) audio.pause();
  }

  /** Clean up */
  dispose() {
    if (this.context) {
      this.context.close();
      this.context = null;
    }
    this.audioElements.forEach(a => {
      a.pause();
      a.src = '';
    });
    this.audioElements.clear();
    this.sounds.clear();
  }
}