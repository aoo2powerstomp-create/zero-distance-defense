/**
 * AudioManager.js
 * WebAudio API を使用した音声管理クラス
 * アセットなしでも動作するデモ音生成機能を内蔵
 */
export class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.bgmGain = null;

        this.buffers = new Map(); // key -> AudioBuffer
        this.lastPlayTimes = new Map(); // key -> timestamp
        this.activeNodes = new Set(); // 追跡用

        this.bgmSource = null;
        this.currentBgmKey = null;

        this.sfxVolume = 0.35;
        this.bgmVolume = 0.2;

        this.isInitialized = false;
    }

    /**
     * 初期化 (ユーザー操作に連動して呼び出す必要がある)
     */
    async init() {
        if (this.isInitialized) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // ゲインノードの階層構築
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();

        this.sfxGain.connect(this.masterGain);
        this.bgmGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain.gain.value = this.sfxVolume;
        this.bgmGain.gain.value = this.bgmVolume;

        // デモ音の生成
        await this.generateDemoSounds();

        this.isInitialized = true;
        console.log("AudioManager initialized and demo sounds generated.");
    }

    setSfxVolume(val) {
        this.sfxVolume = val;
        if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }

    setBgmVolume(val) {
        this.bgmVolume = val;
        if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }

    /**
     * 音声の登録（外部ファイルまたはバッファ）
     */
    async register(key, source) {
        if (source instanceof AudioBuffer) {
            this.buffers.set(key, source);
        } else if (typeof source === 'string') {
            try {
                const response = await fetch(source);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.buffers.set(key, audioBuffer);
            } catch (e) {
                console.error(`Failed to load audio: ${source}`, e);
            }
        }
    }

    /**
     * 再生
     */
    async play(key, options = {}) {
        if (!this.isInitialized) {
            console.warn(`AudioManager: key "${key}" played before init.`);
            return;
        }

        // ブラウザ制限により suspended になっている場合は再開を試みる
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        const buffer = this.buffers.get(key);
        if (!buffer) {
            console.warn(`AudioManager: key "${key}" not found.`);
            return;
        }

        const priority = options.priority || 'normal';
        const now = this.ctx.currentTime;

        // 同一キーの重複再生制限 (60ms)
        const lastTime = this.lastPlayTimes.get(key) || 0;
        if (priority !== 'high' && (now - lastTime) < 0.06) return;

        // 同時再生数制限 (簡易版: 15以上ある場合は古い順に一部停止はせず無視)
        if (this.activeNodes.size > 15 && priority === 'low') return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // ピッチランダム (±5%)
        const variation = options.variation || 0.05;
        source.playbackRate.value = 1 + (Math.random() - 0.5) * 2 * variation;

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = options.pan || 0;

        source.connect(panner);
        panner.connect(this.sfxGain);

        source.start(0);
        this.lastPlayTimes.set(key, now);
        this.activeNodes.add(source);

        source.onended = () => {
            this.activeNodes.delete(source);
        };

        return source;
    }

    /**
     * BGM再生 (簡易クロスフェード)
     */
    playBGM(key, loop = true) {
        if (!this.isInitialized) return;
        if (this.currentBgmKey === key) return;

        const buffer = this.buffers.get(key);
        if (!buffer) return;

        this.stopBGM();

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const fadeGain = this.ctx.createGain();
        fadeGain.gain.setValueAtTime(0, this.ctx.currentTime);
        fadeGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.5);

        source.connect(fadeGain);
        fadeGain.connect(this.bgmGain);

        source.start(0);
        this.bgmSource = { source, fadeGain };
        this.currentBgmKey = key;
    }

    stopBGM() {
        if (this.bgmSource) {
            const { source, fadeGain } = this.bgmSource;
            fadeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
            setTimeout(() => {
                try { source.stop(); } catch (e) { }
            }, 500);
            this.bgmSource = null;
            this.currentBgmKey = null;
        }
    }

    /**
     * WebAudio を使用してデモ用の音声を生成する
     */
    async generateDemoSounds() {
        const create = async (key, duration, genFn) => {
            const sampleRate = this.ctx.sampleRate;
            const length = sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            genFn(data, sampleRate);
            this.buffers.set(key, buffer);
        };

        // shoot: 短いノイズ + 減衰
        await create('shoot', 0.1, (data) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 2);
                data[i] = (Math.random() * 2 - 1) * 0.2 * env;
            }
        });

        // hit: 低音（着弾）
        await create('hit', 0.1, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 2);
                data[i] = Math.sin(i * 0.15) * 0.4 * env;
            }
        });

        // gold_collect: 高音クリック（以前の着弾音）
        await create('gold_collect', 0.05, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const env = 1 - i / data.length;
                data[i] = Math.sin(i * 0.5) * 0.3 * env;
            }
        });

        // countdown: ピ（中音）
        await create('countdown', 0.15, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 2);
                data[i] = Math.sin(i * 0.25) * 0.3 * env;
            }
        });

        // countdown_start: ピ↑（高音）
        await create('countdown_start', 0.25, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 2);
                data[i] = Math.sin(i * 0.5) * 0.4 * env;
            }
        });

        // damage: 低音パルス
        await create('damage', 0.2, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 3);
                data[i] = Math.sin(i * 0.05) * 0.5 * env;
            }
        });

        // explosion: ノイズ + 長い減衰
        await create('explosion', 0.6, (data) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 2);
                data[i] = (Math.random() * 2 - 1) * 0.5 * env;
            }
        });

        // upgrade: 上昇トーン
        await create('upgrade', 0.8, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                const freq = 440 + t * 440;
                const env = Math.sin(Math.PI * t);
                data[i] = Math.sin(i * freq * 2 * Math.PI / rate) * 0.3 * env;
            }
        });

        // menu_move: 短いUI音
        await create('menu_move', 0.05, (data) => {
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.sin(i * 0.8) * 0.2 * (1 - i / data.length);
            }
        });

        // menu_select: UI決定音
        await create('menu_select', 0.15, (data) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                data[i] = (Math.sin(i * 0.4) + Math.sin(i * 0.8)) * 0.2 * (1 - t);
            }
        });

        // barrier_hit: 硬い反射音
        await create('barrier_hit', 0.1, (data) => {
            for (let i = 0; i < data.length; i++) {
                const env = Math.pow(1 - i / data.length, 4);
                data[i] = Math.sin(i * 1.2) * 0.4 * env;
            }
        });

        // shield_on: 低い起動音
        await create('shield_on', 0.4, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                const freq = 200 - t * 100;
                data[i] = Math.sin(i * freq * 2 * Math.PI / rate) * 0.3 * (1 - t);
            }
        });

        // pulse_knockback: 低周波の重い衝撃音
        await create('pulse_knockback', 0.45, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                const env = Math.pow(1 - t, 2.5);
                // 複数の周波数を混ぜて厚みを出す
                const osc1 = Math.sin(i * 0.015); // 極低音
                const osc2 = (Math.random() * 2 - 1) * 0.1; // ノイズ成分
                data[i] = (osc1 + osc2) * 0.6 * env;
            }
        });

        // drop_spawn: 軽いバウンド音
        await create('drop_spawn', 0.1, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                const env = (1 - t) * Math.sin(t * Math.PI); // ポップなエンベロープ
                const freq = 300 - t * 100;
                data[i] = Math.sin(i * freq * 2 * Math.PI / rate) * 0.3 * env;
            }
        });

        // item_pickup: キラキラ高い音
        await create('item_pickup', 0.2, (data, rate) => {
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                const env = Math.pow(1 - t, 2);
                // アルペジオ的な響き
                const s1 = Math.sin(i * 1200 * 2 * Math.PI / rate);
                const s2 = Math.sin(i * 1800 * 2 * Math.PI / rate);
                data[i] = (s1 + s2) * 0.2 * env;
            }
        });
    }
}
