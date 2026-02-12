import { CONSTANTS } from './constants.js';
import { Player } from './Player.js';
import { Bullet } from './Bullet.js';
import { Enemy } from './Enemy.js';
import { Gold } from './Gold.js';
import { DamageText } from './DamageText.js';
import { AudioManager } from './AudioManager.js';
import { Pool } from './Pool.js';
import { Effects } from './Effects.js';
import { Profiler } from './Profiler.js';
import { SpatialGrid } from './SpatialGrid.js';
import { ItemManager } from './ItemManager.js';

class Game {
    constructor() {
        console.log('Main.js FIX APPLIED: VERSION 2026-02-13-H');
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // キャンバスサイズ設定
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.player = new Player(CONSTANTS.TARGET_WIDTH / 2, CONSTANTS.TARGET_HEIGHT / 2);

        // オブジェクトプール
        this.bulletPool = new Pool(() => new Bullet(), 100);
        this.enemyPool = new Pool(() => new Enemy(), 300);
        this.goldPool = new Pool(() => new Gold(), 100);
        this.damageTextPool = new Pool(() => new DamageText(), 50);

        // アクティブなエンティティ
        this.bullets = [];
        this.enemies = [];
        this.golds = [];
        this.damageTexts = [];

        this.goldCount = 0;

        // 統計データ
        this.totalKills = 0;
        this.totalGoldEarned = 0;
        this.currentStage = 0;
        this.killCount = 0;

        // 進行管理
        this.gameState = CONSTANTS.STATE.TITLE;
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
        this.itemManager = new ItemManager();
        this.freezeTimer = 0;
        this.screenShakeTimer = 0;
        this.screenShakeIntensity = 0;

        this.initUI();
        this.audio = new AudioManager();
        this.generateStageButtons();
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));

        const upgradePanel = document.getElementById('upgrade-panel');
        if (upgradePanel) upgradePanel.classList.add('hidden');
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    initUI() {
        // タイトル画面：STARTボタン
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.addEventListener('click', async () => {
                await this.audio.init();
                this.audio.play('menu_select', { priority: 'high' });
                const titleScreen = document.getElementById('title-screen');
                if (titleScreen) titleScreen.classList.add('hidden');
                this.startCountdown();
            });
        }

        // 武器選択ボタン
        document.querySelectorAll('.weapon-up-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-up-weapon');
                const data = this.player.weapons[type];
                const config = CONSTANTS.WEAPON_CONFIG[type];

                if (!data.unlocked) {
                    if (this.goldCount >= config.unlockCost) {
                        this.goldCount -= config.unlockCost;
                        data.unlocked = true;
                        this.player.currentWeapon = type;
                        this.audio.play('upgrade');
                        this.spawnDamageText(this.player.x, this.player.y - 20, "UNLOCKED!", "#ffffff");
                    }
                } else {
                    if (this.player.currentWeapon === type) {
                        const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level);
                        if (this.goldCount >= cost && data.level < CONSTANTS.UPGRADE_LV_MAX) {
                            this.goldCount -= cost;
                            data.level++;
                            this.audio.play('upgrade');
                            this.spawnDamageText(this.player.x, this.player.y - 20, "POWER UP!", "#ffff00");
                        }
                    } else {
                        this.player.currentWeapon = type;
                        this.audio.play('menu_move');
                    }
                }
                this.updateUI();
            });
        });

        // SPEED強化ボタン
        document.getElementById('btn-up-speed').addEventListener('click', () => {
            const type = this.player.currentWeapon;
            const data = this.player.weapons[type];
            const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, data.atkSpeedLv);

            if (this.goldCount >= cost && data.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX) {
                this.goldCount -= cost;
                data.atkSpeedLv++;
                this.audio.play('upgrade');
                this.spawnDamageText(this.player.x, this.player.y - 20, "SPEED UP!", "#00ff88");
                this.updateUI();
            }
        });

        // 回転操作リスナー：マウスとタッチの両方に対応
        const handlePointerWrap = (e) => {
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;

                // ボタン類をクリックしたときはpreventDefaultしない（タップでのクリック操作を妨げない）
                const target = e.target;
                const isInteractive = target.tagName === 'BUTTON' || target.closest('button') || target.closest('.btn-stage');
                if (e.cancelable && !isInteractive) e.preventDefault();
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // UIエリア（hud, controls）やオーバーレイを触っている場合は回転させない
            const target = e.target;
            const isUI = target.closest('#hud') || target.closest('#controls') || target.closest('.overlay-base');
            if (isUI) return;

            const isAction = e.type === 'mousedown' || e.type === 'touchstart';
            this.handlePointer(clientX, clientY, isAction);
        };

        window.addEventListener('mousemove', handlePointerWrap);
        window.addEventListener('mousedown', handlePointerWrap);
        window.addEventListener('touchstart', handlePointerWrap, { passive: false });
        window.addEventListener('touchmove', handlePointerWrap, { passive: false });

        // リザルト等ボタン
        const btnNext = document.getElementById('btn-next');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (this.gameState === CONSTANTS.STATE.RESULT || this.gameState === CONSTANTS.STATE.GAME_OVER) {
                    location.reload();
                }
            });
        }

        // PULSEボタン
        const btnPulse = document.getElementById('btn-pulse');
        if (btnPulse) {
            btnPulse.addEventListener('click', () => {
                this.triggerPulse();
            });
        }

        // デバッグMAXボタン
        const btnDebugMax = document.getElementById('btn-debug-max');
        if (btnDebugMax) {
            btnDebugMax.addEventListener('click', (e) => {
                e.stopPropagation();
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
                this.audio.play('menu_move');
                this.updateUI();
            }
        }, { passive: true });
    }

    handlePointer(clientX, clientY, isAction = false) {
        const rect = this.canvas.getBoundingClientRect();
        const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
        const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;

        // アイテム取得を試行 (クリック/タップ時のみ)
        if (isAction) {
            const picked = this.itemManager.tryPickup(clientX, clientY, rect, scale, offsetX, this.player, this);
            if (picked) return; // アイテムを取った場合は移動/射撃を行わない
        }

        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        // 仮想空間上の座標へ逆写像
        this.player.targetX = (mouseX - offsetX) / scale;
        this.player.targetY = mouseY / scale;
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
                this.audio.play('menu_select', { priority: 'high' });
                const titleScreen = document.getElementById('title-screen');
                if (titleScreen) titleScreen.classList.add('hidden');
                this.currentStage = index;
                this.startCountdown();
            });

            list.appendChild(btn);
        });
    }

    getUpgradeCost(base, level) {
        return Math.round(base * Math.pow(CONSTANTS.UPGRADE_COST_BASE, level - 1));
    }

    startWave() {
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];

        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.bullets.forEach(b => this.bulletPool.release(b));
        this.bullets = [];
        this.golds.forEach(g => this.goldPool.release(g));
        this.golds = [];

        this.enemiesRemaining = Math.round(stageData.enemyCount * stageData.spawnMul);
        this.spawnTimer = 0;
        this.stageTime = 0;
        this.killCount = 0;

        if ((this.currentStage + 1) % 5 === 0) {
            this.spawnBoss();
        }

        // 初期セクタの設定
        this.sectors = [{
            centerDeg: Math.random() * 360,
            timer: CONSTANTS.SPAWN_SECTOR_DURATION_MS
        }];
        this.spawnPhase = 'BURST';
        this.phaseTimer = CONSTANTS.SPAWN_BURST_TIME_MS;
        this.spawnQueue = 0;
        this.currentSpawnBudget = CONSTANTS.SPAWN_BUDGET_PER_SEC;
        this.pulseCooldownTimer = 0;
        this.pulseEffects = [];

        this.gameState = CONSTANTS.STATE.PLAYING;
        // デバッグHUDの表示（必要に応じて）
        const dbHud = document.getElementById('debug-hud');
        if (dbHud) dbHud.classList.remove('hidden');

        this.updateUI();
    }

    startNextWave() {
        this.currentStage++;
        if (this.currentStage < CONSTANTS.STAGE_DATA.length) {
            this.startCountdown();
        } else {
            this.showOverlay('ALL STAGE CLEAR!', '地球の平和は守られました', 'result');
        }
    }

    startCountdown() {
        this.gameState = CONSTANTS.STATE.COUNTDOWN;
        const overlay = document.getElementById('countdown');
        const text = document.getElementById('countdown-text');
        const sub = document.getElementById('countdown-sub');

        sub.textContent = `STAGE ${this.currentStage + 1}`;
        overlay.classList.remove('hidden');

        let count = 3;
        const process = () => {
            if (count > 0) {
                this.audio.play('countdown');
                text.textContent = count;
                count--;
                setTimeout(process, 1000);
            } else if (count === 0) {
                this.audio.play('countdown_start');
                text.textContent = "START!";
                count--;
                setTimeout(process, 1000);
            } else {
                overlay.classList.add('hidden');
                this.startWave();
            }
        };
        process();
    }

    stageClear() {
        this.gameState = CONSTANTS.STATE.WAVE_CLEAR_CUTIN;
        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.showCutIn('STAGE CLEAR!', () => {
            this.startNextWave();
        });
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

        if (type === 'result') {
            this.gameState = CONSTANTS.STATE.RESULT;
            statsArea.classList.remove('hidden');
            document.getElementById('stat-kills').textContent = this.totalKills;
            document.getElementById('stat-gold').textContent = this.totalGoldEarned;
            document.getElementById('stat-stage').textContent = `STAGE ${this.currentStage + 1}`;
        }
    }

    spawnEnemy(fromQueue = false) {
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT) {
            if (!fromQueue && this.spawnQueue < CONSTANTS.SPAWN_QUEUE_MAX) this.spawnQueue++;
            return;
        }

        // セクタの選択
        const sector = this.sectors[Math.floor(Math.random() * this.sectors.length)];
        const sectorCenter = sector ? sector.centerDeg : Math.random() * 360;

        let found = false;
        let x, y;
        const margin = 50;
        const maxTries = 3;

        for (let i = 0; i < maxTries; i++) {
            // セクタ範囲内での角度決定
            const angleDeg = sectorCenter + (Math.random() - 0.5) * CONSTANTS.SPAWN_SECTOR_ANGLE;
            const angleRad = angleDeg * (Math.PI / 180);

            // 画面外周の矩形上の点へ投影（簡易計算：十分遠い距離から中心へ）
            // 物理的に画面の端を指定する
            const dist = 600; // 画面の中心(400,400)から十分外側
            const tx = 400 + Math.cos(angleRad) * dist;
            const ty = 400 + Math.sin(angleRad) * dist;

            // クランプして外周に張り付ける
            x = Math.max(-margin, Math.min(CONSTANTS.TARGET_WIDTH + margin, tx));
            y = Math.max(-margin, Math.min(CONSTANTS.TARGET_HEIGHT + margin, ty));

            // SAFE_RADIUS チェック (プレイヤー周辺 120px)
            const dx = x - this.player.x;
            const dy = y - this.player.y;
            if (dx * dx + dy * dy > CONSTANTS.SPAWN_SAFE_RADIUS * CONSTANTS.SPAWN_SAFE_RADIUS) {
                found = true;
                break;
            }
        }

        if (!found) {
            if (!fromQueue && this.spawnQueue < CONSTANTS.SPAWN_QUEUE_MAX) this.spawnQueue++;
            return;
        }

        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const enemy = this.enemyPool.get();
        if (enemy) {
            let type = CONSTANTS.ENEMY_TYPES.NORMAL;
            const rand = Math.random();

            if (rand < 0.1) {
                type = CONSTANTS.ENEMY_TYPES.ELITE;
            } else {
                const typeRand = Math.random();
                if (typeRand < 0.1) type = CONSTANTS.ENEMY_TYPES.ZIGZAG;
                else if (typeRand < 0.2) type = CONSTANTS.ENEMY_TYPES.EVASIVE;
                else if (typeRand < 0.25) type = CONSTANTS.ENEMY_TYPES.ASSAULT;
                else if (typeRand < 0.30) type = CONSTANTS.ENEMY_TYPES.DASHER;
                else if (typeRand < 0.35) type = CONSTANTS.ENEMY_TYPES.ORBITER;
                else if (typeRand < 0.40) type = CONSTANTS.ENEMY_TYPES.SPLITTER;
                else if (this.currentStage >= 4 && typeRand < 0.45) type = CONSTANTS.ENEMY_TYPES.SHIELDER;
                else if (this.currentStage >= 7 && typeRand < 0.47) type = CONSTANTS.ENEMY_TYPES.GUARDIAN;
                else if (this.currentStage >= 5 && typeRand < 0.52) type = CONSTANTS.ENEMY_TYPES.OBSERVER;

                // 同時出現上限チェック
                const limits = CONSTANTS.SPAWN_LIMITS;
                if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
                    const count = this.enemies.filter(e => e.active && e.type === type).length;
                    if (count >= limits.GUARDIAN) type = CONSTANTS.ENEMY_TYPES.NORMAL;
                } else if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) {
                    const count = this.enemies.filter(e => e.active && e.type === type).length;
                    if (count >= limits.SHIELDER) type = CONSTANTS.ENEMY_TYPES.NORMAL;
                } else if (type === CONSTANTS.ENEMY_TYPES.ORBITER) {
                    const count = this.enemies.filter(e => e.active && e.type === type).length;
                    if (count >= limits.ORBITER) type = CONSTANTS.ENEMY_TYPES.NORMAL;
                } else if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) {
                    const count = this.enemies.filter(e => e.active && e.type === type).length;
                    if (count >= limits.OBSERVER) type = CONSTANTS.ENEMY_TYPES.NORMAL;
                }
            }

            const affinity = this.getSpawnAffinity();
            enemy.init(x, y, this.player.x, this.player.y, type, stageData.hpMul, stageData.speedMul, affinity);
            this.enemies.push(enemy);
            this.enemiesRemaining--; // 敵をスポーンしたので残数を減らす
            this.currentSpawnBudget -= 1; // 予算を消費
        }
    }

    getSpawnAffinity() {
        let rates = CONSTANTS.AFFINITY_SPAWN_RATES[0].rates;
        for (let i = CONSTANTS.AFFINITY_SPAWN_RATES.length - 1; i >= 0; i--) {
            if (this.currentStage >= CONSTANTS.AFFINITY_SPAWN_RATES[i].stage) {
                rates = CONSTANTS.AFFINITY_SPAWN_RATES[i].rates;
                break;
            }
        }
        const rand = Math.random();
        if (rand < rates[0]) return CONSTANTS.ENEMY_AFFINITIES.SWARM;
        if (rand < rates[0] + rates[1]) return CONSTANTS.ENEMY_AFFINITIES.ARMORED;
        return CONSTANTS.ENEMY_AFFINITIES.PHASE;
    }

    spawnFormation(fType, centerDeg) {
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const angleRad = centerDeg * (Math.PI / 180);

        // 隊形ごとの数と移動タイプを決定
        let count = 0;
        let mvType = CONSTANTS.ENEMY_MOVEMENT_TYPES.STRAIGHT;

        // 後半(Stage6-)は INVADER 確率アップ
        const invaderChance = (this.currentStage >= 5) ? 0.25 : 0.05;
        if (Math.random() < invaderChance) mvType = CONSTANTS.ENEMY_MOVEMENT_TYPES.INVADER;

        if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.LINEAR) {
            count = Math.floor(5 + Math.random() * 8); // 5-12
        } else if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.PARALLEL) {
            count = Math.floor(5 + Math.random() * 6); // 5-10
        } else if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.V_SHAPE) {
            count = 7; // 1 + 3 + 3
        }

        // 予算と制限のチェック
        if (this.enemiesRemaining < count) count = this.enemiesRemaining;
        if (this.enemies.length + count >= CONSTANTS.ENEMY_LIMIT) {
            count = Math.max(0, CONSTANTS.ENEMY_LIMIT - this.enemies.length);
        }
        if (count <= 0) return;

        const margin = 50;
        const dist = 600; // 外周の距離
        const startX = CONSTANTS.TARGET_WIDTH / 2 + Math.cos(angleRad) * dist;
        const startY = CONSTANTS.TARGET_HEIGHT / 2 + Math.sin(angleRad) * dist;

        // 隊形全体で属性を統一
        const fAffinity = this.getSpawnAffinity();
        // 位相を揃えることで隊形全体のうねりを表現
        const sharedPhase = Math.random() * Math.PI * 2;

        for (let i = 0; i < count; i++) {
            let ex = startX;
            let ey = startY;

            if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.LINEAR) {
                // 列：放射方向に間隔をあける (先行と追従)
                const spacing = 35;
                ex += Math.cos(angleRad) * (i * spacing);
                ey += Math.sin(angleRad) * (i * spacing);
            } else if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.PARALLEL) {
                // 壁：接線方向に横並び
                const spacing = 45;
                const perpAngle = angleRad + Math.PI / 2;
                const offset = (i - (count - 1) / 2) * spacing;
                ex += Math.cos(perpAngle) * offset;
                ey += Math.sin(perpAngle) * offset;
            } else if (fType === CONSTANTS.ENEMY_FORMATION_TYPES.V_SHAPE) {
                // V字
                const spacing = 40;
                const perpAngle = angleRad + Math.PI / 2;
                const depthSpacing = 30;
                if (i !== 0) {
                    const side = (i % 2 === 0) ? 1 : -1;
                    const step = Math.ceil(i / 2);
                    ex += Math.cos(perpAngle) * (step * spacing * side);
                    ey += Math.sin(perpAngle) * (step * spacing * side);
                    ex += Math.cos(angleRad) * (step * depthSpacing);
                    ey += Math.sin(angleRad) * (step * depthSpacing);
                }
            }

            // マージンでクランプ
            ex = Math.max(-margin, Math.min(CONSTANTS.TARGET_WIDTH + margin, ex));
            ey = Math.max(-margin, Math.min(CONSTANTS.TARGET_HEIGHT + margin, ey));

            // SAFE_RADIUS チェック
            const dx = ex - this.player.x;
            const dy = ey - this.player.y;
            if (dx * dx + dy * dy < CONSTANTS.SPAWN_SAFE_RADIUS * CONSTANTS.SPAWN_SAFE_RADIUS) continue;

            const enemy = this.enemyPool.get();
            if (enemy) {
                enemy.init(ex, ey, this.player.x, this.player.y, CONSTANTS.ENEMY_TYPES.NORMAL, stageData.hpMul, stageData.speedMul, fAffinity);
                enemy.movementType = mvType;
                enemy.movementPhase = sharedPhase;
                this.enemies.push(enemy);
                this.enemiesRemaining--;
                this.currentSpawnBudget -= 1;
            }
        }
    }

    spawnBoss() {
        const x = CONSTANTS.TARGET_WIDTH / 2;
        const y = -150;
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const boss = this.enemyPool.get();
        if (boss) {
            boss.initBoss(x, y, this.player.x, this.player.y, stageData.hpMul, (bx, by) => {
                this.handleBossSummon(bx, by);
            });
            this.enemies.push(boss);
        }
    }

    handleBossSummon(bx, by) {
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT - CONSTANTS.BOSS_SUMMON_COUNT) return;
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];

        for (let i = 0; i < CONSTANTS.BOSS_SUMMON_COUNT; i++) {
            const enemy = this.enemyPool.get();
            if (enemy) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 120 + Math.random() * 60;
                const sx = bx + Math.cos(angle) * dist;
                const sy = by + Math.sin(angle) * dist;
                enemy.init(sx, sy, this.player.x, this.player.y, CONSTANTS.ENEMY_TYPES.NORMAL, stageData.hpMul * 0.5, stageData.speedMul);
                this.enemies.push(enemy);
            }
        }
    }

    shoot() {
        if (this.bullets.length >= CONSTANTS.BULLET_LIMIT) return;
        const weaponType = this.player.currentWeapon;
        const stats = this.player.getWeaponStats();

        if (weaponType === CONSTANTS.WEAPON_TYPES.SHOT) {
            const count = (this.player.weapons.shot.level >= 30) ? 4 : 3;
            const spread = stats.shotAngle || 0.2;
            const startAngle = this.player.angle - (spread * (count - 1) / 2);

            for (let i = 0; i < count; i++) {
                if (this.bullets.length < CONSTANTS.BULLET_LIMIT) {
                    const b = this.bulletPool.get();
                    const angle = startAngle + spread * i;
                    b.init(this.player.x, this.player.y, angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, stats);
                    this.bullets.push(b);
                }
            }
        } else if (weaponType === CONSTANTS.WEAPON_TYPES.PIERCE && this.player.weapons.pierce.level >= 30) {
            // Lv30でレーザーが太くなる
            const b = this.bulletPool.get();
            b.init(this.player.x, this.player.y, this.player.angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, { ...stats, hitWidthMul: 2.0 });
            this.bullets.push(b);
        } else {
            const b = this.bulletPool.get();
            b.init(this.player.x, this.player.y, this.player.angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType, stats);
            this.bullets.push(b);
        }

        this.audio.play('shoot', { variation: 0.1, priority: 'low' });
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
        if (this.gameState === CONSTANTS.STATE.TITLE || this.gameState === CONSTANTS.STATE.COUNTDOWN || this.gameState === CONSTANTS.STATE.RESULT) return;

        this.optimizationFrameCount++;

        // グリッド構築
        Profiler.start('grid_build');
        this.grid.build(this.enemies);
        Profiler.end('grid_build');

        // シールド判定のキャッシュ更新 (3フレームに1回)
        if (this.optimizationFrameCount % 3 === 0) {
            Profiler.start('shield_update');
            this.updateShieldCache();
            Profiler.end('shield_update');
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

        if (this.gameState === CONSTANTS.STATE.WAVE_CLEAR_CUTIN) {
            this.player.update(dt);
            this.bullets.forEach(b => b.update());
            this.golds.forEach(g => g.update(this.player.x, this.player.y));
            this.damageTexts.forEach(d => d.update());
            this.cleanupEntities();
            return;
        }

        if (this.gameState !== CONSTANTS.STATE.PLAYING) return;

        if (this.globalMarkTimer > 0) this.globalMarkTimer -= dt;

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
        if (this.enemiesRemaining > 0 || this.spawnQueue > 0 || isBossStage) {
            this.updateSpawningSystem(dt);
        }
        this.processSpawnQueue(dt);
        Profiler.end('spawning');

        const globalMarkActive = this.globalMarkTimer > 0;
        const globalGuardBuffActive = this.enemies.some(p =>
            p.active && p.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && p.barrierState === 'active'
        );

        Profiler.start('bullet_update');
        this.bullets.forEach(b => b.update());
        Profiler.end('bullet_update');

        Profiler.start('enemy_update');
        this.enemies.forEach(e => {
            if (e.active) {
                e.update(this.player.x, this.player.y, this.player.angle, dt, {
                    globalGuardBuffActive,
                    globalMarkActive,
                    isFrozen: this.freezeTimer > 0
                });
                if (e.didMark) {
                    this.globalMarkTimer = Math.max(this.globalMarkTimer, CONSTANTS.OBSERVER.globalBuffDurationMs);
                    e.didMark = false;
                }
            }
        });
        Profiler.end('enemy_update');

        this.golds.forEach(g => g.update(this.player.x, this.player.y));
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

        Profiler.start('collision');
        this.handleCollisions(dt);
        Profiler.end('collision');

        Profiler.start('cleanup');
        this.cleanupEntities();
        Profiler.end('cleanup');

        if (isBossStage) {
            // ボスステージではボスが死んでいれば handleCollisions 内で stageClear が呼ばれる
        } else {
            if (this.enemiesRemaining <= 0 && this.enemies.length === 0) {
                this.stageClear();
            }

            // デバッグ用：詰まっている可能性があればコンソールに出力
            // フェイルセーフ：あまりにも遠くに行った敵、またはNaN座標の敵は消滅させる
            if (this.enemiesRemaining <= 0 && this.enemies.length > 0) {
                for (let i = this.enemies.length - 1; i >= 0; i--) {
                    const e = this.enemies[i];
                    if (!e.active) continue;

                    // NaNチェック
                    if (isNaN(e.x) || isNaN(e.y)) {
                        console.warn("Retiring NaN enemy:", e);
                        e.destroy('glitch', this);
                        continue;
                    }

                    // 距離チェック (画面対角の約3倍)
                    const distSq = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
                    if (distSq > 2400 * 2400) { // 2400px
                        console.warn("Retiring stuck enemy (too far):", e.type, e.x, e.y);
                        e.destroy('glitch', this);
                    }
                }
            }
        }

        if (this.player.hp <= 0) {
            this.showOverlay('GAME OVER', '基地が破壊されました', 'result');
        }

        // フェイルセーフ: 敵が全滅しているのにカウントが残っている、またはその逆の整合性をチェック
        if (this.enemiesRemaining <= 0 && this.spawnQueue <= 0 && !this.enemies.some(e => e.active)) {
            if (this.gameState === CONSTANTS.STATE.PLAYING && !isBossStage) {
                this.stageClear();
            }
        }

        this.updateUI();
    }

    handleCollisions(dt) {
        // SpatialGrid を利用した最適化した衝突判定
        const globalMarkActive = this.globalMarkTimer > 0;
        const globalGuardBuffActive = this.enemies.some(p =>
            p.active && p.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && p.barrierState === 'active'
        );
        const globalBuffActive = globalGuardBuffActive || globalMarkActive;

        // 弾 vs 敵
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active) continue;

            const candidates = this.grid.queryEnemiesNear(b.x, b.y);

            for (let j = 0; j < candidates.length; j++) {
                const e = candidates[j];
                if (!e.active || b.hitEnemies.has(e)) continue;

                Profiler.counts.bulletEnemyChecks++; // 計測カウント

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

                    // キャッシュされたシールド状態を参照 (some を排除)
                    // options.isAuraProtected は Shielder のオーラのみを指すように修正
                    e.takeDamage(damage, {
                        globalBuffActive,
                        isAuraProtected: e.isShielded
                    });

                    this.audio.play('hit', { variation: 0.2, priority: 'low' });
                    b.hitEnemies.add(e);

                    let textColor = '#fff';
                    if (affinityMul > 1.0) textColor = '#ffcc00';
                    else if (affinityMul < 1.0) textColor = '#888888';

                    this.spawnDamageText(e.renderX, e.renderY, Math.round(damage), textColor);

                    const weaponConfig = CONSTANTS.WEAPON_CONFIG[b.weaponType];
                    const knockMulBase = CONSTANTS.AFFINITY_KNOCK_MATRIX[b.weaponType][e.affinity] || 1.0;
                    let knockPower = CONSTANTS.ENEMY_KNOCKBACK_POWER * weaponConfig.knockMul * knockMulBase;

                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.SHOT && this.player.weapons.shot.level > 10) {
                        const stats = this.player.getWeaponStats();
                        knockPower *= (stats.knockMul || 1.0);
                    } else if (b.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE && this.player.weapons.pierce.level > 25) {
                        knockPower = 1.0;
                    }

                    e.applyKnockback(b.vx, b.vy, knockPower);

                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.STANDARD) {
                        const recoverAmount = CONSTANTS.PLAYER_MAX_HP * CONSTANTS.STANDARD_RECOVERY_ON_HIT;
                        this.player.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.player.hp + recoverAmount);
                    }

                    if (e.hp <= 0 && e.active) {
                        e.destroy('bullet', this);
                    }

                    b.pierceCount--;
                    if (b.pierceCount < 0) {
                        b.active = false;
                        break;
                    }
                }
            }
        }

        const now = Date.now();
        this.enemies.forEach(e => {
            if (!e.active) return;
            const dx = this.player.x - e.renderX;
            const dy = this.player.y - e.renderY;
            const distSq = dx * dx + dy * dy;
            const size = e.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
            const minDist = CONSTANTS.PLAYER_SIZE + size;

            Profiler.counts.enemyBarrierChecks++;
            if (distSq < minDist * minDist) {
                if (now - e.lastContactTime > CONSTANTS.ENEMY_CONTACT_COOLDOWN_MS) {
                    this.player.takeDamage(CONSTANTS.ENEMY_DAMAGE_RATIO);
                    this.audio.play('damage', { priority: 'high' });
                    this.spawnDamageText(this.player.x, this.player.y, '!', '#ff0000');
                    e.lastContactTime = now;
                }
            }

            // バリア近接防御判定
            if (distSq < CONSTANTS.BARRIER_RADIUS * CONSTANTS.BARRIER_RADIUS) {
                let damage = CONSTANTS.BARRIER_DPS * (dt / 1000);
                if (e.isBoss) damage *= 0.5;

                e.takeDamage(damage, { globalBuffActive, isAuraProtected: e.isShielded });

                const canInstantKill = CONSTANTS.BARRIER_INSTANT_KILL_TYPES.includes(e.type) &&
                    !this.player.barrierKillConsumedThisFrame &&
                    this.player.barrierCharges > 0;

                if (canInstantKill) {
                    this.player.barrierCharges--;
                    this.player.barrierKillConsumedThisFrame = true;
                    this.audio.play('barrier_hit', { variation: 0.1 });
                    this.spawnDamageText(e.renderX, e.renderY, "PURIFY", "#ffffff");
                    e.destroy('barrier', this);
                } else {
                    if (Math.random() < 0.1) {
                        this.spawnDamageText(e.renderX, e.renderY, ".", "#ffffff");
                    }
                    const dist = Math.sqrt(distSq);
                    if (dist > 0) {
                        const vx = (e.renderX - this.player.x) / dist;
                        const vy = (e.renderY - this.player.y) / dist;
                        e.applyKnockback(vx, vy, CONSTANTS.BARRIER_KNOCKBACK * (dt / 16.6));
                    }
                    if (e.hp <= 0 && e.active) {
                        e.destroy('barrier_damage', this);
                    }
                }
            }
        });

        for (let k = this.golds.length - 1; k >= 0; k--) {
            const g = this.golds[k];
            const dx = this.player.x - g.x;
            const dy = this.player.y - g.y;
            const distSq = dx * dx + dy * dy;
            const minDist = CONSTANTS.PLAYER_SIZE + CONSTANTS.GOLD_SIZE / 2;
            if (distSq < minDist * minDist) {
                this.goldCount += 10;
                this.totalGoldEarned += 10;
                this.audio.play('gold_collect', { variation: 0.1, priority: 'low' });
                this.goldPool.release(this.golds.splice(k, 1)[0]);
            }
        }
    }

    updateShieldCache() {
        const activeShielders = this.enemies.filter(p =>
            p.active && p.type === CONSTANTS.ENEMY_TYPES.SHIELDER && p.barrierState === 'active'
        );
        const globalMarkActive = this.globalMarkTimer > 0;
        const globalGuardBuffActive = this.enemies.some(p =>
            p.active && p.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && p.barrierState === 'active'
        );
        const globalBuffActive = globalGuardBuffActive || globalMarkActive;

        const auraRadiusSq = Math.pow(CONSTANTS.SHIELDER.auraRadius + CONSTANTS.ENEMY_SIZE, 2);

        for (let j = 0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (!e.active) continue;

            // 全体バフが有効でも、オーラ保護 (90%軽減) は Shielder が近くにいる場合のみにする
            e.isShielded = false;
            if (activeShielders.length > 0) {
                const candidates = this.grid.queryEnemiesNear(e.renderX, e.renderY);
                e.isShielded = candidates.some(p =>
                    p.active && p.type === CONSTANTS.ENEMY_TYPES.SHIELDER && p.barrierState === 'active' &&
                    (Math.pow(p.renderX - e.renderX, 2) + Math.pow(p.renderY - e.renderY, 2)) < auraRadiusSq
                );
            }
        }
    }

    cleanupEntities() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active || b.x < -100 || b.x > CONSTANTS.TARGET_WIDTH + 100 || b.y < -100 || b.y > CONSTANTS.TARGET_HEIGHT + 100) {
                this.bulletPool.release(this.bullets.splice(i, 1)[0]);
            }
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.active || e.x < -300 || e.x > CONSTANTS.TARGET_WIDTH + 300 || e.y < -300 || e.y > CONSTANTS.TARGET_HEIGHT + 300) {
                this.enemyPool.release(this.enemies.splice(i, 1)[0]);
            }
        }
        for (let i = this.damageTexts.length - 1; i >= 0; i--) {
            if (!this.damageTexts[i].active) {
                this.damageTextPool.release(this.damageTexts.splice(i, 1)[0]);
            }
        }
    }

    updateSpawningSystem(dt) {
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const is2Sector = (this.currentStage + 1) >= CONSTANTS.STAGE_2SECTOR_START;

        // 予算の回復 (1秒ごとに SPAWN_BUDGET_PER_SEC 回復)
        this.currentSpawnBudget = Math.min(CONSTANTS.SPAWN_BUDGET_PER_SEC, this.currentSpawnBudget + (CONSTANTS.SPAWN_BUDGET_PER_SEC * dt / 1000));

        // セクタ管理
        if (this.sectors.length === 0) {
            this.sectors.push({ centerDeg: Math.random() * 360, timer: CONSTANTS.SPAWN_SECTOR_DURATION_MS });
        }
        if (is2Sector && this.sectors.length < 2) {
            this.addSecondSector();
        }

        this.sectors.forEach(s => {
            s.timer -= dt;
            if (s.timer <= 0) {
                this.rotateSector(s);
            }
        });

        // リズム管理 (BURST/COOL)
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
            if (this.spawnPhase === 'BURST') {
                this.spawnPhase = 'COOL';
                this.phaseTimer = CONSTANTS.SPAWN_COOL_TIME_MS;
            } else {
                this.spawnPhase = 'BURST';
                this.phaseTimer = CONSTANTS.SPAWN_BURST_TIME_MS;
            }
        }

        // ソフトキャップによる強制COOL
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT * CONSTANTS.ACTIVE_ENEMIES_SOFT_CAP_RATIO) {
            if (this.spawnPhase === 'BURST') {
                this.spawnPhase = 'COOL';
                this.phaseTimer = CONSTANTS.SPAWN_COOL_TIME_MS;
            }
        }

        // スポーン実行(BURST中のみ)
        if (this.spawnPhase === 'BURST' && this.enemiesRemaining > 0) {
            this.spawnTimer += dt;
            if (this.spawnTimer >= stageData.spawnInterval) {
                // 密度チェック
                let dangerCount = 0;
                this.enemies.forEach(e => {
                    const dx = e.renderX - this.player.x;
                    const dy = e.renderY - this.player.y;
                    if (dx * dx + dy * dy < CONSTANTS.SPAWN_DANGER_RADIUS * CONSTANTS.SPAWN_DANGER_RADIUS) {
                        dangerCount++;
                    }
                });

                // 密度上限または予算不足ならキューへ
                if (dangerCount >= CONSTANTS.DANGER_CAP || this.currentSpawnBudget < 1) {
                    if (this.spawnQueue < CONSTANTS.SPAWN_QUEUE_MAX) {
                        this.spawnQueue++;
                        this.enemiesRemaining--;
                    }
                } else {
                    // 隊形スポーンの抽選 (Stage 3以降、15%の確率)
                    const formationChance = (this.currentStage >= 2) ? 0.15 : 0;
                    if (Math.random() < formationChance && this.currentSpawnBudget >= 5) {
                        const s = this.sectors[Math.floor(Math.random() * this.sectors.length)];
                        const angle = s.centerDeg + (Math.random() - 0.5) * CONSTANTS.SPAWN_SECTOR_ANGLE;
                        const fTypes = [
                            CONSTANTS.ENEMY_FORMATION_TYPES.LINEAR,
                            CONSTANTS.ENEMY_FORMATION_TYPES.PARALLEL,
                            CONSTANTS.ENEMY_FORMATION_TYPES.V_SHAPE
                        ];
                        const fType = fTypes[Math.floor(Math.random() * fTypes.length)];
                        this.spawnFormation(fType, angle);
                    } else {
                        this.spawnEnemy();
                        this.currentSpawnBudget -= 1;
                        this.enemiesRemaining--;
                    }
                }
                this.spawnTimer = 0;
            }
        }
    }

    addSecondSector() {
        let newCenter = Math.random() * 360;
        const first = this.sectors[0].centerDeg;
        // 90度以上の差をつける
        let diff = Math.abs(newCenter - first);
        if (diff > 180) diff = 360 - diff;
        if (diff < CONSTANTS.SPAWN_SECTOR_MIN_SEP_DEG) {
            newCenter = (first + 180) % 360; // とりあえず真逆に配置
        }
        this.sectors.push({ centerDeg: newCenter, timer: CONSTANTS.SPAWN_SECTOR_DURATION_MS });
    }

    rotateSector(s) {
        // ±90度以内で移動
        const move = (Math.random() - 0.5) * 180;
        let newCenter = (s.centerDeg + move + 360) % 360;

        // 2セクタ時は互いに離す
        if (this.sectors.length > 1) {
            const other = this.sectors.find(x => x !== s);
            let diff = Math.abs(newCenter - other.centerDeg);
            if (diff > 180) diff = 360 - diff;
            if (diff < CONSTANTS.SPAWN_SECTOR_MIN_SEP_DEG) {
                // 離す方向に調整
                newCenter = (other.centerDeg + CONSTANTS.SPAWN_SECTOR_MIN_SEP_DEG + 360) % 360;
            }
        }
        s.centerDeg = newCenter;
        s.timer = CONSTANTS.SPAWN_SECTOR_DURATION_MS;
    }

    processSpawnQueue(dt) {
        if (this.spawnQueue <= 0) return;

        // 予算チェック
        if (this.currentSpawnBudget < 1) return;

        // 密度判定 (DANGER_RADIUS内の敵数)
        let countInDanger = 0;
        this.enemies.forEach(e => {
            const dx = e.renderX - this.player.x;
            const dy = e.renderY - this.player.y;
            if (dx * dx + dy * dy < CONSTANTS.SPAWN_DANGER_RADIUS * CONSTANTS.SPAWN_DANGER_RADIUS) {
                countInDanger++;
            }
        });

        // 密集しすぎ、または予算不足なら放出しない
        if (countInDanger >= CONSTANTS.DANGER_CAP) return;

        this.releaseTimer += dt;
        const releaseInterval = 1000 / CONSTANTS.SPAWN_RELEASE_PER_SEC_MAX;

        if (this.releaseTimer >= releaseInterval) {
            const count = Math.min(this.spawnQueue, CONSTANTS.SPAWN_RELEASE_PER_FRAME_MAX, Math.floor(this.currentSpawnBudget));
            for (let i = 0; i < count; i++) {
                this.spawnEnemy(true); // キューからの放出
                this.spawnQueue--;
                this.currentSpawnBudget -= 1;
            }
            this.releaseTimer = 0;
        }
    }

    triggerPulse() {
        if (this.pulseCooldownTimer > 0) return;

        // 200ms 連続再生制限 (AudioManager 側の 60ms を上書き)
        const now = Date.now();
        if (this.lastPulseSoundTime && now - this.lastPulseSoundTime < 200) return;
        this.lastPulseSoundTime = now;

        this.audio.play('pulse_knockback', { priority: 'high' });
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
                const vx = dx / dist;
                const vy = dy / dist;

                // 距離減衰ノックバック
                const ratio = 1 - (dist / radius);
                const falloff = Math.pow(ratio, kbParams.FALLOFF_POWER);
                const factor = Math.max(kbParams.MIN_FACTOR, falloff);
                const knockPower = CONSTANTS.PULSE_KNOCKBACK * factor;

                e.applyKnockback(vx, vy, knockPower);
                e.pulseOutlineTimer = vfx.OUTLINE_MS;
                this.spawnDamageText(e.renderX, e.renderY, "PUSH!", "#ff8800");
            }
        });
    }

    updateUI() {
        const hpPercent = (this.player.hp / CONSTANTS.PLAYER_MAX_HP) * 100;
        document.getElementById('hp-bar-fill').style.width = Math.max(0, hpPercent) + '%';
        document.getElementById('gold-count').textContent = this.goldCount;
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
                costSpan.textContent = `${config.unlockCost} G`;
                btn.classList.toggle('disabled', this.goldCount < config.unlockCost);
            } else {
                const cost = this.getUpgradeCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level);
                lvSpan.textContent = `Lv.${data.level}`;
                costSpan.textContent = data.level < CONSTANTS.UPGRADE_LV_MAX ? `${cost} G` : 'MAX';
                btn.classList.toggle('disabled', this.goldCount < cost && data.level < CONSTANTS.UPGRADE_LV_MAX);
            }
        });

        this.updateUpgradeUI();
    }

    updateUpgradeUI() {
        const cur = this.player.weapons[this.player.currentWeapon];
        const weaponCost = this.getUpgradeCost(CONSTANTS.UPGRADE_WEAPON_BASE, cur.level);
        const spdCost = this.getUpgradeCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, cur.atkSpeedLv);

        document.getElementById('speed-up-lv').textContent = cur.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX ? `Lv.${cur.atkSpeedLv}` : 'MAX';
        document.getElementById('cost-speed').textContent = cur.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX ? `${spdCost} G` : 'MAX';
        document.getElementById('btn-up-speed').classList.toggle('disabled', this.goldCount < spdCost || cur.atkSpeedLv >= CONSTANTS.UPGRADE_LV_MAX);

        // パルスUI更新
        const btnPulse = document.getElementById('btn-pulse');
        if (btnPulse) {
            btnPulse.classList.toggle('disabled', this.pulseCooldownTimer > 0);
            const fill = document.getElementById('pulse-cd-fill');
            const percent = (this.pulseCooldownTimer / CONSTANTS.PULSE_COOLDOWN_MS) * 100;
            fill.style.width = Math.max(0, percent) + '%';
        }

        this.updateDebugHUD();
    }

    updateDebugHUD() {
        const dbEnemies = document.getElementById('db-enemies');
        if (!dbEnemies) return;

        dbEnemies.textContent = `${this.enemies.length} / Rem:${this.enemiesRemaining}`;
        document.getElementById('db-sectors').textContent = this.sectors.length;
        document.getElementById('db-center').textContent = this.sectors.map(s => Math.round(s.centerDeg)).join(' / ');
        document.getElementById('db-queue').textContent = this.spawnQueue;

        // Budget表示追加
        const dbState = document.getElementById('db-state');
        dbState.textContent = `${this.spawnPhase} (B:${Math.floor(this.currentSpawnBudget)})`;
        dbState.classList.toggle('cool', this.spawnPhase === 'COOL');
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // 以前の挙動を再現：縦幅を基準にスケールを決め、横方向は中央寄せ（入り切らない分はクリップされる）
        const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
        const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;

        this.ctx.translate(offsetX, 0);

        // 画面シェイクの適用
        if (this.screenShakeTimer > 0) {
            const t = this.screenShakeTimer / CONSTANTS.PULSE_VFX.SHAKE_MS; // 1.0 -> 0.0
            const intensity = this.screenShakeIntensity * t;
            const sx = (Math.random() * 2 - 1) * intensity;
            const sy = (Math.random() * 2 - 1) * intensity;
            this.ctx.translate(sx, sy);
        }

        this.ctx.scale(scale, scale);

        // 背景矩形（描画可能エリアの境界）
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, CONSTANTS.TARGET_WIDTH, CONSTANTS.TARGET_HEIGHT);

        Profiler.start('render');
        this.bullets.forEach(b => b.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        if (this.itemManager) this.itemManager.draw(this.ctx);
        this.golds.forEach(g => g.draw(this.ctx));
        this.damageTexts.forEach(d => d.draw(this.ctx));
        Effects.draw(this.ctx);
        this.player.draw(this.ctx);

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

        this.ctx.restore();
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        let dt = time - this.lastTime;
        this.lastTime = time;
        if (dt > 100 || isNaN(dt)) dt = 16.6;

        Profiler.resetCounts();
        Profiler.updateFrame();

        this.update(dt);
        this.draw();
        this.updatePerfOverlay(); // 新規追加

        requestAnimationFrame((t) => this.loop(t));
    }
    updatePerfOverlay() {
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
        overlay.style.display = 'block';
    }
}

new Game();
