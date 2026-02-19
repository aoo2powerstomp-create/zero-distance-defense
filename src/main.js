import { DEBUG_ENABLED } from './utils/env.js';
import { CONSTANTS } from './constants.js';
import { Player } from './Player.js';
import { Bullet, getStageByLevel, getTintForWeapon } from './Bullet.js';
import { Enemy } from './Enemy.js';
import { Gold } from './Gold.js';
import { DamageText } from './DamageText.js';
import { AudioManager } from './AudioManager.js';
import { Pool } from './Pool.js';
import { Effects } from './Effects.js';
import { Profiler } from './Profiler.js';
import { SpatialGrid } from './SpatialGrid.js';
import { ItemManager } from './ItemManager.js';
import { AssetLoader } from './AssetLoader.js';
import { FrameCache } from './utils/FrameCache.js';

import { SpawnDirector } from './SpawnDirector.js';
import { EconomyLogger } from './utils/EconomyLogger.js';
import { Simulator } from './utils/Simulator.js';

class Game {
    constructor() {
        // console.log("[INITIALIZING GAME]");
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isPaused = false; // Phase 1: State Addition
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

        // キャンバスサイズ設定
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.player = new Player(CONSTANTS.TARGET_WIDTH / 2, CONSTANTS.TARGET_HEIGHT / 2, this);

        // オブジェクトプール
        this.bulletPool = new Pool(() => new Bullet(), 100);
        this.enemyPool = new Pool(() => {
            const e = new Enemy();
            e.game = this;
            return e;
        }, 300);
        this.goldPool = new Pool(() => new Gold(), 100);
        this.damageTextPool = new Pool(() => new DamageText(), 50);

        // アクティブなエンティティ
        this.bullets = [];
        this.enemies = [];
        this.golds = [];
        this.damageTexts = [];

        this.goldCount = 0;
        this.displayGoldCount = 0; // 表示用カウンター（アニメーション用）

        // 統計データ
        this.totalKills = 0;
        this.totalGoldEarned = 0;
        this.currentStage = 0;
        this.killCount = 0;

        // 進行管理
        this.gameState = CONSTANTS.STATE.TITLE;
        this.returnState = null; // Options画面からの戻り先保持用 [NEW]
        this.spawnTimer = 0;
        this.stageTime = 0; // ステージ内経過時間
        this.enemiesRemaining = 0; // そのウェーブでスポーンすべき残り数

        // スポーン改善用
        this.sectors = []; // {centerDeg, timer}
        this.spawnQueue = 0;
        this.spawnPhase = 'BURST'; // 'BURST' or 'COOL'
        this.phaseTimer = 0;
        this.releaseTimer = 0; // 送出レート制限用
        this.totalQueuedSpawns = 0; // 統計用
        this.currentSpawnBudget = 0; // スポーン予算
        this.pulseCooldownTimer = 0; // パルスCD
        this.pulseEffects = []; // {x, y, radius, alpha}
        this.globalMarkTimer = 0; // OBSERVER によるマーキング

        this.grid = new SpatialGrid(64, CONSTANTS.TARGET_WIDTH, CONSTANTS.TARGET_HEIGHT);
        this.optimizationFrameCount = 0;
        this.itemManager = new ItemManager(this);
        this.freezeTimer = 0;
        this.screenShakeTimer = 0;
        this.screenShakeIntensity = 0;

        // 新しいプロパティ
        this.barrierState = 'idle'; // 'idle', 'windup', 'active', 'vulnerable'
        this.barrierTimer = 0;
        this.orbitAngle = 0;

        // デバッグ設定
        this.debugEnabled = DEBUG_ENABLED;
        this.debugSpawnLog = false; // [NEW] 
        this.debugInvincible = false;
        this.timeScale = 1.0;

        this.fixedDt = 1 / 60; // 60Hz [NEW]
        this.accumulator = 0;
        this.maxUpdatesPerFrame = 5;

        this.settings = {
            seVolume: 1.0,
            bgmVolume: 1.0,
            gameSpeed: 1.0
        };
        this.speedOptions = [1.0, 1.25, 1.5, 2.0];

        // 音声システム
        this.audio = new AudioManager();
        this.loadSettings();

        this.frameCache = new FrameCache();
        this.spawnDirector = new SpawnDirector(this);

        // 走行全体スタッツ (Game Over時にトータルを表示するため)
        this.runTotalDamageTaken = 0;
        this.runTotalItemsUsed = 0;
        this.runTotalTimeMs = 0;
        this.runTotalGameTime = 0; // [NEW] ゲーム内経過時間の累積 (x1換算)

        this.economyLogger = new EconomyLogger(this);
        this.shieldZones = []; // ★設置型シールド管理用

        this.initUI();
        this.setupDebugMenu();

        // アセットローダー初期化とロード開始
        this.assetLoader = new AssetLoader();
        this.assetLoader.loadAll(CONSTANTS.ASSET_MAP);
        this.isTransitioning = false; // [NEW] 遷移中ガードフラグ

        this.generateStageButtons();

        const upgradePanel = document.getElementById('upgrade-panel');
        if (upgradePanel) upgradePanel.classList.add('hidden');

        // 初回フェードイン [RESTORED]
        this.triggerFade('in', 1000);

        this.lastTime = performance.now();
        this.switchState(CONSTANTS.STATE.TITLE); // 初期状態を明示的にセット [NEW]
        requestAnimationFrame((t) => this.loop(t));
    }

    /**
     * ゲーム状態を一元管理し、UI表示を切り替える [NEW]
     */
    switchState(newState) {
        // 前の状態を保持する必要がある場合 (例: Options)
        if (newState === CONSTANTS.STATE.OPTIONS && this.gameState !== CONSTANTS.STATE.OPTIONS) {
            this.returnState = this.gameState;
        }

        this.gameState = newState;

        // UI表示の切り替え
        const screens = {
            [CONSTANTS.STATE.TITLE]: 'title-screen',
            [CONSTANTS.STATE.HOWTO]: 'howto-screen',
            [CONSTANTS.STATE.OPTIONS]: 'options-screen'
        };

        // 全てのオーバーレイを一旦隠す
        Object.values(screens).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        document.getElementById('pause-screen').classList.add('hidden');
        document.getElementById('confirm-screen').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden'); // Wave clear等
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');

        // 新しい状態に応じた表示
        if (screens[newState]) {
            document.getElementById(screens[newState]).classList.remove('hidden');
        }

        // ポーズ中
        if (this.isPaused && newState === CONSTANTS.STATE.PLAYING) {
            document.getElementById('pause-screen').classList.remove('hidden');
        }

        // プレイ中/カウントダウン中/Waveクリア中
        const isIngame = [
            CONSTANTS.STATE.PLAYING,
            CONSTANTS.STATE.COUNTDOWN,
            CONSTANTS.STATE.WAVE_CLEAR_CUTIN
        ].includes(newState);

        if (isIngame) {
            document.getElementById('hud').classList.remove('hidden');
            document.getElementById('controls').classList.remove('hidden');
        }
    }

    loop(currentTime) {
        let frameTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // クランプ（最大100ms）
        if (frameTime > 0.1) frameTime = 0.1;

        // 倍速設定を適用 [NEW]
        const scaledFrameTime = frameTime * this.settings.gameSpeed;
        this.accumulator += scaledFrameTime;

        let updateCount = 0;
        while (this.accumulator >= this.fixedDt) {
            this.update(this.fixedDt * 1000); // ms単位で渡す
            this.accumulator -= this.fixedDt;
            updateCount++;
            if (updateCount >= this.maxUpdatesPerFrame) {
                this.accumulator = 0; // スパイラル防止
                break;
            }
        }

        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        if (this.overlayCanvas) {
            this.overlayCanvas.width = parent.clientWidth;
            this.overlayCanvas.height = parent.clientHeight;
        }
    }

    triggerFade(type, duration = 1000) {
        const overlay = document.getElementById('fade-overlay');
        if (!overlay) return Promise.resolve();

        overlay.classList.remove('fade-in', 'fade-out');
        void overlay.offsetWidth; // trigger reflow
        overlay.classList.add(type === 'in' ? 'fade-in' : 'fade-out');

        return new Promise(resolve => setTimeout(resolve, duration));
    }

    setupDebugMenu() {
        const el = document.getElementById("debugMenu");
        if (!el) return;
        if (DEBUG_ENABLED) {
            el.style.display = "block";
            el.classList.remove('hidden');
        } else {
            el.style.display = "none";
            el.classList.add('hidden');
        }
    }

    initUI() {
        // タイトル画面：STARTボタン
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.addEventListener('click', async () => {
                this.startNewRun();
            });
        }

        // [NEW] HOW TO PLAY ボタン
        const btnHowto = document.getElementById('btn-howto');
        if (btnHowto) {
            btnHowto.addEventListener('click', async () => {
                await this.audio.init();
                this.gameState = CONSTANTS.STATE.HOWTO;
                const howtoScreen = document.getElementById('howto-screen');
                const titleScreen = document.getElementById('title-screen');
                if (howtoScreen) howtoScreen.classList.remove('hidden');
                if (titleScreen) titleScreen.classList.add('hidden');
                this.switchHowtoTab('controls', true); // 初期化時は無音
                this.audio.playSe('SE_SELECT');
            });
        }

        // HOW TO PLAY タブ切り替え
        const btnHowtoTabControls = document.getElementById('btn-howto-tab-controls');
        if (btnHowtoTabControls) {
            btnHowtoTabControls.addEventListener('click', () => {
                this.switchHowtoTab('controls');
            });
        }

        const btnHowtoTabEnemies = document.getElementById('btn-howto-tab-enemies');
        if (btnHowtoTabEnemies) {
            btnHowtoTabEnemies.addEventListener('click', () => {
                this.switchHowtoTab('enemies');
            });
        }

        // [NEW] OPTIONS ボタン
        const btnOptions = document.getElementById('btn-options');
        if (btnOptions) {
            btnOptions.addEventListener('click', async () => {
                await this.audio.init();
                this.gameState = CONSTANTS.STATE.OPTIONS;
                const optionsScreen = document.getElementById('options-screen');
                const titleScreen = document.getElementById('title-screen');
                if (optionsScreen) optionsScreen.classList.remove('hidden');
                if (titleScreen) titleScreen.classList.add('hidden');
                this.updateOptionsUI();
                this.audio.playSe('SE_SELECT');
            });
        }

        // OPTIONS 画面のイベントリスナー
        const btnOptionsBack = document.getElementById('btn-options-back');
        if (btnOptionsBack) {
            btnOptionsBack.addEventListener('click', () => {
                // 戻り先を判別
                const target = this.returnState || CONSTANTS.STATE.TITLE;
                this.switchState(target);
                this.audio.playSe('SE_SELECT');
            });
        }

        const btnOptionsReset = document.getElementById('btn-options-reset');
        if (btnOptionsReset) {
            btnOptionsReset.addEventListener('click', () => {
                if (confirm('設定をすべてリセットしますか？')) {
                    this.resetSettings();
                    this.audio.playSe('SE_BARRIER_01');
                }
            });
        }

