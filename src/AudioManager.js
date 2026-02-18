import { CONSTANTS } from './constants.js';

/**
 * AudioManager.js
 * Hybrid Sound System:
 * - SE: AudioBuffer (WebAudio API) for low latency and polyphony.
 * - BGM: HTMLAudioElement for streaming and looping.
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.seBuffers = new Map(); // key -> AudioBuffer
        this.bgmElements = new Map(); // key -> HTMLAudioElement

        this.currentBgm = null;
        this.currentBgmKey = null;

        this.seVolume = CONSTANTS.SOUND_DEFAULTS.SE_VOLUME;
        this.bgmVolume = CONSTANTS.SOUND_DEFAULTS.BGM_VOLUME;

        this.activeSeCount = {}; // key -> count
        this.totalActiveSeCount = 0; // Global limit for mobile
        this.isInitialized = false;

        this.fades = new Map(); // audio -> animationFrameId
    }

    /**
     * Initializer: Must be called via user interaction.
     */
    async init() {
        if (this.isInitialized) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // Sequential weight loading for mobile stability (Prevents memory spikes)
        for (const [key, asset] of Object.entries(CONSTANTS.SOUND_ASSETS)) {
            if (asset.type === 'se') {
                await this.loadSe(key, asset.file);
            } else if (asset.type === 'bgm') {
                this.loadBgm(key, asset.file);
            }
        }

        this.isInitialized = true;

        // Final unlock for mobile browsers
        await this.unlock();

        console.log("AudioManager: All sounds loaded (Sequential for Stability).");
    }

    /**
     * Explicitly resume AudioContext and play a dummy sound to unlock on mobile.
     */
    async unlock() {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // Play a silent short buffer
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
    }

    async loadSe(key, p) {
        try {
            const resp = await fetch(p);
            const ab = await resp.arrayBuffer();

            // Compatible decoding (Promise/Callback)
            const buffer = await new Promise((resolve, reject) => {
                const promise = this.ctx.decodeAudioData(ab, resolve, reject);
                if (promise) promise.catch(reject);
            });

            this.seBuffers.set(key, buffer);
        } catch (e) {
            console.warn(`AudioManager: SE Load failed - ${key} (${p})`, e);
        }
    }

    loadBgm(key, p) {
        const asset = CONSTANTS.SOUND_ASSETS[key];
        const audio = new Audio(p);
        audio.loop = true;
        audio.volume = 0; // Starts muted for fade-in
        audio._baseVolume = asset.baseVolume ?? 1.0; // [NEW] 個別音量倍率を保持
        this.bgmElements.set(key, audio);
    }

    setSeVolume(v) {
        this.seVolume = Math.max(0, Math.min(1, v));
    }

    setBgmVolume(v) {
        this.bgmVolume = Math.max(0, Math.min(1, v));
        if (this.currentBgm) {
            // マスター音量 × そのBGMの個別倍率 を適用
            this.currentBgm.volume = this.bgmVolume * (this.currentBgm._baseVolume || 1.0);
        }
    }

    /**
     * Play SE (Polyphonic, Low Latency)
     */
    playSe(key, options = {}) {
        if (!this.isInitialized) return;
        const buffer = this.seBuffers.get(key);
        if (!buffer) return;

        // Polyphony limit (Relaxed for shots, Max 32 total for better performance)
        const limit = CONSTANTS.SE_POLYPHONY_LIMIT[key] || CONSTANTS.SE_POLYPHONY_LIMIT.DEFAULT;
        if (!this.activeSeCount[key]) this.activeSeCount[key] = 0;
        if (this.activeSeCount[key] >= limit) return;
        if (this.totalActiveSeCount >= 32) return;

        try {
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;

            const gainNode = this.ctx.createGain();

            // Weapon volume multipliers (SSOT)
            const multiplier = CONSTANTS.SE_VOLUME_MULTIPLIER[key] ?? 1.0;

            // Allow override volume if provided
            const vol = ((options.volume !== undefined) ? options.volume : this.seVolume) * multiplier;
            gainNode.gain.value = vol;

            // Pitch variation (Disabled for laser as requested)
            let variation = options.variation || 0;
            if (key === 'SE_SHOT_LASER') variation = 0;

            if (variation > 0) {
                source.playbackRate.value = 1 + (Math.random() - 0.5) * 2 * variation;
            } else if (options.pitch) {
                source.playbackRate.value = options.pitch;
            } else {
                source.playbackRate.value = 1.0;
            }

            source.connect(gainNode).connect(this.ctx.destination);

            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            // Count management
            this.activeSeCount[key]++;
            this.totalActiveSeCount++;

            source.onended = () => {
                this.activeSeCount[key]--;
                this.totalActiveSeCount--;
            };

            source.start(0);
        } catch (e) {
            console.warn("AudioManager: SE playback error:", key, e);
        }
    }

    /**
     * Play BGM (Pseudo-crossfade: 0.15s)
     */
    playBgm(key) {
        if (!this.isInitialized) return;
        if (this.currentBgmKey === key) return;

        const next = this.bgmElements.get(key);
        if (!next) {
            console.warn("AudioManager: BGM not found:", key);
            return;
        }

        const FADE_TIME = 0.15; // 0.15s specified

        // Fade out current
        if (this.currentBgm) {
            const prev = this.currentBgm;
            this.fadeOut(prev, FADE_TIME);
        }

        // Fade in next
        const targetVol = this.bgmVolume * (next._baseVolume || 1.0);
        next.currentTime = 0;
        next.volume = 0;
        next.play().catch(e => console.warn("AudioManager: BGM play blocked:", e));
        this.fadeIn(next, targetVol, FADE_TIME);

        this.currentBgm = next;
        this.currentBgmKey = key;
    }

    stopBgm(fadeTime = 0.15) {
        if (this.currentBgm) {
            this.fadeOut(this.currentBgm, fadeTime);
            this.currentBgm = null;
            this.currentBgmKey = null;
        }
    }

    pauseBgm() {
        if (this.currentBgm) {
            this.currentBgm.pause();
        }
    }

    resumeBgm() {
        if (this.currentBgm) {
            this.currentBgm.play().catch(e => console.warn("AudioManager: BGM resume blocked:", e));
        }
    }

    fadeIn(audio, targetVol, duration) {
        this.stopExistingFade(audio);
        const startVol = audio.volume;
        const startTime = Date.now();

        const tick = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const t = Math.min(1, elapsed / duration);
            audio.volume = startVol + (targetVol - startVol) * t;
            if (t < 1) {
                this.fades.set(audio, requestAnimationFrame(tick));
            } else {
                this.fades.delete(audio);
            }
        };
        this.fades.set(audio, requestAnimationFrame(tick));
    }

    fadeOut(audio, duration) {
        this.stopExistingFade(audio);
        const startVol = audio.volume;
        const startTime = Date.now();

        const tick = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const t = Math.min(1, elapsed / duration);
            audio.volume = startVol * (1 - t);
            if (t < 1) {
                this.fades.set(audio, requestAnimationFrame(tick));
            } else {
                audio.pause();
                this.fades.delete(audio);
            }
        };
        this.fades.set(audio, requestAnimationFrame(tick));
    }

    stopExistingFade(audio) {
        if (this.fades && this.fades.has(audio)) {
            cancelAnimationFrame(this.fades.get(audio));
            this.fades.delete(audio);
        }
    }
}