        const sliderSe = document.getElementById('slider-se-volume');
        if (sliderSe) {
            sliderSe.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) / 100;
                this.settings.seVolume = val;
                this.audio.setSeVolume(val);
                this.updateOptionsUI();
                this.saveSettings();
            });
        }

        const sliderBgm = document.getElementById('slider-bgm-volume');
        if (sliderBgm) {
            sliderBgm.addEventListener('input', (e) => {
                const val = parseInt(e.target.value) / 100;
                this.settings.bgmVolume = val;
                this.audio.setBgmVolume(val);
                this.updateOptionsUI();
                this.saveSettings();
            });
        }

        const btnSpeedPrev = document.getElementById('btn-speed-prev');
        if (btnSpeedPrev) {
            btnSpeedPrev.addEventListener('click', () => {
                const idx = this.speedOptions.indexOf(this.settings.gameSpeed);
                if (idx > 0) {
                    this.settings.gameSpeed = this.speedOptions[idx - 1];
                    this.updateOptionsUI();
                    this.saveSettings();
                    this.audio.playSe('SE_SELECT');
                }
            });
        }

        const btnSpeedNext = document.getElementById('btn-speed-next');
        if (btnSpeedNext) {
            btnSpeedNext.addEventListener('click', () => {
                const idx = this.speedOptions.indexOf(this.settings.gameSpeed);
                if (idx < this.speedOptions.length - 1) {
                    this.settings.gameSpeed = this.speedOptions[idx + 1];
                    this.updateOptionsUI();
                    this.saveSettings();
                    this.audio.playSe('SE_SELECT');
                }
            });
        }

        const btnHowtoBack = document.getElementById('btn-howto-back');
        if (btnHowtoBack) {
            btnHowtoBack.addEventListener('click', () => {
                this.switchState(CONSTANTS.STATE.TITLE);
                this.audio.playSe('SE_SELECT');
            });
        }

        // [NEW] EXIT ボタン
        const btnExit = document.getElementById('btn-exit');
        if (btnExit) {
            btnExit.addEventListener('click', () => {
                this.audio.playSe('SE_SELECT');
                this.exitGame();
            });
        }

        // [NEW] PAUSE 画面ボタン
        const btnPauseResume = document.getElementById('btn-pause-resume');
        if (btnPauseResume) {
            btnPauseResume.addEventListener('click', () => {
                this.togglePause();
            });
        }

        const btnPauseOptions = document.getElementById('btn-pause-options');
        if (btnPauseOptions) {
            btnPauseOptions.addEventListener('click', () => {
                this.switchState(CONSTANTS.STATE.OPTIONS);
                this.audio.playSe('SE_SELECT');
            });
        }

        const btnPauseTitle = document.getElementById('btn-pause-title');
        if (btnPauseTitle) {
            btnPauseTitle.addEventListener('click', () => {
                document.getElementById('confirm-screen').classList.remove('hidden');
                this.audio.playSe('SE_SELECT');
            });
        }

        // [NEW] 確認ダイアログ
        const btnConfirmYes = document.getElementById('btn-confirm-yes');
        if (btnConfirmYes) {
            btnConfirmYes.addEventListener('click', () => {
                this.audio.playSe('SE_BARRIER_01');
                document.getElementById('confirm-screen').classList.add('hidden');
                this.goToTitle();
            });
        }

        const btnConfirmNo = document.getElementById('btn-confirm-no');
        if (btnConfirmNo) {
            btnConfirmNo.addEventListener('click', () => {
                document.getElementById('confirm-screen').classList.add('hidden');
                this.audio.playSe('SE_SELECT');
            });
        }

        // ステージセレクト表示のトグル
        const btnToggleStage = document.getElementById('btn-toggle-stage-select');
        const stageSelectList = document.getElementById('stage-select-list');
        const stageSelectContainer = document.getElementById('stage-select-container');

        if (!DEBUG_ENABLED && stageSelectContainer) {
            stageSelectContainer.classList.add('hidden');
        }

        if (btnToggleStage && stageSelectList) {
            btnToggleStage.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = stageSelectList.classList.toggle('hidden');
                this.audio.playSe('SE_BARRIER_02');
                btnToggleStage.textContent = isHidden ? 'STAGE SELECT' : 'CLOSE SELECT';
            });
        }

        // 武器選択ボタン
        document.querySelectorAll('.weapon-up-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // カウントダウン中やポーズ中は無効
                if (this.isCountdownActive() || this.isPaused) return;

                const type = btn.getAttribute('data-up-weapon');
                const data = this.player.weapons[type];
                const config = CONSTANTS.WEAPON_CONFIG[type];

                if (!data.unlocked) {
                    if (this.goldCount >= config.unlockCost) {
                        this.goldCount -= config.unlockCost;
                        data.unlocked = true;
                        this.player.currentWeapon = type;
                        this.audio.playSe('SE_BARRIER_01');
                        this.spawnDamageText(this.player.x, this.player.y - 20, "UNLOCKED!", "#ffffff");
                    }
                } else {
                    if (this.player.currentWeapon === type) {
                        const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level, CONSTANTS.UPGRADE_COST_GROWTH_WEAPON);
                        if (this.goldCount >= cost && data.level < CONSTANTS.UPGRADE_LV_MAX) {
                            this.goldCount -= cost;
                            data.level++;
                            this.audio.playSe('SE_BARRIER_01');
                            this.spawnDamageText(this.player.x, this.player.y - 20, "POWER UP!", "#ffff00");
                        }
                    } else {
                        this.player.currentWeapon = type;
                        this.audio.playSe('SE_SELECT');
                    }
                }
                this.updateUI();
            });
        });

        // SPEED強化ボタン
        document.getElementById('btn-up-speed').addEventListener('click', () => {
            // カウントダウン中やポーズ中は無効
            if (this.isCountdownActive() || this.isPaused) return;

            const type = this.player.currentWeapon;
            const data = this.player.weapons[type];
            const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, data.atkSpeedLv, CONSTANTS.UPGRADE_COST_GROWTH_SPEED);

            if (this.goldCount >= cost && data.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX) {
                this.goldCount -= cost;
                data.atkSpeedLv++;
                this.audio.playSe('SE_BARRIER_01');
                this.spawnDamageText(this.player.x, this.player.y - 20, "SPEED UP!", "#00ff88");
                this.updateUI();
            }
        });

        // 回転操作リスナー：マウスとタッチの両方に対応
        const handlePointerWrap = (e) => {
            // UI判定を最優先で行い、UI操作時は一切のゲーム側入力を遮断し、ブラウザの標準動作を許可する
            const target = e.target;
            const isUI = target.closest('#hud') || target.closest('#controls') || target.closest('.overlay-base') ||
                target.closest('#debug-ui-container') || target.closest('#debug-stats-panel');

            // canvas 自体または透過している領域であれば処理を継続する（それ以外のUIならここで終了）
            if (isUI && target !== this.canvas) return;

            const touch = (e.touches && e.touches.length > 0) ? e.touches[0] :
                (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0] : null;

            let clientX, clientY;
            if (touch) {
                clientX = touch.clientX;
                clientY = touch.clientY;

                // ゲーム領域でのタッチ移動やスクロールを防止
                const isInteractive = target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'INPUT' ||
                    target.closest('button') || target.closest('.btn-stage') || target.closest('select') || target.closest('input');
                if (e.cancelable && !isInteractive) e.preventDefault();
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // clientX/Y が NaN または undefined の場合は処理しない
            if (clientX === undefined || clientY === undefined || isNaN(clientX) || isNaN(clientY)) return;

            const isAction = e.type === 'mousedown' || e.type === 'touchstart';
            this.handlePointer(clientX, clientY, isAction);
        };

        const inputTarget = this.canvas.parentElement || this.canvas;
        inputTarget.addEventListener('mousedown', handlePointerWrap);
        inputTarget.addEventListener('mousemove', handlePointerWrap);
        inputTarget.addEventListener('mouseup', handlePointerWrap);

        inputTarget.addEventListener('touchstart', handlePointerWrap, { passive: false });
        inputTarget.addEventListener('touchmove', handlePointerWrap, { passive: false });
        inputTarget.addEventListener('touchend', handlePointerWrap, { passive: false });

        // リザルト等ボタン
        const btnNext = document.getElementById('btn-next');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (this.lastResult && this.lastResult.stageIndex !== undefined) {
                    this.startStage(this.lastResult.stageIndex + 1, { next: true });
                }
            });
        }

        const btnRetry = document.getElementById('btn-retry');
        if (btnRetry) {
            btnRetry.addEventListener('click', () => {
                if (this.lastResult && this.lastResult.stageIndex !== undefined) {
                    this.startStage(this.lastResult.stageIndex, { retry: true });
                }
            });
        }

        const btnTitle = document.getElementById('btn-title');
        if (btnTitle) {
            btnTitle.addEventListener('click', () => {
                this.goToTitle();
            });
        }

        // 全てのボタンへのフォーカス/ホバー音の一括適用
        const playTick = (e) => {
            const target = e.target.closest('button, .btn-stage, .weapon-up-btn, #btn-up-speed');
            if (target && !target.disabled) {
                if (this._lastTickTarget !== target) {
                    // SE_UI_TICK を鳴らす。ただし初期化されていない場合は何もしない（ブラウザ制限）
                    if (this.audio && this.audio.isInitialized) {
                        this.audio.playSe('SE_UI_TICK', { volume: 0.25 });
                    }
                    this._lastTickTarget = target;
                }
            } else {
                this._lastTickTarget = null;
            }
        };
        document.addEventListener('mouseover', playTick);
        document.addEventListener('focusin', playTick);

        // [Global] 初回のクリック/タップで音源を初期化する（ホバー音のため）
        const initOnGesture = async () => {
            await this.audio.init();
            document.removeEventListener('mousedown', initOnGesture);
            document.removeEventListener('touchstart', initOnGesture);
        };
        document.addEventListener('mousedown', initOnGesture);
        document.addEventListener('touchstart', initOnGesture);

        window.addEventListener('resize', () => this.resize());
        this.resize();

        // Phase 3: Input Handling (Keyboard)
        window.addEventListener('keydown', (e) => {
            if (this.gameState === CONSTANTS.STATE.PLAYING) {
                if (e.code === 'KeyP' || e.code === 'Escape') {
                    this.togglePause();
                }
            } else if (this.gameState === CONSTANTS.STATE.HOWTO) {
                if (e.code === 'Escape') {
                    // Back to title from HOWTO
                    document.getElementById('btn-howto-back').click();
                }
            } else if (this.gameState === CONSTANTS.STATE.OPTIONS) {
                if (e.code === 'Escape') {
                    // Back to title from OPTIONS
                    document.getElementById('btn-options-back').click();
                }
            }
        });

        // PULSEボタン
        const btnPulse = document.getElementById('btn-pulse');
        if (btnPulse) {
            btnPulse.addEventListener('click', () => {
                if (this.isPaused) return;
                this.triggerPulse();
            });
        }

        if (DEBUG_ENABLED) {
            // デバッグGOLDボタン
            const btnDebugGold = document.getElementById('btn-debug-gold');
            if (btnDebugGold) {
                btnDebugGold.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isPaused) return;
                    this.goldCount += 100000;
                    this.totalGoldEarned += 100000;
                    this.audio.playSe('SE_HP');
                    this.spawnDamageText(this.player.x, this.player.y - 20, "+100,000G", "#ffd700");
                    this.updateUI();
                });
            }

            // デバッグMAXボタン
            const btnDebugMax = document.getElementById('btn-debug-max');
            if (btnDebugMax) {
                btnDebugMax.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isPaused) return;
                    const maxLv = CONSTANTS.UPGRADE_LV_MAX;
                    Object.keys(this.player.weapons).forEach(key => {
                        this.player.weapons[key].unlocked = true;
                        this.player.weapons[key].level = maxLv;
                        this.player.weapons[key].atkSpeedLv = maxLv;
                    });
                    this.spawnDamageText(this.player.x, this.player.y - 40, "FULL POWER!", "#ff00ff");
                    this.updateUI();
                });
            }

            // デバッグ無敵ボタン
            const btnDebugInvincible = document.getElementById('btn-debug-invincible');
            if (btnDebugInvincible) {
                btnDebugInvincible.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isPaused) return;
                    this.debugInvincible = !this.debugInvincible;
                    btnDebugInvincible.textContent = `INVINCIBLE: ${this.debugInvincible ? 'ON' : 'OFF'}`;
                    btnDebugInvincible.style.color = this.debugInvincible ? '#ffd700' : '#fff';
                    if (this.debugInvincible) {
                        this.spawnDamageText(this.player.x, this.player.y - 60, "GOD MODE!", "#ffd700");
                    }
                });
            }

            // デバッグSPEEDボタン
            const btnDebugSpeed = document.getElementById('btn-debug-speed');
            if (btnDebugSpeed) {
                btnDebugSpeed.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isPaused) return;
                    if (this.timeScale >= 3.0) this.timeScale = 1.0;
                    else this.timeScale += 1.0;
                    btnDebugSpeed.textContent = `SPEED: x${this.timeScale}`;
                });
            }

            // デバッグクリアボタン [NEW]
            const btnDebugClear = document.getElementById('btn-debug-clear');
            if (btnDebugClear) {
                btnDebugClear.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.stageClear();
                });
            }

            // [NEW] デバッグルールダンプボタン
            const btnDebugRules = document.getElementById('btn-debug-rules');
            if (btnDebugRules) {
                btnDebugRules.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log(this.spawnDirector.rules.dumpRules());
                    alert(this.spawnDirector.rules.dumpRules());
                });
            }
        }

        // PC向け：マウスホイールでの武器切り替え
        window.addEventListener('wheel', (e) => {
            // カウントダウン中やリザルト画面では無効
            if (this.gameState !== CONSTANTS.STATE.PLAYING && this.gameState !== CONSTANTS.STATE.WAVE_CLEAR_CUTIN) return;

            const weaponTypes = [
                CONSTANTS.WEAPON_TYPES.STANDARD,
                CONSTANTS.WEAPON_TYPES.SHOT,
                CONSTANTS.WEAPON_TYPES.PIERCE
            ];

            // 解放済みの武器のみを抽出
            const unlockedWeapons = weaponTypes.filter(type => this.player.weapons[type].unlocked);
            if (unlockedWeapons.length <= 1) return;

            const currentIndex = unlockedWeapons.indexOf(this.player.currentWeapon);
            let nextIndex = currentIndex;

            if (e.deltaY > 0) {
                // 下スクロール：次の武器
                nextIndex = (currentIndex + 1) % unlockedWeapons.length;
            } else if (e.deltaY < 0) {
                // 上スクロール：前の武器
                nextIndex = (currentIndex - 1 + unlockedWeapons.length) % unlockedWeapons.length;
            }

            if (nextIndex !== currentIndex) {
                this.player.currentWeapon = unlockedWeapons[nextIndex];
                this.audio.playSe('SE_SELECT');
                this.updateUI();
            }
        }, { passive: true });
    }

    handlePointer(clientX, clientY, isAction = false) {
        const inputTarget = this.canvas.parentElement || this.canvas;
        const rect = inputTarget.getBoundingClientRect();

        // 座標計算。NaNガード付き
        const mouseX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const mouseY = Math.max(0, Math.min(rect.height, clientY - rect.top));

        if (isAction && this.checkPauseButton(mouseX, mouseY)) {
            this.togglePause();
            return;
        }

        if (this.isPaused) return; // Block game inputs while paused

        const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
        const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;

        // リザルト画面のクリック判定
        if (this.gameState === CONSTANTS.STATE.RESULT && isAction && this.resultTimer > 1000) { // 1秒後から入力受付
            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;
            const x = (mouseX - offsetX) / scale;
            const y = mouseY / scale;

            // ボタン定義 (drawResultScreenと合わせる)
            const btnW = 160, btnH = 50;
            const startY = 600;
            const cX = CONSTANTS.TARGET_WIDTH / 2;

            // Next
            if (this.currentStage < CONSTANTS.STAGE_DATA.length - 1) {
                if (Math.abs(x - cX) < btnW / 2 && Math.abs(y - startY) < btnH / 2) {
                    this.audio.playSe('SE_BARRIER_01');
                    this.startNextWave();
                    return;
                }
            }

            // Retry
            if (Math.abs(x - (cX - 150)) < btnW / 2 && Math.abs(y - startY) < btnH / 2) {
                this.audio.playSe('SE_BARRIER_01');
                this.startCountdown(); // 同じステージを再開
                return;
            }

            // Title
            if (Math.abs(x - (cX + 150)) < btnW / 2 && Math.abs(y - startY) < btnH / 2) {
                this.audio.playSe('SE_BARRIER_01');
                this.triggerFade('out', 500).then(() => location.reload());
                return;
            }
        }


        // アイテム取得を試行 (クリック/タップ時のみ)
        if (isAction && this.gameState === CONSTANTS.STATE.PLAYING) {
            const picked = this.itemManager.tryPickup(clientX, clientY, rect, scale, offsetX, this.player, this);
            if (picked) return; // アイテムを取った場合は移動/射撃を行わない
        }

        // mouseX/Y are already calculated above, but standard logic uses them again
        // We can reuse or recalculate. Original logic re-calculated them.
        // const mouseX = clientX - rect.left;
        // const mouseY = clientY - rect.top;

        // 仮想空間上の座標へ逆写像
        const targetX = (mouseX - offsetX) / (scale || 1.0);
        const targetY = mouseY / (scale || 1.0);

        if (!isNaN(targetX) && !isNaN(targetY)) {
            this.player.targetX = targetX;
            this.player.targetY = targetY;
        }
    }

    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2);
    }

    drawResultScreen(ctx) {
        // 背景を暗くするだけで、文字は描画しない（DOMに任せる）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, CONSTANTS.TARGET_WIDTH, CONSTANTS.TARGET_HEIGHT);
    }

    drawButton(ctx, x, y, text, color) {
        const w = 150; // 160 -> 150
        const h = 46; // 50 -> 46
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);

        ctx.fillStyle = color;
        ctx.font = 'bold 16px "Syncopate", sans-serif'; // 18 -> 16
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
    }

    generateStageButtons() {
        const list = document.getElementById('stage-select-list');
        if (!list) {
            console.error("DOM Error: stage-select-list not found");
            return;
        }

        // 重複生成防止
        list.innerHTML = '';

        if (!CONSTANTS.STAGE_DATA) {
            console.error("Data Error: CONSTANTS.STAGE_DATA is undefined");
            return;
        }

        CONSTANTS.STAGE_DATA.forEach((stage, index) => {
            const btn = document.createElement('button');
            btn.className = 'btn-stage';
            const stageNum = index + 1;
            btn.textContent = stageNum;

            // ボスステージ（5の倍数）は赤いデザインに
            if (stageNum % 5 === 0) {
                btn.classList.add('boss');
            }

            btn.addEventListener('click', async () => {
                await this.audio.init();
                this.audio.playSe('SE_BARRIER_01', { priority: 'high' });
                this.startStage(index);
            });

            list.appendChild(btn);
        });

        // Debug Stage Button
        if (DEBUG_ENABLED) {
            const btn = document.createElement('button');
            btn.className = 'btn-stage';
            btn.textContent = 'DEBUG STAGE';
            btn.style.width = '200px'; // Slightly wider
            btn.style.borderColor = '#ff00ff';
            btn.style.color = '#ff00ff';

            btn.addEventListener('click', async () => {
                await this.audio.init();
                this.audio.playSe('SE_BARRIER_01', { priority: 'high' });
                this.startStage(CONSTANTS.STAGE_DEBUG);
            });

            list.appendChild(btn);
        }
    }

    getUpgradeCost(base, level, growth) {
        return Math.round(base * Math.pow(growth, level - 1));
    }

    /**
     * ラン(Run)全体の状態を初期化する (SSOT)
     * 新規開始(START)時にのみ呼び出す
     */
    resetRunState() {
        this.goldCount = 0;
        this.displayGoldCount = 0;
        this.totalGoldEarned = 0;
        this.totalKills = 0;
        this.runTotalDamageTaken = 0;
        this.runTotalItemsUsed = 0;
        this.runTotalTimeMs = 0;
        this.runTotalGameTime = 0;

        // 武器レベルの初期化
        Object.keys(this.player.weapons).forEach(type => {
            this.player.weapons[type].unlocked = true; // [MOD] 最初から全開放
            this.player.weapons[type].level = 1;
            this.player.weapons[type].atkSpeedLv = 1;
        });
        this.player.currentWeapon = CONSTANTS.WEAPON_TYPES.STANDARD;
        this.currentStage = 0;
    }

    /**
     * ステージ挑戦(Attempt)の状態をリセットする (SSOT)
     * リトライや次ステージ開始時に毎回呼び出す
     */
    resetAttemptState() {
        // オブジェクトの全クリア
        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.bullets.forEach(b => this.bulletPool.release(b));
        this.bullets = [];
        this.golds.forEach(g => this.goldPool.release(g));
        this.golds = [];
        this.damageTexts.forEach(d => this.damageTextPool.release(d));
        this.damageTexts = [];
        this.shieldZones = []; // 設置型シールドも消去

        // プレイヤー状態のリセット
        this.player.hp = CONSTANTS.PLAYER_MAX_HP;
        this.player.barrierCharges = CONSTANTS.BARRIER_MAX_CHARGES;
        this.player.overdriveUntilMs = 0;
        this.player.invincibleUntilMs = 0;
        this.player.damageFlashTimer = 0;

        // ステージ統計・タイマーのリセット
        this.enemiesRemaining = 0;
        this.spawnTimer = 0;
        this.stageTime = 0;
        this.stageGameTime = 0;
        this.killCount = 0;
        this.stageGoldEarned = 0;

        // スポーン・物理・視覚効果のリセット
        this.spawnQueue = 0;
        this.bossSpawned = false;
        this.isClearing = false;
        this.pulseCooldownTimer = 0;
        this.pulseEffects = [];
        this.globalMarkTimer = 0;
        this.freezeTimer = 0;
        this.screenShakeTimer = 0;
        this.isPaused = false;

        // プロセス・管理クラスのリセット
        if (this.spawnDirector) this.spawnDirector.resetForStage();
        if (this.economyLogger) this.economyLogger.resetForStage(this.currentStage);

        // UIの状態復帰
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.classList.add('hidden');
        const pauseScreen = document.getElementById('pause-screen');
        if (pauseScreen) pauseScreen.classList.add('hidden');
    }

    /**
     * 完全な新規ランを開始する (ENTRY POINT)
     */
    async startNewRun() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        await this.audio.init();
        this.audio.playSe('SE_GAME_START', { priority: 'high' });

        await this.triggerFade('out', 500);

        this.resetRunState();
        await this.startStage(0, { newRun: true });

        this.triggerFade('in', 500);
        this.isTransitioning = false;
    }

    /**
     * 特定のステージを開始/リトライする (ENTRY POINT)
     * @param {number} stageIndex ステージ番号(0-indexed)
     * @param {Object} opts オプションフラグ
     */
    async startStage(stageIndex, opts = {}) {
        // startNewRun から呼ばれる場合は、既にフェードアウト等の処理が外側で行われている
        const internal = opts.newRun || opts.retry || opts.next;

        if (!internal) {
            if (this.isTransitioning) return;
            this.isTransitioning = true;
            await this.triggerFade('out', 500);
        }

        this.currentStage = stageIndex;
        this.resetAttemptState();

        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) titleScreen.classList.add('hidden');

        this.startCountdown();

        if (!internal) {
            this.triggerFade('in', 500);
            this.isTransitioning = false;
        }
    }

    /**
     * タイトル画面へ戻る (ENTRY POINT)
     */
    async goToTitle() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        await this.triggerFade('out', 500);

        this.resetAttemptState();
        this.switchState(CONSTANTS.STATE.TITLE);

        await this.triggerFade('in', 500);
        this.isTransitioning = false;
    }

    startWave() {
        // ステージに応じたBGM再生 (SSOT)
        const stageNum = this.currentStage + 1;
        const bgmKey = CONSTANTS.BGM_MAPPING[stageNum];
        if (bgmKey) {
            this.audio.playBgm(bgmKey);
        }

        // Debug Stage Check
        this.isDebugStage = (this.currentStage === CONSTANTS.STAGE_DEBUG);

        let stageData;
        if (this.isDebugStage) {
            // Mock Stage Data for Debug
            stageData = {
                enemyCount: 9999, // Infinite
                spawnMul: 1.0,
                hpMul: 1.0,
                speedMul: 1.0
            };
            // Default Debug Values
            if (this.debugTargetType === undefined) this.debugTargetType = CONSTANTS.ENEMY_TYPES.NORMAL;
            if (this.debugTargetType2 === undefined) this.debugTargetType2 = 'NONE';
            if (this.debugSpawnCount === undefined) this.debugSpawnCount = 1;
            if (this.debugSpeedMul === undefined) this.debugSpeedMul = 1.0;
            if (this.debugHpMul === undefined) this.debugHpMul = 1.0;
            if (this.debugShowHitbox === undefined) this.debugShowHitbox = false;
            if (this.debugShowKnockback === undefined) this.debugShowKnockback = false;
            this.debugSpawnQueue = []; // [NEW] デバッグ用スポーン要求キュー
            if (this.debugShowVector === undefined) this.debugShowVector = false;
            if (this.debugFormation === undefined) this.debugFormation = 'NONE'; // Ensure it's initialized for debug stage
        } else {
            stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        }

        // resetAttemptState で既に行われているリセットは省略し、
        // 実際の波のパラメータセットのみ行う
        this.enemiesRemaining = Math.round(stageData.enemyCount * stageData.spawnMul);

        if (!this.isDebugStage && (this.currentStage + 1) % 5 === 0) {
            this.enemiesRemaining = 1; // ボス撃破＝クリア。recordSpawnで-1されるため1開始
            this.spawnBoss();
        }

        // セクタの初期化
        this.sectors = [{
            centerDeg: Math.random() * 360,
            timer: CONSTANTS.SPAWN_SECTOR_DURATION_MS
        }];
        this.spawnPhase = 'BURST';
        this.phaseTimer = CONSTANTS.SPAWN_BURST_TIME_MS;
        this.spawnQueue = 0;
        this.currentSpawnBudget = CONSTANTS.SPAWN_BUDGET_PER_SEC;

        this.gameState = CONSTANTS.STATE.PLAYING;

        // ランニングスタッツの初期化
        this.runStats = {
            startTime: Date.now(),
            endTime: 0,
            damageTaken: 0,
            itemUsed: 0
        };

        // UI表示の更新
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        const controls = document.getElementById('controls');
        if (controls) controls.classList.remove('hidden');
        if (DEBUG_ENABLED) {
            this.setupDebugMenu();
        }

        this.updateUI();
    }

    recordDamage() {
        if (this.runStats) {
            this.runStats.damageTaken++;
        }
        this.runTotalDamageTaken++;
    }

    recordItemUse() {
        if (this.runStats) {
            this.runStats.itemUsed++;
        }
        this.runTotalItemsUsed++;
    }

    calculateRank() {
        const stats = this.runStats;
        const stage = this.currentStage + 1; // 1-indexed

        // タイム計測 (秒)
        // タイム計測 (秒)
        // const durationMs = stats.endTime - stats.startTime; // OLD (Real Time)
        const durationMs = this.stageGameTime || 0; // NEW (Game Time)
        const durationSec = durationMs / 1000;

        // ターゲットタイム
        const targetSec = CONSTANTS.STAGE_TARGET_TIME_SEC[stage] || CONSTANTS.DEFAULT_TARGET_TIME_SEC;
        const overtimeSec = Math.max(0, durationSec - targetSec);

        // スコア計算
        let score = CONSTANTS.RANK_RULES.baseScore;
        score -= CONSTANTS.RANK_RULES.penalty.hit * stats.damageTaken;
        score -= CONSTANTS.RANK_RULES.penalty.item * stats.itemUsed;
        score -= CONSTANTS.RANK_RULES.penalty.overtimePerSec * overtimeSec;

        // 0-100にクランプ
        score = Math.max(0, Math.min(100, Math.floor(score)));

        // ランク判定
        let rank = "F";
        for (const r of CONSTANTS.RANK_RULES.thresholds) {
            if (score >= r.minScore) {
                rank = r.rank;
                break;
            }
        }

        return {
            rank,
            score,
            time: durationMs,
            damage: stats.damageTaken,
            item: stats.itemUsed,
            kills: this.killCount,
            gold: this.stageGoldEarned
        };
    }

    calculateTotalRank() {
        // トータルタイム計算 (現在の進行中のステージ分を加算)
        // トータルタイム計算 (現在の進行中のステージ分を加算)
        // const now = Date.now();
        // const currentStageDuration = this.runStats ? (now - this.runStats.startTime) : 0;
        // const totalDurationMs = this.runTotalTimeMs + currentStageDuration;

        // NEW: Game Time Base
        const currentStageDuration = this.stageGameTime || 0;
        const totalDurationMs = this.runTotalGameTime + currentStageDuration;

        // 目標タイムの合計 (到達したステージまで)
        let totalTargetSec = 0;
        for (let i = 1; i <= (this.currentStage + 1); i++) {
            totalTargetSec += CONSTANTS.STAGE_TARGET_TIME_SEC[i] || CONSTANTS.DEFAULT_TARGET_TIME_SEC;
        }

        const totalDurationSec = totalDurationMs / 1000;
        const overtimeSec = Math.max(0, totalDurationSec - totalTargetSec);

        // スコア計算 (トータルスタッツを使用)
        let score = CONSTANTS.RANK_RULES.baseScore;
        score -= CONSTANTS.RANK_RULES.penalty.hit * this.runTotalDamageTaken;
        score -= CONSTANTS.RANK_RULES.penalty.item * this.runTotalItemsUsed;
        score -= CONSTANTS.RANK_RULES.penalty.overtimePerSec * overtimeSec;

        score = Math.max(0, Math.min(100, Math.floor(score)));

        let rank = "F";
        for (const r of CONSTANTS.RANK_RULES.thresholds) {
            if (score >= r.minScore) {
                rank = r.rank;
                break;
            }
        }

        return {
            rank,
            score,
            time: totalDurationMs,
            damage: this.runTotalDamageTaken,
            item: this.runTotalItemsUsed,
            kills: this.totalKills,
            gold: this.totalGoldEarned
        };
    }

    saveStageRecord(stage, result) {
        const key = `zerodist_stage_${stage}`;
        const currentBest = JSON.parse(localStorage.getItem(key));

        // ランクの強さ比較用インデックス (小さいほど強い)
        const rankIndex = (r) => CONSTANTS.RANK_RULES.thresholds.findIndex(t => t.rank === r);
        const currentRankIdx = currentBest ? rankIndex(currentBest.rank) : 999;
        const newRankIdx = rankIndex(result.rank);

        let isBest = false;
        // ランクが高い、またはランク同じでスコアが高い、またはスコア同じでタイムが早いなら更新
        if (!currentBest ||
            newRankIdx < currentRankIdx ||
            (newRankIdx === currentRankIdx && result.score > currentBest.score) ||
            (newRankIdx === currentRankIdx && result.score === currentBest.score && result.time < currentBest.time)) {

            localStorage.setItem(key, JSON.stringify(result));
            isBest = true;
        }

        return { isBest, best: isBest ? result : currentBest };
    }

    startNextWave() {
        this.startStage(this.currentStage + 1, { next: true });
    }

    startCountdown() {
        // デバッグステージの場合はカウントダウンなしで即開始
        if (DEBUG_ENABLED && this.currentStage === CONSTANTS.STAGE_DEBUG) {
            const hud = document.getElementById('hud');
            if (hud) hud.classList.remove('hidden');
            const controls = document.getElementById('controls');
            if (controls) controls.classList.remove('hidden');
            this.startWave();
            return;
        }

        this.gameState = CONSTANTS.STATE.COUNTDOWN;
        const overlay = document.getElementById('countdown');
        const text = document.getElementById('countdown-text');
        const sub = document.getElementById('countdown-sub');

        sub.textContent = `STAGE ${this.currentStage + 1}`;
        sub.classList.remove('ani-slide-right');
        text.classList.remove('ani-slide-left');
        overlay.classList.remove('hidden');

        // 初期状態で非表示にしているので、カウントダウン開始時に表示する
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        const controls = document.getElementById('controls');
        if (controls) controls.classList.remove('hidden');

        let count = 3;
        const process = () => {
            if (count > 0) {
                this.audio.playSe('SE_COUNTDOWN_PI');
                text.textContent = count;
                count--;
                setTimeout(process, 1000);
            } else if (count === 0) {
                this.audio.playSe('SE_COUNTDOWN_PEEN');
                text.textContent = "START!";

                // スライド演出の適用
                sub.classList.add('ani-slide-right');
                text.classList.add('ani-slide-left');

                count--;
                setTimeout(process, 1000);
            } else {
                overlay.classList.add('hidden');
                sub.classList.remove('ani-slide-right');
                text.classList.remove('ani-slide-left');
                this.startWave();
            }
        };
        process();
    }

    stageClear() {
        if (this.isClearing) return;
        this.isClearing = true;

        // ボスHPバーを即座に隠す
        const bossHpContainer = document.getElementById('boss-hp-container');
        if (bossHpContainer) bossHpContainer.classList.add('hidden');

        // Stage Clear Logic

        // クリア時にダメージ演出を即解除 (遷移先で点滅し続けないように)
        if (this.player) {
            this.player.damageFlashTimer = 0;
            const hpFill = document.getElementById('hp-bar-fill');
            const hpContainer = document.querySelector('.hp-container');
            if (hpFill) hpFill.classList.remove('damage');
            if (hpContainer) hpContainer.classList.remove('damage');
        }

        // 安全策: runStats がない場合（途中更新など）の初期化
        if (!this.runStats) {
            this.runStats = {
                startTime: Date.now() - 60000, // 仮: 1分前
                endTime: Date.now(),
                damageTaken: 0,
                itemUsed: 0
            };
        }
        this.runStats.endTime = Date.now();
        this.runTotalTimeMs += (this.runStats.endTime - this.runStats.startTime);
        this.runTotalGameTime += this.stageGameTime; // [NEW] ゲーム時間の累積更新

        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.bullets.forEach(b => this.bulletPool.release(b)); // 弾も消す
        this.bullets = [];

        const result = this.calculateRank(); // ステージ単体の評価
        const saved = this.saveStageRecord(this.currentStage + 1, result);

        // 最終的な表示用はトータル評価
        this.lastResult = { ...this.calculateTotalRank(), isBest: saved.isBest };

        // 最終ステージクリア時のみリザルト画面へ
        const isFinalStage = this.currentStage >= CONSTANTS.STAGE_DATA.length - 1;

        if (isFinalStage) {
            // 統一されたオーバーレイを使用
            this.showOverlay('GAME CLEAR', '全ステージクリア！', 'result');
        } else {
            // 中間ステージはカットイン後に次へ
            this.gameState = CONSTANTS.STATE.WAVE_CLEAR_CUTIN;
            this.showCutIn(`STAGE ${this.currentStage + 1} CLEAR!`, () => {
                this.isClearing = false;
                this.startNextWave();
            });
        }
    }

    showCutIn(msg, callback) {
        const overlay = document.getElementById('cut-in');
        const text = document.getElementById('cut-in-text');
        text.textContent = msg;
        overlay.classList.remove('hidden');

        setTimeout(() => {
            overlay.classList.add('hidden');
            if (callback) callback();
        }, 2000);
    }

    showOverlay(title, msg, type = 'wave') {
        const overlay = document.getElementById('overlay');
        const statsArea = document.getElementById('result-stats');

        overlay.classList.remove('hidden');
        document.getElementById('overlay-title').textContent = title;
        document.getElementById('overlay-msg').textContent = msg;

        if (this.audio) {
            if (title === 'GAME OVER') {
                this.audio.playSe('SE_GAME_OVER', { priority: 'high' });
            } else if (type === 'wave') {
                this.audio.playSe('SE_BARRIER_02', { priority: 'high' });
            }
        }

        if (type === 'result') {
            this.gameState = CONSTANTS.STATE.RESULT;

            // ランク計算を実行して lastResult に格納（ゲームオーバー時もランクを表示するため）
            if (!this.runStats) {
                this.runStats = {
                    startTime: Date.now() - 60000,
                    endTime: Date.now(),
                    damageTaken: 0,
                    itemUsed: 0
                };
            }
            this.runStats.endTime = Date.now();
            const totalResult = this.calculateTotalRank();
            // ゲームオーバー時は記録保存しない（クリアではないため）が、表示用にlastResultは必要
            // ただしハイスコア更新判定もしない
            this.lastResult = { ...totalResult, isBest: false };

            statsArea.classList.remove('hidden');
            document.getElementById('stat-kills').textContent = totalResult.kills;
            document.getElementById('stat-gold').textContent = totalResult.gold;
            document.getElementById('stat-stage').textContent = `STAGE ${this.currentStage + 1}`;

            // ランク表示の更新
            const rankEl = document.getElementById('stat-rank');
            if (rankEl) {
                rankEl.textContent = totalResult.rank;
                // ランクに応じた色設定
                let color = '#fff';
                if (totalResult.rank === 'SSS') color = '#ffed00';
                else if (totalResult.rank.startsWith('S')) color = '#ffaa00';
                else if (totalResult.rank.startsWith('A')) color = '#ff44aa';
                else if (totalResult.rank === 'B') color = '#4488ff';
                else if (totalResult.rank === 'C') color = '#44ff88';
                rankEl.style.color = color;
                rankEl.style.textShadow = `0 0 10px ${color}`;
            }

            // 新規: TIME, DAMAGE, ITEM の表示 (トータルを表示)
            const timeEl = document.getElementById('stat-time');
            // if (timeEl) timeEl.textContent = (totalResult.time / 1000).toFixed(2);
            if (timeEl) timeEl.textContent = this.formatTimeMMSS(totalResult.time);
            const damageEl = document.getElementById('stat-damage');
            if (damageEl) damageEl.textContent = totalResult.damage;
            const itemEl = document.getElementById('stat-item');
            if (itemEl) itemEl.textContent = totalResult.item;

            // HUD等を隠す
            document.getElementById('hud').classList.add('hidden');
            document.getElementById('controls').classList.add('hidden');

            // ボタンステートの更新
            const btnNext = document.getElementById('btn-next');
            const btnRetry = document.getElementById('btn-retry');
            const btnTitle = document.getElementById('btn-title');

            const isNextAvailable = this.gameState !== CONSTANTS.STATE.GAME_OVER && (this.currentStage + 1 < CONSTANTS.STAGE_DATA.length);

            if (btnNext) btnNext.classList.toggle('hidden', !isNextAvailable);
            if (btnRetry) {
                btnRetry.textContent = `RETRY`;
                btnRetry.classList.remove('hidden');
            }
            if (btnTitle) btnTitle.classList.remove('hidden');

            this.lastResult.stageIndex = this.currentStage;
        }
    }

    /**
     * 合計ゲーム経過時間 (ms) を取得。シミュレーションと実プレイの両方で共通して使用する。
     */
    getTime() {
        // ステージ経過時間 + ステージ開始前の累積時間を返す
        return this.runTotalGameTime + (this.stageGameTime || 0);
    }



    spawnBoss() {
        const x = CONSTANTS.TARGET_WIDTH / 2;
        const y = -150;

        const boss = this.spawnDirector.spawnEnemy({
            type: CONSTANTS.ENEMY_TYPES.BOSS,
            x: x,
            y: y,
            options: {
                isBoss: true,
                bossIndex: this.currentStage,
                movementMode: (this.currentStage === 9) ? 'DIRECT' : undefined,
                onSummon: (bx, by) => this.handleBossSummon(bx, by)
            }
        });

        if (boss) {
            this.bossSpawned = true;
        }
    }

    handleBossSummon(bx, by, boss) {
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT - CONSTANTS.BOSS_SUMMON_COUNT) return;

        if (boss && (boss.bossIndex === 4 || boss.bossIndex === 9)) {
            const minionCount = this.enemies.filter(e => e.isMinion && !e.isMissile && e.active).length;
            if (minionCount >= CONSTANTS.BOSS_STAGE5_SUMMON_MAX_MINIONS) return;
        }

        const stageData = CONSTANTS.STAGE_DATA[this.currentStage] || { hpMul: 1.0, speedMul: 1.0 };
        for (let i = 0; i < CONSTANTS.BOSS_SUMMON_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 120 + Math.random() * 60;
            const sx = bx + Math.cos(angle) * dist;
            const sy = by + Math.sin(angle) * dist;

            this.spawnDirector.spawnEnemy({
                type: CONSTANTS.ENEMY_TYPES.NORMAL,
                x: sx,
                y: sy,
                options: {
                    isMinion: true,
                    hpMul: stageData.hpMul * 0.5,
                    speedMul: stageData.speedMul
                }
            });
        }
    }

    spawnPlasmaDrone(boss) {
        const droneCount = this.enemies.filter(e => e.isDrone && e.active && e.ownerId === boss.id).length;
        if (droneCount >= CONSTANTS.PLASMA_DRONE_STAGE5.maxActive) return false;

        const drone = this.spawnDirector.spawnEnemy({
            type: CONSTANTS.ENEMY_TYPES.PLASMA_DRONE_STAGE5,
            x: boss.x,
            y: boss.y - 40,
            options: {
                isDrone: true,
                ownerId: boss.bossIndex // bossIndex/owner
            }
        });

        if (drone) {
            this.audio.playSe('SE_SHOT_LASER', { variation: 0.5, pitch: 0.5 });
            return true;
        }
        return false;
    }

    spawnRimLaser(boss) {
        const rimCfg = (this.currentStage >= 10) ? CONSTANTS.RIM_LASER_STAGE10 : CONSTANTS.RIM_LASER_STAGE5;
        const rimCount = this.enemies.filter(e => e.isRimLaser)
            .filter(e => e.active && e.ownerId === boss.id).length;
        if (rimCount >= rimCfg.maxActive) return false;

        const rim = this.spawnDirector.spawnEnemy({
            type: CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5,
            x: boss.x,
            y: boss.y,
            options: {
                isRimLaser: true,
                ownerId: boss.bossIndex // bossIndex/owner
            }
        });

        if (rim) {
            this.audio.playSe('SE_SHOT_LASER', { variation: 0.3, pitch: 1.2 });
            return true;
        }
        return false;
    }

    /**
     * レーザー（PIERCE）のレベル別チューニングを取得
     */
    getLaserTuning(lv) {
        const t = {
            widthMul: 1.0,
            burstFrames: 0,
            burstDamageMul: 1.0
        };

        // Lv10-19: 幅 +10%
        if (lv >= 10) t.widthMul = 1.10;

        // Lv20-29: 貫通減衰なし (現状も無しなので維持)

        // Lv30: 撃ち始め 0.2秒間 高出力
        if (lv >= 30) {
            t.burstFrames = 12;      // 0.2秒相当 (60fps想定)
            t.burstDamageMul = 1.5;  // ダメージ ×1.5
        }

        return t;
    }

    shoot() {
        if (this.bullets.length >= CONSTANTS.BULLET_LIMIT) return;
        const weaponType = this.player.currentWeapon;
        const stats = this.player.getWeaponStats();
        const level = this.player.getWeaponLevel();
        const stage = getStageByLevel(level);
        const tintColor = getTintForWeapon(weaponType, level);

        // 見た目だけの微差
        const visualScale = (stage === 1) ? 1.00 : (stage === 2) ? 1.08 : (stage === 3) ? 1.16 : 1.22;
        const flashFrames = (level >= 30) ? 5 : 0;

        const extraStats = {
            ...stats,
            tintColor,
            visualScale,
            flashFrames,
            level
        };

        if (weaponType === CONSTANTS.WEAPON_TYPES.SHOT) {
            const count = (level >= 30) ? 4 : 3;
            const spread = stats.shotAngle || 0.2;
            const startAngle = this.player.angle - (spread * (count - 1) / 2);

            for (let i = 0; i < count; i++) {
                if (this.bullets.length < CONSTANTS.BULLET_LIMIT) {
                    const b = this.bulletPool.get();
                    const angle = startAngle + spread * i;
                    b.init(this.player.x, this.player.y, angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, extraStats);
                    this.bullets.push(b);
                }
            }
        } else if (weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) {
            // レーザーの進化チューニング
            const tune = this.getLaserTuning(level);

            // レベルに応じた反射回数の計算 (Lv10:1, Lv20:2, Lv30:3)
            let maxBounces = 0;
            if (level >= 30) maxBounces = 3;
            else if (level >= 20) maxBounces = 2;
            else if (level >= 10) maxBounces = 1;

            const laserExtra = {
                ...extraStats,
                bulletWidth: (extraStats.bulletWidth || 1.0) * tune.widthMul,
                hitWidth: (extraStats.hitWidth || 1.0) * tune.widthMul,
                burstFrames: tune.burstFrames,
                burstDamageMul: tune.burstDamageMul,
                maxBounces: maxBounces
            };

            const b = this.bulletPool.get();
            b.init(this.player.x, this.player.y, this.player.angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, laserExtra);
            this.bullets.push(b);
        } else {
            // STANDARD / RIFLE
            const b = this.bulletPool.get();
            if (b) {
                b.init(this.player.x, this.player.y, this.player.angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, extraStats);
                this.bullets.push(b);
            }
        }

        // Determines SE by weapon type
        let seKey = 'SE_SHOT_RIFLE';
        if (weaponType === CONSTANTS.WEAPON_TYPES.SHOT) {
            seKey = 'SE_SHOT_SHOTGUN';
        } else if (weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) {
            seKey = (level >= 30) ? 'SE_SHOT_LASER_MAX' : 'SE_SHOT_LASER';
        } else if (weaponType === CONSTANTS.WEAPON_TYPES.STANDARD) {
            seKey = (level >= 30) ? 'SE_SHOT_RIFLE_MAX' : 'SE_SHOT_RIFLE';
        }

        this.audio.playSe(seKey, { variation: 0.1, priority: 'low' });
    }

    /**
     * ショットガンのヒット時爆発処理
     */
    applyShotgunExplosion(x, y, baseDamage, level) {
        let radius = 0;
        let ratio = 0;
        let maxHits = 0;

        if (level >= 30) {
            radius = 70;
            ratio = 1.0;
            maxHits = 3;
        } else if (level >= 20) {
            radius = 60;
            ratio = 0.5;
            maxHits = 3;
        } else if (level >= 10) {
            radius = 40;
            ratio = 0.3;
            maxHits = 2;
        } else {
            return;
        }

        // 視覚エフェクト
        Effects.createShotgunExplosion(x, y, radius, level >= 30);

        const candidates = this.grid.queryCircle(x, y, radius);
        let hitCount = 0;

        const globalMarkActive = this.globalMarkTimer > 0;

        for (const enemy of candidates) {
            if (!enemy.active || enemy.hp <= 0) continue;
            if (hitCount >= maxHits) break;

            const dx = enemy.x - x;
            const dy = enemy.y - y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= radius * radius) {
                const damage = baseDamage * ratio;
                enemy.takeDamage(damage, {
                    globalBuffActive: globalMarkActive,
                    isAuraProtected: enemy.isShielded
                });

                // [REQ] SE再生
                if (this.audio) {
                    const isExplosionReflected = (enemy.type === CONSTANTS.ENEMY_TYPES.REFLECTOR && enemy.isReflecting(x, y));
                    if (enemy.isShielded || this.guardianBuffActive || isExplosionReflected) {
                        this.audio.playSe('SE_GUARD_HIT_01', { variation: 0.1, volume: 0.4 });
                    } else if (enemy.hp > 0) {
                        this.audio.playSe('SE_BREAK_SPECIAL', { variation: 0.1, volume: 0.4 });
                    }
                }

                if (enemy.hp <= 0) {
                    enemy.destroy('explosion', this);
                }
                hitCount++;
            }
        }
    }

    /**
     * 近くの敵を探索（跳弾用）
     */
    findNearestEnemy(excludeSet, x, y, radius) {
        const candidates = this.grid.queryCircle(x, y, radius);
        let best = null;
        let bestDistSq = radius * radius;

        for (const e of candidates) {
            if (!e.active || e.hp <= 0) continue;
            if (excludeSet.has(e)) continue;

            const dx = e.x - x;
            const dy = e.y - y;
            const distSq = dx * dx + dy * dy;

            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = e;
            }
        }
        return best;
    }

    /**
     * 跳弾弾の生成
     */
    spawnRicochetBullet(fromX, fromY, targetEnemy, damage, speed, remainingRicochets, ricochetExcludes, weaponType, baseExtra, parentRicochetCount = 0) {
        const dx = targetEnemy.x - fromX;
        const dy = targetEnemy.y - fromY;
        const angle = Math.atan2(dy, dx);

        const b = this.bulletPool.get();

        // 跳弾用の見た目調整（わずかに発光を強める）
        const extra = {
            ...baseExtra,
            remainingRicochets: remainingRicochets - 1,
            ricochetExcludes: new Set(ricochetExcludes),
            isRicochet: true,
            ricochetCount: parentRicochetCount + 1
        };
        extra.flashFrames = 2;

        // 跳弾はわずかに彩度/輝度を上げる演出
        if (extra.tintColor) {
            // 色味を少し明るく（簡易的にalphaを上げるなどで代用可能な構造か確認が必要だが、一旦そのまま）
        }

        b.init(fromX, fromY, angle, speed, damage, 0, CONSTANTS.BULLET_LIFETIME_MS, weaponType, extra);
        this.bullets.push(b);

        // 跳弾発生時の軌跡エフェクト（始点から終点へ向かって短い火花 + 一瞬の線）
        Effects.list.push({
            type: 'line',
            x: fromX, y: fromY,
            tx: targetEnemy.x, ty: targetEnemy.y,
            life: 0.15, maxLife: 0.15,
            color: extra.tintColor || 'rgba(255, 255, 255, 0.5)',
            width: 2,
            composite: 'lighter'
        });

        for (let i = 0; i < 3; i++) {
            const ratio = i / 3;
            // ターゲット方向へ少し火花を飛ばす
            const px = fromX + (targetEnemy.x - fromX) * ratio * 0.2;
            const py = fromY + (targetEnemy.y - fromY) * ratio * 0.2;
            Effects.createSpark(px, py, extra.tintColor || '#fff');
        }
        Effects.createRing(fromX, fromY, extra.tintColor || '#fff');
    }

    spawnDamageText(x, y, text, color) {
        if (!CONSTANTS.SHOW_DAMAGE_NUMBERS) return;
        if (this.damageTexts.length < CONSTANTS.DAMAGE_TEXT_LIMIT) {
            const dt = this.damageTextPool.get();
            // 複数ヒット時に重ならないよう微小なオフセットを加える
            const ox = (Math.random() - 0.5) * 20;
            const oy = (Math.random() - 0.5) * 20;
            dt.init(x + ox, y + oy, text, color);
            this.damageTexts.push(dt);
        }
    }

    update(dt) {
        if (this.isPaused) return;
        this.optimizationFrameCount++;

        // ゴールドカウンターのアニメーション
        if (this.displayGoldCount < this.goldCount) {
            // 1桁ずつ増えるような演出（差分の一定割合か、最低1ずつ増やす）
            const diff = this.goldCount - this.displayGoldCount;
            const speed = Math.max(1, Math.ceil(diff * 0.15));
            this.displayGoldCount = Math.min(this.goldCount, this.displayGoldCount + speed);
        } else if (this.displayGoldCount > this.goldCount) {
            // 減少時（アップグレード時など）は即座、または高速に更新
            this.displayGoldCount = this.goldCount;
        }

        if (this.gameState === CONSTANTS.STATE.TITLE || this.gameState === CONSTANTS.STATE.COUNTDOWN || this.gameState === CONSTANTS.STATE.RESULT) return;

        // 1. フレームデータのキャッシュ構築
        Profiler.start('frame_cache');
        this.frameCache.update(this.enemies, this.globalMarkTimer);
        Profiler.end('frame_cache');

        const activeEnemies = this.frameCache.enemiesAlive;
        const activeCount = activeEnemies.length;

        // グリッド構築
        Profiler.start('grid_build');
        this.grid.build(activeEnemies);
        Profiler.end('grid_build');

        // シールド判定のキャッシュ更新 (50ms毎) [OPTIMIZED]
        this.shieldCacheTimer = (this.shieldCacheTimer || 0) + dt;
        if (this.shieldCacheTimer >= 50) {
            this.shieldCacheTimer = 0;
            // シールド持ちがいない or シールドゾーンがない場合はスキップ
            const hasShielders = this.enemies.some(e => e.type === CONSTANTS.ENEMY_TYPES.SHIELDER && e.active);
            if (hasShielders || this.shieldZones.length > 0) {
                Profiler.start('shield_update');
                this.updateShieldCache();
                Profiler.end('shield_update');
            }
        }

        // アイテム更新
        this.itemManager.update(dt);

        // フリーズ（スロウ）時間の管理
        if (this.freezeTimer > 0) {
            this.freezeTimer -= dt;
        }

        // 画面シェイクの更新
        if (this.screenShakeTimer > 0) {
            this.screenShakeTimer = Math.max(0, this.screenShakeTimer - dt);
        }

        // エフェクト更新
        Effects.update(dt);

        // ゴールド更新・回収：常に実行（CLEAR状態でも回収を継続）
        this.updateGolds(dt);

        if (this.gameState === CONSTANTS.STATE.WAVE_CLEAR_CUTIN) {
            this.player.update(dt);
            const { scale, offsetX, offsetY } = this.getRenderTransform();
            const bounds = {
                xMin: -offsetX / scale,
                xMax: (this.canvas.width - offsetX) / scale,
                yMin: -offsetY / scale,
                yMax: (this.canvas.height - offsetY) / scale
            };
            this.bullets.forEach(b => b.update(this.enemies, this.grid, this.player.targetX, this.player.targetY, bounds));
            this.damageTexts.forEach(d => d.update());
            this.cleanupEntities();
            return;
        }

        if (this.gameState !== CONSTANTS.STATE.PLAYING) return;

        if (this.globalMarkTimer > 0) this.globalMarkTimer -= dt;

        // [NEW] ゲーム内時間の加算 (Time Scaleの影響を受けたdtを加算することで、実質x1換算の時間になる)
        this.stageGameTime += dt;
        this.runTotalGameTime += dt;

        Profiler.start('player_update');
        this.player.update(dt);
        this.player.shootTimer += dt;
        const weaponStats = this.player.getWeaponStats();
        if (this.player.shootTimer >= weaponStats.cooldown) {
            this.shoot();
            this.player.shootTimer = 0;
        }
        Profiler.end('player_update');

        const isBossStage = (this.currentStage + 1) % 5 === 0;
        const hasBoss = this.enemies.some(e => e.isBoss);

        Profiler.start('spawning');
        // SpawnDirector による管理 (ボスステージ以外)
        // [FIX] 二重呼び出し排除。update(dt)内はこの1箇所のみ。
        if (!isBossStage && this.spawnDirector) {
            this.spawnDirector.update(dt);
        }
        Profiler.end('spawning');

        // アトラクターバフ集計（敵更新の直前に実行）
        this.updateAttractorBuffs();

        const { hasGuardian, hasMark } = this.frameCache.buffFlags;

        Profiler.start('bullet_update');
        const { scale, offsetX, offsetY } = this.getRenderTransform();
        const bounds = {
            xMin: -offsetX / scale,
            xMax: (this.canvas.width - offsetX) / scale,
            yMin: -offsetY / scale,
            yMax: (this.canvas.height - offsetY) / scale
        };
        this.bullets.forEach(b => b.update(activeEnemies, this.grid, this.player.targetX, this.player.targetY, bounds));
        Profiler.end('bullet_update');

        const totalRemaining = activeCount + this.enemiesRemaining;

        // 全てのスポーンが終了し、かつ画面上に EVASIVE しかいないかチェック
        const onlyEvasiveLeft = this.enemiesRemaining <= 0 &&
            activeCount > 0 &&
            activeEnemies.every(e => e.type === CONSTANTS.ENEMY_TYPES.EVASIVE);

        // スポーン制御 (SpawnDirector)
        if (this.spawnDirector) {
            this.spawnDirector.update(dt);
        } else {
            // Legacy Spawner fallback (disabled)
            // this.updateSpawner(dt); 
        }

        Profiler.start('enemy_update');
        for (let i = 0; i < activeCount; i++) {
            const e = activeEnemies[i];
            e.update(this.player.x, this.player.y, this.player.angle, dt, {
                globalGuardBuffActive: hasGuardian,
                globalMarkActive: hasMark,
                isFrozen: this.freezeTimer > 0,
                totalRemaining: totalRemaining,
                onlyEvasiveLeft: onlyEvasiveLeft,
                allEnemies: activeEnemies,
                frameCount: this.optimizationFrameCount,
                spawnPlasmaDrone: (boss) => this.spawnPlasmaDrone(boss),
                spawnRimLaser: (boss) => this.spawnRimLaser(boss)
            });
            if (e.didMark) {
                this.globalMarkTimer = Math.max(this.globalMarkTimer, CONSTANTS.OBSERVER.globalBuffDurationMs);
                e.didMark = false;
            }
        }
        Profiler.end('enemy_update');

        // システム統計ログ (約1秒に1回)
        if (this.optimizationFrameCount % 60 === 0) {
            const { scale, offsetX, offsetY, viewW, viewH } = this.getRenderTransform();
            const inViewCount = this.enemies.filter(e => {
                if (!e.active) return false;
                const sx = e.x * scale + offsetX;
                const sy = e.y * scale + offsetY;
                return sx >= 0 && sx <= viewW && sy >= 0 && sy <= viewH;
            }).length;
            if (this.debugEnabled) {
                // console.log(`[BATTLE STATE] Total:${this.enemies.length}, InView:${inViewCount}, Remaining:${this.enemiesRemaining}, Kills:${this.killCount}`);
            }
        }

        // 敵同士の緩やかな斥力 (重なりすぎ防止)
        // 負荷軽減：100ms毎に実行 [OPTIMIZED]
        this.repulsionTimer = (this.repulsionTimer || 0) + dt;
        if (this.repulsionTimer >= 100) {
            this.repulsionTimer = 0;
            Profiler.start('enemy_repulsion');
            const activeEnemies = this.frameCache.enemiesAlive || this.enemies.filter(e => e.active);
            const r = CONSTANTS.ENEMY_SIZE * 0.8;
            const rSq = r * r;

            const MAX_REPULSION = 1.5;
            for (let i = 0; i < activeEnemies.length; i++) {
                const e = activeEnemies[i];
                if (e.isBoss || e.age < 0.5) continue; // ボスとスポーン直後は斥力無効

                const candidates = this.grid.queryCircle(e.x, e.y, CONSTANTS.ENEMY_SIZE * 1.5);
                let sumX = 0;
                let sumY = 0;

                for (let j = 0; j < candidates.length; j++) {
                    const other = candidates[j];
                    if (e === other || !other.active || other.isBoss) continue;

                    const dx = other.x - e.x;
                    const dy = other.y - e.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < rSq && distSq > 0.001) {
                        const dist = Math.sqrt(distSq);
                        const push = (r - dist) * 0.05;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        sumX -= nx * push;
                        sumY -= ny * push;
                    }
                }

                // 合計移動量（斥力）にキャップをかける
                const mag = Math.sqrt(sumX * sumX + sumY * sumY);
                if (mag > MAX_REPULSION) {
                    sumX = (sumX / mag) * MAX_REPULSION;
                    sumY = (sumY / mag) * MAX_REPULSION;
                }

                e.x += sumX;
                e.y += sumY;
            }
        }
        Profiler.end('enemy_repulsion');

        // ゴールド更新は updateGolds(dt) で一括処理されるため、ここでの明示的な呼び出しは削除
        // this.golds.forEach(g => g.update(goldTargetX, goldTargetY));
        this.damageTexts.forEach(d => d.update());

        // パルスCDとエフェクト更新 (多層対応)
        if (this.pulseCooldownTimer > 0) {
            this.pulseCooldownTimer = Math.max(0, this.pulseCooldownTimer - dt);
        }
        for (let i = this.pulseEffects.length - 1; i >= 0; i--) {
            const fx = this.pulseEffects[i];
            fx.radius += dt * (fx.speed || 0.5);
            fx.alpha -= dt * (fx.fadeSpeed || 0.002);
            if (fx.alpha <= 0) this.pulseEffects.splice(i, 1);
        }

        // --- ShieldZones Update ---
        for (let i = this.shieldZones.length - 1; i >= 0; i--) {
            const sz = this.shieldZones[i];
            sz.timer -= dt;
            if (sz.timer <= 0) {
                this.shieldZones.splice(i, 1);
            }
        }

        Profiler.start('collision');
        this.handleCollisions(dt);
        Profiler.end('collision');

        Profiler.start('cleanup');
        this.cleanupEntities();
        Profiler.end('cleanup');

        if (isBossStage) {
            // ボスステージではボスが死んでいれば handleCollisions 内で stageClear が呼ばれる
        } else {
            // ステージ終了判定：未出現数が0 かつ 画面上の敵が0 かつ ゴールド回収完了 [FIX]
            if (this.enemiesRemaining === 0 && this.enemies.length === 0 && this.golds.length === 0) {
                this.stageClear();
            }
        }

        if (this.player.hp <= 0) {
            this.showOverlay('GAME OVER', '基地が破壊されました', 'result');
        }

        // ステージクリア判定: 未出現数が0 かつ 画面上の敵が0 かつ ゴールド回収完了 [FIX]
        if (this.enemiesRemaining === 0 && this.enemies.length === 0 && this.golds.length === 0) {
            if (this.gameState === CONSTANTS.STATE.PLAYING && !isBossStage) {
                this.stageClear();
            }
        }

        this.updateUI();
    }

    handleCollisions(dt) {
        // SpatialGrid を利用した最適化した衝突判定
        const { hasGuardian, hasMark } = this.frameCache.buffFlags;
        const globalBuffActive = hasGuardian || hasMark;
        const barrierPairs = this.frameCache.barrierPairs;

        // 弾 vs 敵
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active) continue;

            // 1) 敵本体との衝突判定 (優先)
            // クエリ半径を拡大 (64px) して、通常敵やエリート敵を確実にカバーする
            const queryRadius = 64;
            const candidates = this.grid.queryCircle(b.x, b.y, queryRadius);

            // 巨大なボス（半径150px以上）がクエリ範囲外になる可能性があるため、明示的に追加
            // 以前は全スロット(300体)を走査していたが、frameCache のキャッシュを使用して高速化
            const activeEnemiesInvolved = [...candidates];
            const bosses = this.frameCache.activeBosses;
            for (let k = 0; k < bosses.length; k++) {
                const boss = bosses[k];
                if (!candidates.includes(boss)) {
                    activeEnemiesInvolved.push(boss);
                }
            }

            let bulletConsumed = false;

            for (let j = 0; j < activeEnemiesInvolved.length; j++) {
                if (!b.active) break;
                const e = activeEnemiesInvolved[j];
                if (!e.active) continue;

                // [REQ] 同一敵への多重ヒット制限 (PIERCEのみ)
                if (b.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) {
                    const lastHit = b.lastHitMap.get(e.id);
                    const now = Date.now();
                    if (lastHit && (now - lastHit < CONSTANTS.LASER_HIT_INTERVAL_MS)) {
                        continue;
                    }
                } else {
                    if (b.hitEnemies.has(e)) continue;
                }

                Profiler.counts.bulletEnemyChecks++;

                const dx = b.x - e.renderX;
                const dy = b.y - e.renderY;
                const distSq = dx * dx + dy * dy;
                let size = CONSTANTS.ENEMY_SIZE;
                if (e.isBoss) size *= CONSTANTS.BOSS_SIZE_MUL;
                else if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) size *= CONSTANTS.ELITE_SIZE_MUL;

                const baseBulletSize = CONSTANTS.BULLET_SIZE;
                const bulletHitRadius = baseBulletSize * (b.hitWidthMul || 1.0);
                const minDist = bulletHitRadius + size;

                if (distSq < minDist * minDist) {
                    const affinityMul = CONSTANTS.AFFINITY_DAMAGE_MATRIX[b.weaponType][e.affinity] || 1.0;
                    let damage = b.damage * affinityMul;

                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE && b.burstFrames > 0) {
                        damage *= b.burstDamageMul;
                    }

                    // [REQ] 反射判定
                    const isReflecting = (e.type === CONSTANTS.ENEMY_TYPES.REFLECTOR && e.isReflecting(b.x, b.y));
                    if (isReflecting) {
                        // 跳ね返り処理: 速度を反転し、フラグを立てる
                        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                        const edx = e.x - this.player.x;
                        const edy = e.y - this.player.y;
                        const angleToEnemy = Math.atan2(edy, edx);
                        const reflectAngle = angleToEnemy + (Math.random() - 0.5) * 0.4;
                        b.vx = -Math.cos(reflectAngle) * speed * 0.8;
                        b.vy = -Math.sin(reflectAngle) * speed * 0.8;
                        b.angle = Math.atan2(b.vy, b.vx);
                        b.isReflected = true;
                        b.hitEnemies.clear();

                        if (this.audio) this.audio.playSe('SE_REFLECT', { variation: 0.1, volume: 0.8 });
                        this.spawnDamageText(e.renderX, e.renderY, "REFLECT!", "#ffd700");
                        bulletConsumed = true;
                        break;
                    }

                    const actualDamage = e.takeDamage(damage, {
                        globalBuffActive: globalBuffActive,
                        isAuraProtected: e.isShielded
                    });

                    // [REQ] ヒット間隔管理の更新
                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) {
                        b.lastHitMap.set(e.id, Date.now());
                    }

                    // [REQ] ヒットサウンド (ガード vs 通常ダメージ)
                    if (this.audio) {
                        const isGuarded = (e.isShielded || globalBuffActive);
                        if (isGuarded) {
                            this.audio.playSe('SE_GUARD_HIT_01', { variation: 0.05, volume: 0.6 });
                        } else if (e.hp > 0) {
                            this.audio.playSe('SE_BREAK_SPECIAL', { variation: 0.1, volume: 0.45 });
                        }
                    }
                    b.hitEnemies.add(e);

                    // RIM_LASER: ダメージ表示なし（静かに消える）
                    if (e.type !== CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5) {
                        let textColor = '#fff';
                        // バリア/バフで軽減されている場合は水色（最優先）
                        if (e.isShielded || globalBuffActive) {
                            textColor = '#87ceeb'; // 水色（Sky Blue）
                        } else if (affinityMul > 1.0) {
                            textColor = '#ffcc00';
                        } else if (affinityMul < 1.0) {
                            textColor = '#888888';
                        }
                        this.spawnDamageText(e.renderX, e.renderY, Math.round(actualDamage), textColor);
                    }

                    const weaponConfig = CONSTANTS.WEAPON_CONFIG[b.weaponType];
                    const knockMulBase = CONSTANTS.AFFINITY_KNOCK_MATRIX[b.weaponType][e.affinity] || 1.0;
                    let knockPower = CONSTANTS.ENEMY_KNOCKBACK_POWER * weaponConfig.knockMul * knockMulBase;

                    // RIFLE
                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.STANDARD) {
                        const rifleLevel = this.player.weapons.standard.level;
                        if (rifleLevel >= 10) {
                            // 既存の「残り跳弾回数」初期化ロジック (isRicochet で判定可能)
                            if (!b.isRicochet) {
                                let limit = (rifleLevel >= 20) ? 2 : 1;
                                b.remainingRicochets = limit;
                            }

                            b.ricochetExcludes.add(e);
                            if (b.remainingRicochets > 0) {
                                const nextTarget = this.findNearestEnemy(b.ricochetExcludes, b.x, b.y, 220);
                                if (nextTarget) {
                                    this.spawnRicochetBullet(
                                        b.x, b.y, nextTarget,
                                        b.damage * (rifleLevel < 30 ? 0.8 : 1.0),
                                        this.player.getWeaponStats().speed,
                                        b.remainingRicochets, b.ricochetExcludes,
                                        b.weaponType,
                                        { ...this.player.getWeaponStats(), tintColor: getTintForWeapon(b.weaponType, rifleLevel), visualScale: b.visualScale },
                                        b.ricochetCount
                                    );
                                }
                                b.remainingRicochets = 0;
                                b.active = false;
                                bulletConsumed = true;
                            }
                        }
                    }

                    // SHOTGUN
                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.SHOT) {
                        const shotgunLevel = this.player.weapons.shot.level;
                        if (shotgunLevel >= 10) {
                            this.applyShotgunExplosion(b.x, b.y, b.damage, shotgunLevel);
                            knockPower *= (this.player.getWeaponStats().knockMul || 1.0);
                        }
                    } else if (b.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE && this.player.weapons.pierce.level > 25) {
                        knockPower = 1.0;
                    }

                    // RIM_LASER: ノックバックなし
                    if (e.type !== CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5) {
                        e.applyKnockback(b.vx, b.vy, knockPower);
                    }
                    this.player.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.player.hp + CONSTANTS.PLAYER_MAX_HP * CONSTANTS.STANDARD_RECOVERY_ON_HIT);

                    if (e.hp <= 0) {
                        const killCtx = { weaponType: b.weaponType, ricochetCount: b.ricochetCount };
                        e.destroy('BULLET', this, killCtx);
                    }

                    b.pierceCount--;
                    if (b.pierceCount < 0) {
                        b.active = false;
                        bulletConsumed = true;
                        break;
                    }
                }
            }

            if (bulletConsumed) continue;

            // 2) BARRIER_PAIR
            if (barrierPairs.length > 0) {
                for (let k = 0; k < barrierPairs.length; k++) {
                    const bar = barrierPairs[k];
                    if (b.x < bar.minX || b.x > bar.maxX || b.y < bar.minY || b.y > bar.maxY) continue;
                    const d = this.distToSegment(b.x, b.y, bar.ax, bar.ay, bar.bx, bar.by);
                    if (d < 10) {
                        b.active = false;
                        this.audio.playSe('SE_GUARD_HIT_01', { variation: 0.5, priority: 'low' });
                        Effects.spawnHitEffect(b.x, b.y, 0);
                        continue;
                    }
                }
            }
        }

        const now = Date.now();
        let frameTouchHitApplied = false;
        this.enemies.forEach(e => {
            if (!e.active) return;
            const dx = this.player.x - e.renderX;
            const dy = this.player.y - e.renderY;
            const distSq = dx * dx + dy * dy;

            let size = CONSTANTS.ENEMY_SIZE;
            if (e.isBoss) size = CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL;
            else if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) size = CONSTANTS.ENEMY_SIZE * CONSTANTS.ELITE_SIZE_MUL;
            const minDist = CONSTANTS.PLAYER_SIZE + size;

            if (distSq < minDist * minDist) {
                if (!frameTouchHitApplied && this.player.invincibleFrames <= 0) {
                    if (now - e.lastContactTime > CONSTANTS.ENEMY_CONTACT_COOLDOWN_MS) {
                        let damageRatio = CONSTANTS.ENEMY_DAMAGE_RATIO;
                        if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) {
                            damageRatio *= (CONSTANTS.ELITE_DAMAGE_MUL || 1.0);
                        } else if (e.type === CONSTANTS.ENEMY_TYPES.FLANKER) {
                            damageRatio *= 4.0; // High damage for Flanker charge
                        } else if (e.isDrone) {
                            damageRatio = CONSTANTS.PLASMA_DRONE_STAGE5.damage;
                        } else if (e.isRimLaser) {
                            damageRatio = CONSTANTS.RIM_LASER_STAGE5.damage;
                        }
                        // アトラクターバフ（RED）を接触ダメージに適用
                        const finalDamage = damageRatio * (e.damageMultiplier || 1.0);
                        this.player.takeDamage(finalDamage);
                        this.player.invincibleFrames = 18;
                        frameTouchHitApplied = true;
                        this.audio.playSe('SE_DAMAGE', { priority: 'high' });
                        e.lastContactTime = now;
                    }
                }
                // プレイヤーに接触した時点で「到達」とみなし、削除する（キル数には含めない）
                // ただしボスは消滅させず、接触ダメージを与え続ける
                if (!e.isBoss) {
                    e.destroy('LIFETIME', this);
                }
            }

            if (distSq < CONSTANTS.BARRIER_RADIUS * CONSTANTS.BARRIER_RADIUS) {
                if (!e.active) return; // 二重処理防止

                let d = CONSTANTS.BARRIER_DPS * (dt / 1000);
                if (e.isBoss) d *= 0.5;
                e.takeDamage(d, { globalBuffActive, isAuraProtected: e.isShielded });

                // [REQ] SE再生（継続ダメージなので周期的に再生）
                if (this.audio && this.optimizationFrameCount % 12 === 0) {
                    if (e.isShielded || globalBuffActive) {
                        this.audio.playSe('SE_GUARD_HIT_01', { variation: 0.1, volume: 0.3 });
                    } else if (e.hp > 0) {
                        this.audio.playSe('SE_BREAK_SPECIAL', { variation: 0.1, volume: 0.3 });
                    }
                }

                if (!e.isBoss && CONSTANTS.BARRIER_INSTANT_KILL_TYPES.includes(e.type) && !this.player.barrierKillConsumedThisFrame && this.player.barrierCharges > 0) {
                    this.player.barrierCharges--;
                    this.player.barrierKillConsumedThisFrame = true;
                    this.audio.playSe('SE_GUARD_HIT_02', { variation: 0.1 });
                    e.destroy('LIFETIME', this); // バリア即死は寿命(LIFETIME)とする
                } else {
                    if (Math.random() < 0.1) this.spawnDamageText(e.renderX, e.renderY, ".", "#ffffff");
                    const dist = Math.sqrt(distSq);
                    if (dist > 0) e.applyKnockback((e.renderX - this.player.x) / dist, (e.renderY - this.player.y) / dist, CONSTANTS.BARRIER_KNOCKBACK * (dt / 16.6));
                    if (e.hp <= 0 && e.active) e.destroy('BARRIER_DAMAGE', this);
                }
            }
        });

        // 3) 反射弾 vs プレイヤー
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (b.active && b.isReflected) {
                const dx = b.x - this.player.x;
                const dy = b.y - this.player.y;
                const distSq = dx * dx + dy * dy;
                const playerHitR = CONSTANTS.PLAYER_SIZE || 20;
                if (distSq < playerHitR * playerHitR) {
                    this.player.takeDamage(0.1); // 反射弾ダメージ (10%)
                    this.audio.playSe('SE_DAMAGE', { priority: 'high' });
                    b.active = false;
                    Effects.spawnHitEffect(b.x, b.y, 0);
                }
            }
        }

        // ステージクリア判定
        const isBossStage = (this.currentStage + 1) % 5 === 0;

        if (isBossStage) {
            // ボスステージ: ボスが出現済みで、かつ現在生存しているボスがいない場合（雑魚は無視）
            const hasActiveBoss = this.enemies.some(e => e.active && e.isBoss);

            // Failsafe: If a boss exists, ensure the flag is true
            if (hasActiveBoss) this.bossSpawned = true;

            if (this.bossSpawned && !hasActiveBoss) {
                if (this.isDebugStage) {
                    // デバッグ時はリザルトに行かず、フラグをリセットして次を待つ
                    this.bossSpawned = false;
                } else {
                    this.stageClear();
                }
            }
        } else {
            // 通常ステージ
            if (this.enemiesRemaining <= 0 && this.spawnQueue <= 0 && this.enemies.length === 0) {
                if (!this.isDebugStage) {
                    this.stageClear();
                }
            }
        }
        // ゴールド回収判定は updateGolds(dt) に集約
    }

    /**
     * ゴールドの物理更新とUIへの吸引・回収処理
     */
    updateGolds(dt) {
        const { scale: curScale, offsetX: curOffX, offsetY: curOffY } = this.getRenderTransform();
        // UIアイコン(左下)の基準位置
        const goldTargetX = (23 - curOffX) / curScale;
        const goldTargetY = (this.canvas.height - 106 - curOffY) / curScale;

        // 獲得テキストの表示位置
        const textTargetX = (60 - curOffX) / curScale;

        for (let k = this.golds.length - 1; k >= 0; k--) {
            const g = this.golds[k];

            // 吸引先をUIターゲットに設定して更新
            g.update(goldTargetX, goldTargetY);

            // 距離判定による回収
            const dx = goldTargetX - g.x;
            const dy = goldTargetY - g.y;
            const distSq = dx * dx + dy * dy;
            const minDist = 30; // 判定半径

            if (distSq < minDist * minDist) {
                const val = (typeof g.value === 'number' && !isNaN(g.value)) ? g.value : 10;

                // 加算処理（SSOT）
                this.goldCount = (this.goldCount || 0) + val;
                this.totalGoldEarned = (this.totalGoldEarned || 0) + val;
                this.stageGoldEarned = (this.stageGoldEarned || 0) + val;

                // 獲得ポップアップ演出 (+いくら)
                this.spawnDamageText(textTargetX, goldTargetY - 40, `+${val}`, "#ffcc00");

                this.audio.playSe('SE_COIN', { volume: 0.5 });

                // プールへ返却
                this.goldPool.release(this.golds.splice(k, 1)[0]);
            }
        }
    }

    /**
     * 各敵がシールド保護範囲内にいるか判定（設置型シールドに対応）
     */
    updateShieldCache() {
        const globalMarkActive = this.globalMarkTimer > 0;
        const globalGuardBuffActive = this.enemies.some(p =>
            p.active && p.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && p.barrierState === 'active'
        );
        this.globalGuardianActive = globalGuardBuffActive;
        const globalBuffActive = globalGuardBuffActive || globalMarkActive;

        const auraRadius = CONSTANTS.SHIELDER.auraRadius;
        const auraRadiusSq = Math.pow(auraRadius, 2);

        for (let j = 0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (!e.active) continue;

            e.isShielded = false;
            // 画面上の全設置シールドをチェック
            for (let k = 0; k < this.shieldZones.length; k++) {
                const sz = this.shieldZones[k];
                const dx = sz.x - e.x;
                const dy = sz.y - e.y;
                if (dx * dx + dy * dy < auraRadiusSq) {
                    e.isShielded = true;
                    break;
                }
            }
        }
    }

    /**
     * 設置型シールドを生成
     */
    createShieldZone(x, y) {
        this.shieldZones.push({
            x: x,
            y: y,
            timer: CONSTANTS.SHIELDER.barrierDurationMs || 10000,
            radius: CONSTANTS.SHIELDER.auraRadius || 90
        });

        // 生成SEなどがあればここで追加
        if (this.audio) this.audio.playSe('SE_BARRIER_01', { volume: 0.4, pitch: 0.8 });
    }

    cleanupEntities() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active || b.x < -100 || b.x > CONSTANTS.TARGET_WIDTH + 100 || b.y < -100 || b.y > CONSTANTS.TARGET_HEIGHT + 100) {
                this.bulletPool.release(this.bullets.splice(i, 1)[0]);
            }
        }
        const { scale, offsetX, offsetY, viewW, viewH } = this.getRenderTransform();
        const margin = 200;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];

            // 画面外判定 (スクリーン座標系 + マージン)
            const sx = e.x * scale + offsetX;
            const sy = e.y * scale + offsetY;
            const isOffScreen = sx < -margin || sx > viewW + margin || sy < -margin || sy > viewH + margin;

            // 猶予ルールの適用
            if (e.active && isOffScreen && (e.age || 0) > 0.5) {
                e.oobFrames++;
            } else {
                e.oobFrames = 0;
            }

            // 統計ログ (DEBUG時) - 1秒に1回 OOB判定の詳細を出す (先頭の敵のみ)
            if (this.debugEnabled && e.active && e.id !== -1 && this.optimizationFrameCount % 60 === 0 && i === 0) {
                // console.log(`[OOB DEBUG] id:${e.id} type:${e.type} world:(${e.x.toFixed(0)},${e.y.toFixed(0)}) screen:(${sx.toFixed(0)},${sy.toFixed(0)}) scale:${scale.toFixed(4)} offset:(${offsetX.toFixed(1)},${offsetY.toFixed(1)}) view:${viewW}x${viewH}`);
            }

            if (!e.active || e.oobFrames >= 60) {
                if (e.oobFrames >= 60) e.deactivateReason = 'oob';
                this.enemyPool.release(this.enemies.splice(i, 1)[0]);
            }
        }
        for (let i = this.damageTexts.length - 1; i >= 0; i--) {
            if (!this.damageTexts[i].active) {
                this.damageTextPool.release(this.damageTexts.splice(i, 1)[0]);
            }
        }
    }


    triggerPulse() {
        // カウントダウン中、ポーズ中、またはクールダウン中は無効
        if (this.isCountdownActive() || this.isPaused || this.pulseCooldownTimer > 0) return;

        // 200ms 連続再生制限 (AudioManager 側の 60ms を上書き)
        const now = Date.now();
        if (this.lastPulseSoundTime && now - this.lastPulseSoundTime < 200) return;
        this.lastPulseSoundTime = now;

        this.audio.playSe('SE_PULSE', { priority: 'high' });
        this.pulseCooldownTimer = CONSTANTS.PULSE_COOLDOWN_MS;

        // 画面シェイクの発動
        const vfx = CONSTANTS.PULSE_VFX;
        this.screenShakeTimer = vfx.SHAKE_MS;
        this.screenShakeIntensity = vfx.SHAKE_MAX_PX;

        // 多層リングの生成
        for (let i = 0; i < vfx.RING_COUNT; i++) {
            this.pulseEffects.push({
                x: this.player.x,
                y: this.player.y,
                radius: vfx.RING_START_R + i * 20,
                speed: 0.4 + i * 0.1,
                // frame単位ではなくms単位で計算: 1.0 / LifeMs
                fadeSpeed: (1.0 / vfx.RING_LIFE_MS) * (0.8 + i * 0.2),
                alpha: 1.0 - i * 0.2
            });
            if (this.pulseEffects.length > 6) this.pulseEffects.shift();
        }

        const radius = CONSTANTS.PULSE_RADIUS;
        const kbParams = CONSTANTS.PULSE_KNOCKBACK_PARAMS;

        // 範囲内の敵を弾き飛ばす
        this.enemies.forEach(e => {
            if (!e.active) return;
            const dx = e.renderX - this.player.x;
            const dy = e.renderY - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < radius * radius) {
                const dist = Math.sqrt(distSq);
                const vx = dx / (dist || 0.001); // Epsilon
                const vy = dy / (dist || 0.001);

                // 距離減衰ノックバック
                const ratio = 1 - (dist / radius);
                const falloff = Math.pow(ratio, kbParams.FALLOFF_POWER);
                const factor = Math.max(kbParams.MIN_FACTOR, falloff);
                const knockPower = CONSTANTS.PULSE_KNOCKBACK * factor;

                e.applyKnockback(vx, vy, knockPower);
                e.pulseOutlineTimer = vfx.OUTLINE_MS;
                // this.spawnDamageText(e.renderX, e.renderY, "PUSH!", "#ff8800");
            }
        });
    }

    updateUI() {
        const hpPercent = (this.player.hp / CONSTANTS.PLAYER_MAX_HP) * 100;
        const hpFill = document.getElementById('hp-bar-fill');
        const hpContainer = document.querySelector('.hp-container');

        hpFill.style.width = Math.max(0, hpPercent) + '%';

        // ダメージ演出の適用
        const isDamaged = this.player.damageFlashTimer > 0;
        hpFill.classList.toggle('damage', isDamaged);
        hpContainer.classList.toggle('damage', isDamaged);

        document.getElementById('gold-count').textContent = Math.floor(this.displayGoldCount);
        document.getElementById('stage-info').textContent = `STAGE ${this.currentStage + 1}`;

        document.querySelectorAll('.weapon-up-btn').forEach(btn => {
            const type = btn.getAttribute('data-up-weapon');
            const data = this.player.weapons[type];
            const config = CONSTANTS.WEAPON_CONFIG[type];
            const lvSpan = btn.querySelector('.up-slot-lv');
            const costSpan = btn.querySelector('.up-slot-cost');

            btn.classList.toggle('active', this.player.currentWeapon === type);

            if (!data.unlocked) {
                lvSpan.textContent = 'LOCK';
                costSpan.textContent = config.unlockCost;
                btn.classList.toggle('disabled', this.goldCount < config.unlockCost);
                btn.classList.remove('max');
            } else {
                const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level, CONSTANTS.UPGRADE_COST_GROWTH_WEAPON);
                const isMax = data.level >= CONSTANTS.UPGRADE_LV_MAX;

                lvSpan.textContent = isMax ? '∞' : data.level;
                costSpan.textContent = isMax ? '' : cost;

                btn.classList.toggle('disabled', !isMax && this.goldCount < cost);
                btn.classList.toggle('max', isMax);
            }
            // カウントダウン中のロック表示 [NEW]
            btn.classList.toggle('countdown-locked', this.isCountdownActive());
        });


        this.updateUpgradeUI();
    }

    updateUpgradeUI() {
        const cur = this.player.weapons[this.player.currentWeapon];
        const spdCost = this.getUpgradeCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, cur.atkSpeedLv, CONSTANTS.UPGRADE_COST_GROWTH_SPEED);
        const isSpdMax = cur.atkSpeedLv >= CONSTANTS.UPGRADE_LV_MAX;

        const spdLvSpan = document.getElementById('speed-up-lv');
        const spdCostSpan = document.getElementById('cost-speed');
        const btnSpd = document.getElementById('btn-up-speed');

        spdLvSpan.textContent = isSpdMax ? '∞' : cur.atkSpeedLv;
        spdCostSpan.textContent = isSpdMax ? '' : spdCost;

        btnSpd.classList.toggle('disabled', !isSpdMax && (this.goldCount < spdCost));
        btnSpd.classList.toggle('max', isSpdMax);
        // カウントダウン中のロック表示 [NEW]
        btnSpd.classList.toggle('countdown-locked', this.isCountdownActive());

        // パルスUI更新
        const btnPulse = document.getElementById('btn-pulse');
        if (btnPulse) {
            const isReady = this.pulseCooldownTimer <= 0;
            btnPulse.classList.toggle('disabled', false); // disabled属性制御は止め、見た目のクラスで制御
            btnPulse.classList.toggle('ready', isReady);
            btnPulse.classList.toggle('charging', !isReady);

            const fill = document.getElementById('pulse-cd-fill');
            const ratio = this.pulseCooldownTimer / CONSTANTS.PULSE_COOLDOWN_MS;
            const percent = (1 - Math.max(0, Math.min(1, ratio))) * 100;
            fill.style.width = percent + '%';

            // カウントダウン中のロック表示 [NEW]
            btnPulse.classList.toggle('countdown-locked', this.isCountdownActive());
        }

        // 定期的なデバッグHUD更新 (毎フレーム更新によるチラつき防止)
        this.uiUpdateCounter = (this.uiUpdateCounter || 0) + 1;
        if (this.uiUpdateCounter % 10 === 0) {
            this.updateDebugHUD();
        }
    }

    updateDebugHUD() {
        const dbFps = document.getElementById('db-fps');
        if (dbFps) {
            const report = Profiler.getReport();
            dbFps.textContent = report.fps.toFixed(1);
            dbFps.style.color = report.fps < 30 ? '#ff4444' : (report.fps < 55 ? '#ffcc00' : '#00ff88');
        }

        const dbEnemies = document.getElementById('db-enemies');
        if (dbEnemies) {
            dbEnemies.textContent = `${this.enemies.length} / Rem:${this.enemiesRemaining}`;
        }

        // PhaseTimerの表示 (秒:ミリ秒)
        const pSec = Math.floor(this.phaseTimer / 1000);
        const pMs = Math.floor((this.phaseTimer % 1000) / 10);
        const pStr = `${pSec}:${pMs.toString().padStart(2, '0')}`;

        const dbState = document.getElementById('db-state');
        if (dbState) {
            dbState.textContent = `${this.spawnPhase} (${pStr})`;
            dbState.classList.toggle('cool', this.spawnPhase === 'COOL');
        }

        // --- Stats Display (SpawnSide / Formation) ---
        if (this.debugEnabled) {
            let statsDiv = document.getElementById('debug-stats-panel');
            if (!statsDiv) {
                statsDiv = document.createElement('div');
                statsDiv.id = 'debug-stats-panel';
                statsDiv.style.position = 'absolute';
                statsDiv.style.bottom = '80px';
                statsDiv.style.right = '10px';
                statsDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
                statsDiv.style.color = '#0f0';
                statsDiv.style.fontFamily = 'monospace';
                statsDiv.style.fontSize = '10px';
                statsDiv.style.padding = '8px';
                statsDiv.style.border = '1px solid #0f0';
                statsDiv.style.pointerEvents = 'none';
                statsDiv.style.zIndex = '1000';
                document.body.appendChild(statsDiv);
            }

            if (this.spawnDirector) {
                const sd = this.spawnDirector;

                // Helper to format counts
                const fmt = (obj) => Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(', ');
                const getHistoryCounts = (arr) => {
                    const counts = {};
                    arr.forEach(x => counts[x] = (counts[x] || 0) + 1);
                    return counts;
                };

                const report = Profiler.getReport();
                const sideLatest = getHistoryCounts(sd.spawnSideHistory);
                const formLatest = getHistoryCounts(sd.formationHistory);

                // ドローン・RIM LASER 稼働数の集計
                const activeDrones = this.enemies.filter(e => e.isDrone && e.active).length;
                const activeRims = this.enemies.filter(e => e.isRimLaser && e.active).length;
                const boss = this.enemies.find(e => e.isBoss && e.bossIndex === 4);
                const droneCdStr = boss ? (boss.droneCd / 1000).toFixed(1) : 'OFF';
                const rimCdStr = boss ? (boss.rimLaserCd / 1000).toFixed(1) : 'OFF';

                const rimCfgHud = (this.currentStage >= 9) ? CONSTANTS.RIM_LASER_STAGE10 : CONSTANTS.RIM_LASER_STAGE5;
                const droneLimit = 3; // ドローンは固定

                statsDiv.innerHTML = `
                    <div style="font-weight:bold; color:#fff; border-bottom:1px solid #0f0; margin-bottom:4px;">BATTLE & SPAWN STATS</div>
                    <div>FPS: ${report.fps.toFixed(1)} | DRONES: <span style="color:${activeDrones >= droneLimit ? '#f00' : '#0f0'}">${activeDrones}/${droneLimit}</span> | RIMS: <span style="color:${activeRims >= rimCfgHud.maxActive ? '#f00' : '#0f0'}">${activeRims}/${rimCfgHud.maxActive}</span></div>
                    <div>BOSS_CD: D:${droneCdStr}s / R:${rimCdStr}s</div>
                    <hr style="border:0; border-top:1px solid #333; margin:4px 0;">
                    <div><b>SIDE (Latest 200):</b><br>${fmt(sideLatest)}</div>
                    <div style="margin-top:4px;"><b>FORMATION (Latest 200):</b><br>${fmt(formLatest)}</div>
                `;
            }
        } else {
            const statsDiv = document.getElementById('debug-stats-panel');
            if (statsDiv) statsDiv.remove();
        }

        // Debug Stage UI
        if (this.isDebugStage) {
            let container = document.getElementById('debug-ui-container');
            if (!container) {
                // Main Container
                container = document.createElement('div');
                container.id = 'debug-ui-container';
                container.style.position = 'absolute';
                container.style.top = '120px';
                container.style.left = '10px';
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '10px';
                container.style.pointerEvents = 'auto';
                container.style.zIndex = '9999';
                container.style.backgroundColor = 'rgba(0,0,0,0.8)';
                container.style.padding = '10px';
                container.style.border = '1px solid #0f0';
                container.style.color = '#0f0';
                container.style.fontFamily = 'monospace';
                document.body.appendChild(container);

                // Title
                const div = document.createElement('div');
                div.textContent = 'DEBUG MODE';
                div.style.fontWeight = 'bold';
                div.style.borderBottom = '1px solid #0f0';
                div.style.marginBottom = '5px';
                container.appendChild(div);

                // 1. Enemy Select
                const selDiv = document.createElement('div');
                selDiv.textContent = 'TYPE: ';
                const select = document.createElement('select');
                select.id = 'debug-enemy-select';
                select.style.backgroundColor = '#000';
                select.style.color = '#fff';
                select.style.border = '1px solid #0f0';

                Object.entries(CONSTANTS.ENEMY_TYPES).forEach(([key, val]) => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = `${val} / ${key}`;
                    if (val === this.debugTargetType) opt.selected = true;
                    select.appendChild(opt);
                });

                // [NEW] BOSS option
                const bossOpt = document.createElement('option');
                bossOpt.value = 'BOSS';
                bossOpt.textContent = 'BOSS (Debug Only)';
                if (this.debugTargetType === 'BOSS') bossOpt.selected = true;
                select.appendChild(bossOpt);

                select.addEventListener('change', (e) => {
                    this.debugTargetType = e.target.value;
                    this.enemies.forEach(e => e.active = false); // Clear
                    if (this.spawnDirector) {
                        this.spawnDirector.spawnQueue = [];
                        this.spawnDirector.spawnIntervalTimer = 0;
                    }

                    // 解説文の更新
                    const descDiv = document.getElementById('debug-enemy-desc');
                    if (descDiv) {
                        descDiv.textContent = CONSTANTS.ENEMY_DESCRIPTIONS[this.debugTargetType] || '解説なし';
                    }
                });
                selDiv.appendChild(select);
                container.appendChild(selDiv);

                // 1.02 TYPE 2 Select [NEW]
                const sel2Div = document.createElement('div');
                sel2Div.textContent = 'TYPE 2: ';
                const select2 = document.createElement('select');
                select2.id = 'debug-enemy-select-2';
                select2.style.backgroundColor = '#000';
                select2.style.color = '#fff';
                select2.style.border = '1px solid #0f0';
                select2.style.marginTop = '5px';

                // NONE option
                const noneOpt = document.createElement('option');
                noneOpt.value = 'NONE';
                noneOpt.textContent = 'NONE';
                if (this.debugTargetType2 === 'NONE' || this.debugTargetType2 === undefined) noneOpt.selected = true;
                select2.appendChild(noneOpt);

                // Enemy types
                for (const [key, val] of Object.entries(CONSTANTS.ENEMY_TYPES)) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = `${val}/${key}`;
                    if (val === this.debugTargetType2) opt.selected = true;
                    select2.appendChild(opt);
                }

                select2.addEventListener('change', (e) => {
                    this.debugTargetType2 = e.target.value;
                    // Clear existing enemies
                    this.enemies.forEach(e => e.active = false);
                    if (this.spawnDirector) {
                        this.spawnDirector.spawnQueue = [];
                        this.spawnDirector.spawnIntervalTimer = 0;
                    }
                });
                sel2Div.appendChild(select2);
                container.appendChild(sel2Div);

                // 1.03 Boss ID Select [NEW]
                const bossSelDiv = document.createElement('div');
                bossSelDiv.id = 'debug-boss-select-container';
                bossSelDiv.textContent = 'BOSS ID: ';
                bossSelDiv.style.display = this.debugTargetType === 'BOSS' ? 'block' : 'none';
                const bossSelect = document.createElement('select');
                bossSelect.id = 'debug-boss-select';
                bossSelect.style.backgroundColor = '#000';
                bossSelect.style.color = '#fff';
                bossSelect.style.border = '1px solid #0f0';
                bossSelect.style.marginTop = '5px';

                // ボス一覧 (Stage 5, 10 等)
                const bossList = [
                    { id: 4, name: 'Stage 5 Boss' },
                    { id: 9, name: 'Stage 10 Boss' }
                ];
                bossList.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.textContent = b.name;
                    if (this.debugTargetBossId === b.id) opt.selected = true;
                    bossSelect.appendChild(opt);
                });
                if (this.debugTargetBossId === undefined) this.debugTargetBossId = bossList[0].id;

                bossSelect.addEventListener('change', (e) => {
                    this.debugTargetBossId = parseInt(e.target.value);
                });
                bossSelDiv.appendChild(bossSelect);
                container.appendChild(bossSelDiv);

                // TYPEの変更に応じて表示切り替え
                select.addEventListener('change', (e) => {
                    const isBoss = e.target.value === 'BOSS';
                    bossSelDiv.style.display = isBoss ? 'block' : 'none';
                    descDiv.textContent = isBoss ? 'デバッグ用ボスの単体生成モード。' : (CONSTANTS.ENEMY_DESCRIPTIONS[this.debugTargetType] || '解説なし');
                });

                // 1.05 Formation Select [NEW]
                const formDiv = document.createElement('div');
                formDiv.textContent = 'FORMATION: ';
                const formSelect = document.createElement('select');
                formSelect.id = 'debug-formation-select';
                formSelect.style.backgroundColor = '#000';
                formSelect.style.color = '#fff';
                formSelect.style.border = '1px solid #0f0';
                formSelect.style.marginTop = '5px';

                const formationList = [
                    'NONE', 'LINEAR', 'HLINE', 'V_SHAPE', 'FAN', 'CIRCLE',
                    'ARC', 'GRID', 'RANDOM_CLUSTER', 'CROSS', 'DOUBLE_RING'
                ];

                formationList.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    if (val === this.debugFormation) opt.selected = true;
                    formSelect.appendChild(opt);
                });

                formSelect.addEventListener('change', (e) => {
                    this.debugFormation = e.target.value;
                    this.enemies.forEach(e => e.active = false); // Clear
                    if (this.spawnDirector) {
                        this.spawnDirector.spawnQueue = [];
                        this.spawnDirector.spawnIntervalTimer = 0;
                    }
                });
                formDiv.appendChild(formSelect);
                container.appendChild(formDiv);

                // 1.1 Enemy Description Panel [NEW]
                const descDiv = document.createElement('div');
                descDiv.id = 'debug-enemy-desc';
                descDiv.style.marginTop = '5px';
                descDiv.style.padding = '5px';
                descDiv.style.fontSize = '12px';
                descDiv.style.color = '#aaa';
                descDiv.style.borderLeft = '2px solid #0f0';
                descDiv.style.width = '200px';
                descDiv.style.whiteSpace = 'normal';
                descDiv.style.lineHeight = '1.4';
                descDiv.textContent = CONSTANTS.ENEMY_DESCRIPTIONS[this.debugTargetType] || '解説なし';
                container.appendChild(descDiv);

                // 2. Spawn Count Slider
                const cntDiv = document.createElement('div');
                const cntLabel = document.createElement('div');
                cntLabel.textContent = `COUNT: ${this.debugSpawnCount}`;
                const cntRange = document.createElement('input');
                cntRange.type = 'range';
                cntRange.min = '1';
                cntRange.max = '20';
                cntRange.value = this.debugSpawnCount;
                cntRange.style.width = '100%';
                cntRange.addEventListener('input', (e) => {
                    this.debugSpawnCount = parseInt(e.target.value);
                    cntLabel.textContent = `COUNT: ${this.debugSpawnCount}`;
                });
                cntDiv.appendChild(cntLabel);
                cntDiv.appendChild(cntRange);
                container.appendChild(cntDiv);

                // 3. Speed Multiplier
                const spdDiv = document.createElement('div');
                const spdLabel = document.createElement('div');
                spdLabel.textContent = `SPEED: x${this.debugSpeedMul.toFixed(1)}`;
                const spdRange = document.createElement('input');
                spdRange.type = 'range';
                spdRange.min = '0.5';
                spdRange.max = '2.0';
                spdRange.step = '0.5';
                spdRange.value = this.debugSpeedMul;
                spdRange.style.width = '100%';
                spdRange.addEventListener('input', (e) => {
                    this.debugSpeedMul = parseFloat(e.target.value);
                    spdLabel.textContent = `SPEED: x${this.debugSpeedMul.toFixed(1)}`;
                });
                spdDiv.appendChild(spdLabel);
                spdDiv.appendChild(spdRange);
                container.appendChild(spdDiv);

                // 4. HP Multiplier
                const hpDiv = document.createElement('div');
                const hpLabel = document.createElement('span');
                hpLabel.textContent = 'HP: ';
                const hpSel = document.createElement('select');
                hpSel.style.backgroundColor = '#000';
                hpSel.style.color = '#fff';
                [1, 3, 5, 10, 50].forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = `x${v}`;
                    if (v === this.debugHpMul) opt.selected = true;
                    hpSel.appendChild(opt);
                });
                hpSel.addEventListener('change', (e) => {
                    this.debugHpMul = parseInt(e.target.value);
                });
                hpDiv.appendChild(hpLabel);
                hpDiv.appendChild(hpSel);
                container.appendChild(hpDiv);

                // 5. Toggles
                const createToggle = (label, key) => {
                    const div = document.createElement('div');
                    const chk = document.createElement('input');
                    chk.type = 'checkbox';
                    chk.checked = this[key];
                    chk.addEventListener('change', (e) => {
                        this[key] = e.target.checked;
                    });
                    const lbl = document.createElement('span');
                    lbl.textContent = ` ${label}`;
                    div.appendChild(chk);
                    div.appendChild(lbl);
                    return div;
                };

                container.appendChild(createToggle('Show Hitbox', 'debugShowHitbox'));
                container.appendChild(createToggle('Show Knockback', 'debugShowKnockback'));

                // [NEW] SPAWN Button
                const btnSpawn = document.createElement('button');
                btnSpawn.textContent = 'SPAWN (SINGLE)';
                btnSpawn.style.marginTop = '10px';
                btnSpawn.style.backgroundColor = '#033';
                btnSpawn.style.border = '1px solid #0f0';
                btnSpawn.style.color = '#0f0';
                btnSpawn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.debugTargetType === 'BOSS') {
                        this.debugSpawnQueue.push({ kind: 'BOSS', bossId: this.debugTargetBossId, forceRespawn: false });
                    } else {
                        // 通常エネミーの生成（SpawnDirectorの自動生成をリセットして1体出す）
                        this.enemies.forEach(e => e.active = false);
                        if (this.spawnDirector) {
                            this.spawnDirector.spawnQueue = [];
                            this.spawnDirector.spawnIntervalTimer = 0;
                            this.spawnDirector.executeSpawn(this.debugTargetType, this.debugFormation);
                        }
                    }
                });
                container.appendChild(btnSpawn);

                // Info
                const infoDiv = document.createElement('div');
                infoDiv.id = 'debug-enemy-info';
                infoDiv.style.whiteSpace = 'pre-wrap';
                infoDiv.style.fontSize = '12px';
                infoDiv.style.borderTop = '1px solid #0f0';
                infoDiv.style.marginTop = '5px';
                container.appendChild(infoDiv);

                // Back Button
                const btn = document.createElement('button');
                btn.textContent = 'BACK TO TITLE';
                btn.style.marginTop = '10px';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.goToTitle();
                });
                container.appendChild(btn);

            } else {
                container.style.display = 'flex';
                // Update Info Display
                const infoDiv = document.getElementById('debug-enemy-info');
                if (infoDiv) {
                    const target = this.enemies.find(e => e.active);
                    if (target) {
                        const hpP = ((target.hp / target.maxHp) * 100).toFixed(1);
                        infoDiv.textContent = `HP: ${Math.floor(target.hp)}/${Math.floor(target.maxHp)} (${hpP}%) \nPOS: ${Math.floor(target.x)}, ${Math.floor(target.y)} \nSTATE: ${target.movementMode || 'N/A'}`;
                    } else {
                        const activeCount = this.enemies.filter(e => e.active).length;
                        infoDiv.textContent = `Active: ${activeCount}\nTarget: ${this.debugTargetType}`;
                    }
                }
            }
        } else {
            // Hide if not debug stage
            const container = document.getElementById('debug-ui-container');
            if (container) container.style.display = 'none';
        }



        // 武器DPSの表示
        const dbWeapon = document.getElementById('db-weapon-dps');
        if (dbWeapon && this.player) {
            const stats = this.player.getWeaponStats();
            const config = this.player.getWeaponConfig();
            const level = this.player.weapons[this.player.currentWeapon].level;
            const dps = (1000 / stats.cooldown) * stats.damage;
            dbWeapon.textContent = `${config.name} Lv.${level} (DPS: ${dps.toFixed(1)})`;
        }

        // --- Boss HP Bar Update [NEW] ---
        const bossHpContainer = document.getElementById('boss-hp-container');
        if (bossHpContainer) {
            // ステージクリア中(isClearing)は表示しない。またHPが0以下の場合も隠す
            const activeBoss = (!this.isClearing) ? this.enemies.find(e => e.active && e.isBoss && e.hp > 0) : null;
            if (activeBoss) {
                bossHpContainer.classList.remove('hidden');
                const fill = document.getElementById('boss-hp-bar-fill');
                const percentText = document.getElementById('boss-hp-percent');
                const nameText = document.getElementById('boss-name');

                const percent = Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100);
                if (fill) fill.style.width = `${percent}%`;
                // Math.ceil -> Math.floor に変更。ミリ残りで1%と表示されるのを防ぐ
                if (percentText) percentText.textContent = `${Math.floor(percent)}%`;

                // Name assignment
                if (nameText) {
                    const stage = (activeBoss.bossIndex !== undefined) ? activeBoss.bossIndex + 1 : this.currentStage + 1;
                    nameText.textContent = `STAGE ${stage} GUARDIAN`;
                }

                // Danger state
                if (percent < 25) bossHpContainer.classList.add('danger');
                else bossHpContainer.classList.remove('danger');

            } else {
                bossHpContainer.classList.add('hidden');
            }
        }
    }

    getRenderTransform() {
        const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
        const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;
        const offsetY = 0; // 現在の描画ロジックでは0
        return {
            scale,
            offsetX,
            offsetY,
            viewW: this.canvas.width,
            viewH: this.canvas.height
        };
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }

        this.ctx.save();

        // 以前の挙動を再現：縦幅を基準にスケールを決め、横方向は中央寄せ（入り切らない分はクリップされる）
        const { scale, offsetX, offsetY } = this.getRenderTransform();

        this.ctx.translate(offsetX, offsetY);

        // 画面シェイクの適用
        if (this.screenShakeTimer > 0) {
            const t = this.screenShakeTimer / CONSTANTS.PULSE_VFX.SHAKE_MS; // 1.0 -> 0.0
            const intensity = this.screenShakeIntensity * t;
            const sx = (Math.random() * 2 - 1) * intensity;
            const sy = (Math.random() * 2 - 1) * intensity;
            this.ctx.translate(sx, sy);
        }

        this.ctx.scale(scale, scale);

        // 背景画像の描画 (ワールド座標内で行うことで位置を同期)
        // ステージ1-6の画像があればそれを使用し、なければStage1をフォールバックとして使用
        const stageNumStr = (this.currentStage + 1).toString().padStart(2, '0');
        let bgAsset = this.assetLoader.get(`BG_STAGE_${stageNumStr}`);
        if (!bgAsset) bgAsset = this.assetLoader.get('BG_STAGE_01');

        if (bgAsset) {
            const targetW = CONSTANTS.TARGET_WIDTH;
            const targetH = CONSTANTS.TARGET_HEIGHT;
            const iw = bgAsset.width;
            const ih = bgAsset.height;

            // contain方式 (アスペクト比を維持しつつ画面内に収め、余白を許容)
            const bScale = Math.min(targetW / iw, targetH / ih);
            const dw = iw * bScale;
            const dh = ih * bScale;

            // 背景の中央をプレイヤーのワールド座標（ワールドの中心）に合わせる
            // これにより、炉心の位置がゲームの座標系と完全に一致するようになります
            const px = (this.player) ? this.player.x : targetW / 2;
            const py = (this.player) ? this.player.y : targetH / 2;

            const dx = px - dw / 2;
            let dy = py - dh / 2 + CONSTANTS.BG_Y_OFFSET;
            if (this.currentStage === 2) dy += 5;  // Stage 3
            if (this.currentStage === 3) dy += 10; // Stage 4
            if (this.currentStage === 4) dy += 15; // Stage 5
            if (this.currentStage === 5) dy -= 90; // Stage 6 (追加 50px)
            if (this.currentStage === 6) dy -= 30; // Stage 7 (追加 10px)
            if (this.currentStage === 7) dy -= 20; // Stage 8
            if (this.currentStage === 8) dy -= 70; // Stage 9 (追加 30px)
            if (this.currentStage === 9) dy -= 90; // Stage 10 (追加 50px)

            this.ctx.drawImage(bgAsset, dx, dy, dw, dh);
        }

        // 背景矩形（描画可能エリアの境界）
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, CONSTANTS.TARGET_WIDTH, CONSTANTS.TARGET_HEIGHT);

        const bAssets = {
            [CONSTANTS.WEAPON_TYPES.STANDARD]: this.assetLoader.get('BULLET_RIFLE'),
            [CONSTANTS.WEAPON_TYPES.SHOT]: this.assetLoader.get('BULLET_SHOT'),
            [CONSTANTS.WEAPON_TYPES.PIERCE]: this.assetLoader.get('BULLET_LASER')
        };
        this.bullets.forEach(b => b.draw(this.ctx, bAssets[b.weaponType]));

        // --- Draw Static Shield Zones ---
        this.shieldZones.forEach(sz => {
            if (sz.timer <= 0) return;
            this.ctx.save();
            this.ctx.translate(sz.x, sz.y);

            const life = sz.timer / (CONSTANTS.SHIELDER.barrierDurationMs || 10000);
            const alpha = Math.min(1.0, life * 5.0); // フェードアウト用
            const color = '0, 255, 255';

            // 六角形グリッド描画 (一回の path でまとめて描画して負荷軽減)
            const radius = sz.radius;
            const hexSize = 15; // サイズを少し大きくして個数を減らす (10->15)
            const gridRadius = Math.ceil(radius / (hexSize * 1.5));

            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.strokeStyle = `rgba(${color}, ${0.5 * alpha})`;
            this.ctx.fillStyle = `rgba(${color}, ${0.2 * alpha})`;
            this.ctx.lineWidth = 1;

            this.ctx.beginPath();
            for (let q = -gridRadius; q <= gridRadius; q++) {
                for (let r = -gridRadius; r <= gridRadius; r++) {
                    const hx = hexSize * (3 / 2 * q);
                    const hy = hexSize * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);

                    if (hx * hx + hy * hy < radius * radius) {
                        const hash = Math.abs(Math.sin(q * 12.9898 + r * 78.233) * 43758.5453) % 1;
                        if (hash > life) continue;

                        for (let i = 0; i < 6; i++) {
                            const angle = (i / 6) * Math.PI * 2;
                            const px = hx + Math.cos(angle) * (hexSize - 1);
                            const py = hy + Math.sin(angle) * (hexSize - 1);
                            if (i === 0) this.ctx.moveTo(px, py);
                            else this.ctx.lineTo(px, py);
                        }
                    }
                }
            }
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        });

        this.enemies.forEach(e => e.draw(this.ctx));
        if (this.itemManager) this.itemManager.draw(this.ctx);

        // ゴールドとダメージテキストはオーバーレイキャンバス（前面）に描画
        if (this.overlayCtx) {
            this.overlayCtx.save();
            this.overlayCtx.translate(offsetX, offsetY);
            this.overlayCtx.scale(scale, scale);
            const goldAsset = this.assetLoader.get('GOLD');
            this.golds.forEach(g => g.draw(this.overlayCtx, goldAsset));
            this.damageTexts.forEach(d => d.draw(this.overlayCtx));
            this.overlayCtx.restore();
        } else {
            // フォールバック（通常キャンバス）
            const goldAsset = this.assetLoader.get('GOLD');
            this.golds.forEach(g => g.draw(this.ctx, goldAsset));
            this.damageTexts.forEach(d => d.draw(this.ctx));
        }

        Effects.draw(this.ctx);
        this.player.draw(this.ctx);

        // --- DEBUG VISUALIZATION ---
        if (this.debugShowHitbox || this.debugShowKnockback) {
            this.ctx.save();
            this.enemies.forEach(e => {
                if (!e.active) return;

                // Hitbox
                if (this.debugShowHitbox) {
                    let size = CONSTANTS.ENEMY_SIZE;
                    if (e.isBoss) size *= CONSTANTS.BOSS_SIZE_MUL;
                    else if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) size *= CONSTANTS.ELITE_SIZE_MUL;
                    else if (e.type === CONSTANTS.ENEMY_TYPES.TRICKSTER) size *= (CONSTANTS.TRICKSTER.sizeMul || 0.7);
                    else if (e.type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) size *= (CONSTANTS.SPLITTER_CHILD.sizeMul || 0.7);

                    this.ctx.strokeStyle = '#00ffff';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.arc(e.renderX, e.renderY, size, 0, Math.PI * 2);
                    this.ctx.stroke();
                }

                // Knockback Vector
                if (this.debugShowKnockback) {
                    if (Math.abs(e.knockVX) > 0.1 || Math.abs(e.knockVY) > 0.1) {
                        this.ctx.strokeStyle = '#ff0000';
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(e.renderX, e.renderY);
                        this.ctx.lineTo(e.renderX + e.knockVX * 15, e.renderY + e.knockVY * 15); // Scale up for visibility
                        this.ctx.stroke();

                        // Arrowhead
                        const angle = Math.atan2(e.knockVY, e.knockVX);
                        const tipX = e.renderX + e.knockVX * 15;
                        const tipY = e.renderY + e.knockVY * 15;
                        this.ctx.beginPath();
                        this.ctx.moveTo(tipX, tipY);
                        this.ctx.lineTo(tipX - Math.cos(angle - Math.PI / 6) * 8, tipY - Math.sin(angle - Math.PI / 6) * 8);
                        this.ctx.lineTo(tipX - Math.cos(angle + Math.PI / 6) * 8, tipY - Math.sin(angle + Math.PI / 6) * 8);
                        this.ctx.lineTo(tipX, tipY);
                        this.ctx.fillStyle = '#ff0000';
                        this.ctx.fill();
                    }
                }
            });
            this.ctx.restore();
        }

        // パルスエフェクト描画
        this.pulseEffects.forEach(fx => {
            this.ctx.beginPath();
            this.ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${fx.alpha * 0.8})`; // 白に近いリング
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // 補助的な衝撃波の輪 (内側)
            this.ctx.beginPath();
            this.ctx.arc(fx.x, fx.y, fx.radius * 0.8, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 68, 68, ${fx.alpha * 0.4})`;
            this.ctx.stroke();
        });
        Profiler.end('render');

        // リザルト画面の描画（オーバーレイ背後または単体で描画）
        if (this.gameState === CONSTANTS.STATE.RESULT) {
            this.drawResultScreen(this.ctx);
        }

        // Phase 2 & 6: Draw Pause UI & Overlay
        this.drawPauseUI(this.ctx);

        this.ctx.restore();
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        let dt = time - this.lastTime;
        this.lastTime = time;
        if (dt > 100 || isNaN(dt)) dt = 16.6;

        Profiler.resetCounts();
        Profiler.updateFrame();

        Profiler.updateFrame();

        // Phase 4: Pause Logic
        if (!this.isPaused) {
            this.update(dt * this.timeScale);
            // EconomyLogger update (with timeScale) - Sync with pause
            if (this.economyLogger) {
                this.economyLogger.update(performance.now());
            }
        }

        this.draw();
        this.updatePerfOverlay(); // 新規追加

        requestAnimationFrame((t) => this.loop(t));
    }
    updatePerfOverlay() {
        if (DEBUG_ENABLED) {
            const stateEl = document.getElementById('db-state');
            if (stateEl && this.spawnDirector) stateEl.textContent = `PHASE: ${this.spawnDirector.phase}`;

            const queueEl = document.getElementById('db-queue');
            if (queueEl) queueEl.textContent = this.spawnQueue;
        }

        const overlay = document.getElementById('perf-overlay');
        if (!overlay) return;

        const report = Profiler.getReport();
        const t = report.times;
        const c = report.counts;

        // オブジェクト数
        c.enemies = this.enemies.length;
        c.bullets = this.bullets.length;
        c.effects = Effects.list ? Effects.list.length : 0;
        c.damageTexts = this.damageTexts.length;

        const fpsColor = report.fps < 30 ? 'perf-crit' : (report.fps < 55 ? 'perf-warn' : 'perf-val');

        let html = `
            <div class="perf-title">PROFILER (Stage ${this.currentStage + 1})</div>
            <div>[Frame] <span class="${fpsColor}">${report.fps.toFixed(1)} FPS</span> (${report.avgDt.toFixed(1)}ms)</div>
            <div>[Max DT] <span class="${report.maxDt > 32 ? 'perf-crit' : 'perf-val'}">${report.maxDt.toFixed(1)}ms</span></div>
            <br>
            <div class="perf-title">TIMES (ms)</div>
            <div><span class="perf-label">Enemy Upd:</span> <span class="perf-val">${(t.enemy_update || 0).toFixed(2)}</span></div>
            <div><span class="perf-label">Bullet Upd:</span> <span class="perf-val">${(t.bullet_update || 0).toFixed(2)}</span></div>
            <div><span class="perf-label">Collision:</span> <span class="perf-val">${(t.collision || 0).toFixed(2)}</span></div>
            <div><span class="perf-label">Spawning :</span> <span class="perf-val">${(t.spawning || 0).toFixed(2)}</span></div>
            <div><span class="perf-label">Render   :</span> <span class="perf-val">${(t.render || 0).toFixed(2)}</span></div>
            <br>
            <div class="perf-title">COUNTS</div>
            <div><span class="perf-label">Enemies :</span> <span class="perf-val">${c.enemies}</span></div>
            <div><span class="perf-label">Bullets :</span> <span class="perf-val">${c.bullets}</span></div>
            <div><span class="perf-label">Effects :</span> <span class="perf-val">${c.effects}</span></div>
            <br>
            <div class="perf-title">PHYSICS (checks/f)</div>
            <div><span class="perf-label">B vs E  :</span> <span class="perf-val">${c.bulletEnemyChecks}</span></div>
            <div><span class="perf-label">E vs P/B:</span> <span class="perf-val">${c.enemyBarrierChecks}</span></div>
        `;

        if (report.spikes && report.spikes.length > 0) {
            html += `<br><div class="perf-title">GC / SPIKES</div>`;
            report.spikes.forEach(s => {
                html += `<div class="perf-warn">${new Date(s.time).toLocaleTimeString()} - ${s.dt.toFixed(1)}ms (E:${s.enemies})</div>`;
            });
        }

        overlay.innerHTML = html;
        // 開発中のみ表示するか、あるいはTITLE画面では隠すなどの配慮が必要
        if (DEBUG_ENABLED && this.gameState !== CONSTANTS.STATE.TITLE) {
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    }
    // --- Helper for Debug ---
    /**
     * カウントダウン中かどうかを判定 (SSOT)
     */
    isCountdownActive() {
        return this.gameState === CONSTANTS.STATE.COUNTDOWN;
    }

    goToTitle() {
        this.triggerFade('out', 500).then(() => {
            location.reload();
        });
    }

    // --- Phase 2, 3, 5: New Methods for Pause Feature ---

    togglePause() {
        if (this.gameState !== CONSTANTS.STATE.PLAYING) return;

        this.audio.playSe('SE_SELECT');
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.audio.pauseBgm();
            this.switchState(CONSTANTS.STATE.PLAYING); // UI更新
        } else {
            this.audio.resumeBgm();
            this.switchState(CONSTANTS.STATE.PLAYING); // UI更新
            this.lastTime = performance.now();
            this.accumulator = 0;
        }
    }

    getPauseButtonRect() {
        // Phase 2: Calculate Postion
        // 右上 STAGE表示の下
        // STAGE表示は padding: 20px 15px
        // ボタンサイズ: 120x28
        const btnW = 120;
        const btnH = 28;
        const marginX = 15;
        const marginY = 55; // Top(20) + Text(~25) + Gap(10)

        return {
            x: this.canvas.width - btnW - marginX,
            y: marginY,
            w: btnW,
            h: btnH
        };
    }

    checkPauseButton(mouseX, mouseY) {
        if (this.gameState !== CONSTANTS.STATE.PLAYING) return false;
        const r = this.getPauseButtonRect();
        return (mouseX >= r.x && mouseX <= r.x + r.w &&
            mouseY >= r.y && mouseY <= r.y + r.h);
    }

    drawPauseUI(ctx) {
        if (this.gameState !== CONSTANTS.STATE.PLAYING) return;

        ctx.save();
        // Screen Space (Identity Transform)
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Overlay
        if (this.isPaused) {
            // Full screen dim (Before button/text for visibility)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Canvasでのテキスト描画を削除（HTMLオーバーレイへ移行）
            // PAUSED と RESUME の文字描画を削除
        }

        const r = this.getPauseButtonRect();

        // Draw Button (Toggle button visually)
        ctx.fillStyle = this.isPaused ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.4)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;

        // Button BG
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);

        // Button Text
        ctx.fillStyle = this.isPaused ? '#ffffff' : '#00ffff';
        ctx.font = 'bold 14px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = this.isPaused ? 10 : 0;
        ctx.fillText(this.isPaused ? "RESUME" : "PAUSE", r.x + r.w / 2, r.y + r.h / 2);
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    /**
     * アトラクターバフ集計（毎フレーム実行）
     * 範囲内のアトラクターをカウントし、減衰式でバフ倍率を算出
     */
    updateAttractorBuffs() {
        const cfg = CONSTANTS.ATTRACTOR;
        const radius = cfg.pullRadius || 200;
        const redBonus = cfg.RED_BONUS || 0.20;
        const blueBonus = cfg.BLUE_BONUS || 0.25;
        const stackMax = cfg.STACK_MAX || 3;
        const decay = cfg.DECAY || 0.7;

        // アトラクター一覧を抽出
        const attractors = this.enemies.filter(e =>
            e.active && e.type === CONSTANTS.ENEMY_TYPES.ATTRACTOR && e.attractorKind
        );

        // 全敵の倍率をリセット
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            enemy.damageMultiplier = 1.0;
            enemy.speedMultiplier = 1.0;
        }

        // 各敵について範囲内のアトラクターをカウント
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;

            // アトラクター自身はバフ対象外
            if (enemy.type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) continue;

            let redCount = 0;
            let blueCount = 0;

            for (const attractor of attractors) {
                const dx = enemy.x - attractor.x;
                const dy = enemy.y - attractor.y;
                const distSq = dx * dx + dy * dy;

                if (distSq <= radius * radius) {
                    if (attractor.attractorKind === CONSTANTS.ATTRACTOR_KIND.RED) {
                        redCount++;
                    } else if (attractor.attractorKind === CONSTANTS.ATTRACTOR_KIND.BLUE) {
                        blueCount++;
                    }
                }
            }

            // スタック上限適用
            redCount = Math.min(redCount, stackMax);
            blueCount = Math.min(blueCount, stackMax);

            // 減衰式で倍率算出: 1 + (base * stack * decay^(stack-1))
            if (redCount > 0) {
                enemy.damageMultiplier = 1 + (redBonus * redCount * Math.pow(decay, redCount - 1));
            }
            if (blueCount > 0) {
                enemy.speedMultiplier = 1 + (blueBonus * blueCount * Math.pow(decay, blueCount - 1));
            }
        }
    }

    /**
     * ミリ秒を mm:ss 形式に変換
     */
    formatTimeMMSS(ms) {
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // --- OPTIONS 関連メソッド [NEW] ---
    loadSettings() {
        const keys = CONSTANTS.STORAGE_KEYS;

        const seVal = localStorage.getItem(keys.SE_VOLUME);
        if (seVal !== null) this.settings.seVolume = parseFloat(seVal);

        const bgmVal = localStorage.getItem(keys.BGM_VOLUME);
        if (bgmVal !== null) this.settings.bgmVolume = parseFloat(bgmVal);

        const speedVal = localStorage.getItem(keys.GAME_SPEED);
        if (speedVal !== null) {
            const val = parseFloat(speedVal);
            if (this.speedOptions.includes(val)) this.settings.gameSpeed = val;
        }

        this.applySettings();
    }

    saveSettings() {
        const keys = CONSTANTS.STORAGE_KEYS;
        localStorage.setItem(keys.SE_VOLUME, this.settings.seVolume);
        localStorage.setItem(keys.BGM_VOLUME, this.settings.bgmVolume);
        localStorage.setItem(keys.GAME_SPEED, this.settings.gameSpeed);
    }

    applySettings() {
        this.audio.setSeVolume(this.settings.seVolume);
        this.audio.setBgmVolume(this.settings.bgmVolume);
        this.updateOptionsUI();
    }

    updateOptionsUI() {
        const sliderSe = document.getElementById('slider-se-volume');
        const labelSe = document.getElementById('label-se-volume');
        if (sliderSe) sliderSe.value = this.settings.seVolume * 100;

        const sliderBgm = document.getElementById('slider-bgm-volume');
        if (sliderBgm) sliderBgm.value = this.settings.bgmVolume * 100;
    }

    /**
     * [NEW] ゲームを終了する
     */
    exitGame() {
        const closed = window.close();

        // ブラウザ制限で閉じなかった場合のフォールバック（疑似終了画面）
        setTimeout(() => {
            document.body.innerHTML = `
                <div style="background:#000;color:#00ffff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Orbitron', 'Audiowide', sans-serif;text-align:center;padding:20px;box-sizing:border-box;">
                    <div style="padding:40px;border:2px solid #00ffff;border-radius:20px;box-shadow:0 0 50px rgba(0,255,255,0.3);max-width:400px;width:100%">
                        <h1 style="font-size:1.8rem;margin-bottom:20px;letter-spacing:4px;text-shadow:0 0 20px #00ffff">SYSTEM TERMINATED</h1>
                        <p style="color:#888;font-size:1rem;margin-bottom:40px;line-height:1.6">ご利用ありがとうございました。<br>ブラウザを閉じて終了してください。</p>
                        <button onclick="location.reload()" style="background:transparent;border:1px solid #00ffff;color:#00ffff;padding:12px 24px;cursor:pointer;font-family:inherit;font-size:1rem;font-weight:bold;transition:all 0.2s">REBOOT SYSTEM</button>
                    </div>
                </div>
            `;
        }, 100);
    }

    resetSettings() {
        this.settings.seVolume = 1.0;
        this.settings.bgmVolume = 1.0;
        this.settings.gameSpeed = 1.0;

        this.applySettings();
        this.saveSettings();
    }

    // --- HOW TO PLAY 関連メソッド [NEW] ---
    switchHowtoTab(tabName, silent = false) {
        if (!silent && this.audio) this.audio.playSe('SE_SELECT');
        const controlsTab = document.getElementById('btn-howto-tab-controls');
        const enemiesTab = document.getElementById('btn-howto-tab-enemies');
        const controlsPanel = document.getElementById('howto-tab-content-controls');
        const enemiesPanel = document.getElementById('howto-tab-content-enemies');

        if (!controlsTab || !enemiesTab || !controlsPanel || !enemiesPanel) return;

        if (tabName === 'controls') {
            controlsTab.classList.add('active');
            enemiesTab.classList.remove('active');
            controlsPanel.classList.remove('hidden');
            enemiesPanel.classList.add('hidden');
        } else {
            controlsTab.classList.remove('active');
            enemiesTab.classList.add('active');
            controlsPanel.classList.add('hidden');
            enemiesPanel.classList.remove('hidden');
            this.renderEnemyIntro();
        }
    }

    renderEnemyIntro() {
        const container = document.getElementById('enemy-intro-list');
        if (!container) return;

        // 既に生成済みの場合はスキップ（またはクリアして再生成）
        if (container.children.length > 0) return;

        const descriptions = CONSTANTS.ENEMY_DESCRIPTIONS;

        Object.keys(descriptions).forEach(type => {
            const data = descriptions[type];
            const card = document.createElement('div');
            card.className = 'enemy-card';

            // アセットキーを取得（ENEMY_A, ENEMY_B...）
            const assetKey = `ENEMY_${type}`;
            const img = this.assetLoader.get(assetKey);

            let iconHtml = '';
            if (img && img.complete && img.naturalWidth !== 0) {
                // 画像アセットが存在する場合
                iconHtml = `<img src="${img.src}" class="enemy-card-icon-img" alt="${data.name}">`;
            } else {
                // 存在しない場合は文字アイコン
                iconHtml = `<div class="enemy-card-icon">${type}</div>`;
            }

            // 危険度の★を生成
            const dangerStars = '★'.repeat(data.danger) + '☆'.repeat(5 - data.danger);

            card.innerHTML = `
                <div class="enemy-card-header">
                    ${iconHtml}
                    <div class="enemy-card-title-group">
                        <div class="enemy-card-jpname">${data.jpName}</div>
                        <div class="enemy-card-name">${data.name}</div>
                    </div>
                </div>
                <div class="enemy-card-desc">【特徴】${data.desc}</div>
                <div class="enemy-card-strategy">【対策】${data.strategy}</div>
                <div class="enemy-card-danger">危険度: ${dangerStars}</div>
            `;
            container.appendChild(card);
        });
    }
}


// グローバル公開 (デバッグ用)
window.Game = Game;
window.Simulator = Simulator;

const game = new Game();
window.game = game;
