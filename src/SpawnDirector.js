import { CONSTANTS } from './constants.js';
import { DEBUG_ENABLED } from './utils/env.js';
import { Enemy } from './Enemy.js';
import { Formations } from './formations.js';

export class SpawnDirector {
    constructor(game) {
        this.game = game;

        // RNG Injection
        this.rng = null; // If set, use this instead of this.random()

        // Wave/Phase System
        this.state = 'GENERATING'; // GENERATING, SPAWNING, WAITING, COOLDOWN
        this.currentPhase = null;
        this.phaseTimer = 0;       // Timeout計測 / Wait計測用
        this.cooldownTimer = 0;

        // 生成済みリスト (1フェーズ分の敵)
        this.spawnQueue = [];
        this.spawnIntervalTimer = 0; // Queue消化用

        this.currentPlan = {
            mainRole: 'CORE',
            subRole: 'HARASSER',
            pattern: 'RANDOM',
            mainType: CONSTANTS.ENEMY_TYPES.NORMAL
        };

        // 初期化
        this.resetForStage();
    }

    resetForStage() {
        this.state = 'GENERATING';
        this.currentPhase = null;
        this.phaseTimer = 0;
        this.cooldownTimer = 2000; // 開幕少し待つ

        // フェーズ制御用
        this.formationPhaseCounter = 0; // 隊列フェーズのカウント
        this.formationPhaseEvery = 3;   // 3回に1回隊列
        this.wasStrongPhase = false;    // 前のフェーズが強敵だったか

        this.spawnQueue = [];
        this.spawnIntervalTimer = 0;

        // Roster保証 (Unlock済みの敵をリストアップ)
        // 重複抑制履歴 (直近8件)
        this.recentTypes = [];
        this.stageStartTime = Date.now();

        // Reset History / Streak
        this.recentTypes = [];
        this.historyTypes = [];
        this.historyMax = 200; // Keep this property
        this.spawnDecisionCount = 0;
        this.debugForceStatus = { active: false, type: null };

        // Reset Cumulative Stats
        this.stageSpawnTotalCount = 0;
        this.stageSpawnByType = {};
        this.debugForceStats = { activations: 0, picksByType: {} };

        // Stage 9 Wave Sequencer
        if (this.game.currentStage === 8) { // Stage 9 (0-indexed)
            this.stage9WaveBag = [];
            this.refillStage9Bag();
            this.stage9SpiceTimer = 0;

            // Quota System Init
            this.initStage9Quota();
        }

        // Reset Spawn Queue
        this.spawnQueue = [];
        this.spawnIntervalTimer = 0;

        // --- Statistics / History for HUD ---
        this.historyMax = 200;
        this.spawnSideHistory = []; // Latest 200
        this.spawnSideTotal = {};    // { SIDE: count }
        this.formationHistory = [];  // Latest 200
        this.formationTotal = {};    // { formationId: count }

        // Bias Prevention
        this.recentSides = []; // Short memory (e.g. 10) for strict bias rules

        // --- Restored Missing Initializations ---
        // Roster保証 (Unlock済みの敵をリストアップ)
        this.rosterWanted = this.getUnlockedEnemyTypes();

        // A-Burst Logic
        this.burstTimer = 0;
        this.isABurstOn = true;
        this.burstCycle = 6000; // 6 sec

        // Budget (初期値はステージ依存) - フェーズ生成（強敵選定）に使用
        const stageFn = CONSTANTS.STAGE_BUDGET_REFILL[this.game.currentStage + 1] || 1;
        this.specialBudget = stageFn * 5; // 初期予算は多めに
        this.budgetTimer = 15000; // 15秒ごとに補充

        this.cooldowns = {};

        this.intensity = 'LULL';
        this.intensityTimer = 5000;
        this.phase = 'A';
        this.spawnTimer = 0;

        this.log('SYSTEM', 'Reset', `Stage ${this.game.currentStage + 1} Started`);
    }

    // --- Phase 1: SpawnSide Logic ---
    getNextSpawnSide() {
        const SIDES = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

        // 1. Calculate weights based on history
        let totalWeight = 0;
        const weights = SIDES.map(side => {
            let w = 1.0;

            // Rule: No more than 3 consecutive same sides
            const last3 = this.recentSides.slice(-3);
            if (last3.length === 3 && last3.every(s => s === side)) {
                w = 0;
            }

            // Rule: Weight reduction for frequent sides in N=10 history
            const countN10 = this.recentSides.filter(s => s === side).length;
            if (countN10 > 0) {
                w *= (1 - (countN10 / 10) * 0.8);
            }

            // Rule: Encourage opposites
            const lastSide = this.recentSides[this.recentSides.length - 1];
            if (lastSide) {
                const opposites = {
                    'TOP': 'BOTTOM', 'BOTTOM': 'TOP', 'LEFT': 'RIGHT', 'RIGHT': 'LEFT',
                    'TOP_LEFT': 'BOTTOM_RIGHT', 'BOTTOM_RIGHT': 'TOP_LEFT',
                    'TOP_RIGHT': 'BOTTOM_LEFT', 'BOTTOM_LEFT': 'TOP_RIGHT'
                };
                if (side === opposites[lastSide]) {
                    w *= 2.0; // Higher chance for opposite
                }
            }

            totalWeight += w;
            return { side, weight: w };
        });

        // 2. Weighted pick
        if (totalWeight <= 0) return SIDES[Math.floor(this.random() * SIDES.length)];

        let r = this.random() * totalWeight;
        for (const item of weights) {
            r -= item.weight;
            if (r <= 0) return item.side;
        }
        return SIDES[0];
    }

    calculateSpawnPos(side) {
        const margin = 60;
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        let x, y;

        switch (side) {
            case 'TOP':
                x = this.random() * w;
                y = -margin;
                break;
            case 'BOTTOM':
                x = this.random() * w;
                y = h + margin;
                break;
            case 'LEFT':
                x = -margin;
                y = this.random() * h;
                break;
            case 'RIGHT':
                x = w + margin;
                y = this.random() * h;
                break;
            case 'TOP_LEFT':
                x = -margin - this.random() * 20;
                y = -margin - this.random() * 20;
                break;
            case 'TOP_RIGHT':
                x = w + margin + this.random() * 20;
                y = -margin - this.random() * 20;
                break;
            case 'BOTTOM_LEFT':
                x = -margin - this.random() * 20;
                y = h + margin + this.random() * 20;
                break;
            case 'BOTTOM_RIGHT':
                x = w + margin + this.random() * 20;
                y = h + margin + this.random() * 20;
                break;
            default:
                x = 0; y = -margin;
        }

        return { x, y };
    }

    recordSpawnStats(side, formationId = 'NONE') {
        // Side Stats
        this.spawnSideHistory.push(side);
        if (this.spawnSideHistory.length > this.historyMax) this.spawnSideHistory.shift();
        this.spawnSideTotal[side] = (this.spawnSideTotal[side] || 0) + 1;

        this.recentSides.push(side);
        if (this.recentSides.length > 10) this.recentSides.shift();

        // Formation Stats
        this.formationHistory.push(formationId);
        if (this.formationHistory.length > this.historyMax) this.formationHistory.shift();
        this.formationTotal[formationId] = (this.formationTotal[formationId] || 0) + 1;
    }

    getCurrentSpawnCap() {
        const stage = this.game.currentStage + 1;
        // Curve: Low start (manageable) -> High end (swarm)
        // Stage 1: ~13
        // Stage 5: ~37
        // Stage 9: ~77
        return 10 + Math.floor(stage * 3) + Math.floor(Math.pow(stage, 2) * 0.5);
    }

    getUnlockedEnemyTypes() {
        const stage = this.game.currentStage + 1;
        const types = [];

        // CONSTANTSからUnlock情報を走査してリスト化してもいいが、
        // ここでは主要なものを手動またはロジックで拾う
        Object.entries(CONSTANTS).forEach(([key, val]) => {
            if (val && typeof val === 'object' && val.unlockStage) {
                if (stage >= val.unlockStage) {
                    // キー名とENEMY_TYPESの対応が必要だが、
                    // CONSTANTS.ENEMY_TYPES[key] があればそれを使う
                    if (CONSTANTS.ENEMY_TYPES[key]) {
                        types.push(CONSTANTS.ENEMY_TYPES[key]);
                    }
                }
            }
        });

        // 基本タイプは常に入れる
        if (!types.includes(CONSTANTS.ENEMY_TYPES.NORMAL)) types.push(CONSTANTS.ENEMY_TYPES.NORMAL);
        if (stage >= 2 && !types.includes(CONSTANTS.ENEMY_TYPES.ZIGZAG)) types.push(CONSTANTS.ENEMY_TYPES.ZIGZAG);
        if (stage >= 2 && !types.includes(CONSTANTS.ENEMY_TYPES.EVASIVE)) types.push(CONSTANTS.ENEMY_TYPES.EVASIVE);

        // 3つだけ選ぶ (ランダム)
        // 全部出そうとすると無理があるので、「見せたい枠」としてランダムに3つ
        const selected = [];
        const count = 3;
        for (let i = 0; i < count; i++) {
            if (types.length === 0) break;
            const idx = Math.floor(this.random() * types.length);
            selected.push(types[idx]);
            types.splice(idx, 1);
        }
        return selected;
    }

    update(dt) {
        // --- DEBUG STAGE LOGIC ---
        if (this.game.isDebugStage) {
            this.handleDebugSpawn(dt);
            return;
        }

        // 0. Update Burst Timer
        this.burstTimer += dt;
        if (this.burstTimer >= this.burstCycle) {
            this.burstTimer = 0;
            this.isABurstOn = !this.isABurstOn;
            // if (this.game.debugEnabled) console.log(`[BURST] ${this.isABurstOn ? 'ON' : 'OFF'}`);
        }

        // 1. クールダウン更新 (これは維持: HardCap系)
        for (const type in this.cooldowns) {
            if (this.cooldowns[type] > 0) {
                this.cooldowns[type] -= dt;
                if (this.cooldowns[type] < 0) this.cooldowns[type] = 0;
            }
        }
        // ... (rest of update) ...

        // --- DEBUG SPAWN ---
        // 完了条件チェック (Stage Clear)
        // enemiesRemaining <= 0 かつ 画面上0 (Minion除く) ならクリア処理へ (Game側で行われる)
        const activeNonMinions = this.game.enemies.filter(e => e.active && !e.isMinion).length;
        if (this.game.enemiesRemaining <= 0 && activeNonMinions === 0) return;

        // Boss戦中はフェーズ進行停止
        if (this.game.isBossActive) return;

        // --- STAGE 9 UPDATE (Spice & Quota Stats) ---
        if (this.game.currentStage === 8) {
            this.updateStage9Spice(dt);
        }

        // --- ステートマシン ---
        switch (this.state) {
            case 'GENERATING':
                // Budget Check: If no enemies left to spawn, wait for clear
                if (this.game.enemiesRemaining <= 0) {
                    this.state = 'WAITING';
                    break;
                }
                this.generateNextPhase(dt);
                this.state = 'SPAWNING';
                break;

            case 'SPAWNING':
                // Queue消化
                if (this.spawnQueue.length > 0) {
                    // 同時湧き制限 (Hard Cap)
                    let cap = this.getCurrentSpawnCap();

                    if (this.game.enemies.length < cap) {
                        this.spawnIntervalTimer -= dt;
                        if (this.spawnIntervalTimer <= 0) {
                            const task = this.spawnQueue[0];
                            const options = {
                                entry: task.entry,
                                formationInfo: task.formationInfo
                            };
                            this.executeSpawn(task.type, task.pattern, task.x, task.y, options);
                            this.spawnQueue.shift();

                            // 次の間隔 (Taskにあればそれ、なければデフォルト短間隔)
                            this.spawnIntervalTimer = (task.nextDelay !== undefined) ? task.nextDelay : 100;
                        }
                    }
                } else {
                    // Queue完了 -> Waitへ
                    this.state = 'WAITING';
                    this.phaseTimer = 0; // Timeout計測開始
                }
                break;






            case 'WAITING':
                this.phaseTimer += dt;

                // Check for phase completion
                const aliveCount = this.game.enemies.filter(e => e.active && !e.isMinion).length;

                // 次フェーズへの移行条件（緩和）
                // 1. 全滅している
                // 2. 残り敵数が少なく、かつ強敵（Commander格）が1体以下
                //    ユーザー要望: "シールダー ガーディアンが画面1匹になったら次の湧き"
                const strongCount = this.game.enemies.filter(e => e.active && this.isStrongType(e.type)).length;

                let isReady = false;
                if (aliveCount === 0) {
                    isReady = true;
                } else if (aliveCount <= 4 && strongCount <= 1) {
                    // 雑魚が少し残っていても、強敵が1体以下なら次へ行く
                    isReady = true;
                }

                if (isReady) {
                    this.state = 'COOLDOWN';
                    this.cooldownTimer = this.currentPhase ? this.currentPhase.cooldownMs : 1000;
                }
                break;

            case 'COOLDOWN':
                this.cooldownTimer -= dt;
                if (this.cooldownTimer <= 0) {
                    this.state = 'GENERATING';
                }
                break;
        }
    }

    generateNextPhase(dt) {


        const stage = this.game.currentStage + 1;

        // --- STAGE 9 SPECIAL LOGIC ---
        if (stage === 9) {
            // this.updateStage9Spice(dt); // Moved to update()
            this.generateStage9Phase();
            return;
        }

        // --- フェーズ種別の決定 ---
        // 1. 強敵直後の休憩 (Recovery)
        if (this.wasStrongPhase) {
            this.generateRecoveryPhase();
            return;
        }

        // 2. 隊列 (Formation) - 頻度制限: 4回に1回以下
        // formationPhaseCounter は Formation 実行時に 0 にリセット、それ以外で +1
        if (this.formationPhaseCounter >= 3) { // 0,1,2...3(4回目)で解禁
            // 確率で発動
            if (this.random() < 0.7) {
                this.generateFormationPhase();
                return;
            }
        }

        // 3. その他 (Mixed / Pressure / Standard)
        // Stageが進むほど Mixed/Pressure の比率を上げる
        const rand = this.random();
        let mixedThreshold = 0.3;
        let pressureThreshold = 0.1;

        if (stage >= 3) { mixedThreshold = 0.4; pressureThreshold = 0.2; }
        if (stage >= 6) { mixedThreshold = 0.4; pressureThreshold = 0.3; }

        if (rand < pressureThreshold) {
            this.generatePressurePhase();
        } else if (rand < pressureThreshold + mixedThreshold) {
            this.generateMixedPhase();
        } else {
            this.generateStandardPhase();
        }
    }

    // --- Stage 9 Fixed Wave Logic ---
    refillStage9Bag() {
        // A: Standard (High A)
        // B: Fast (Zigzag/Evasive)
        // C: Heavy (Tank/Commander)
        // D: Chaos (Mixed)
        // Pattern: [A, A, B, C, D] to maintain ~60-70% A ratio
        this.stage9WaveBag = ['A', 'A', 'B', 'C', 'D'];

        // Fisher-Yates Shuffle
        for (let i = this.stage9WaveBag.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [this.stage9WaveBag[i], this.stage9WaveBag[j]] = [this.stage9WaveBag[j], this.stage9WaveBag[i]];
        }
        this.log('SYSTEM', 'Stage9', `Refilled Bag: ${this.stage9WaveBag.join(',')}`);
    }

    generateStage9Phase() {
        if (!this.stage9WaveBag || this.stage9WaveBag.length === 0) {
            this.refillStage9Bag();
        }
        const pattern = this.stage9WaveBag.shift();
        this.log('SYSTEM', 'Stage9', `Generating Wave ${pattern} (Rem: ${this.stage9WaveBag.join(',')})`);

        // Common Setup
        this.currentPhase = { type: `STG9-${pattern}`, cooldownMs: 2000 };
        const cap = this.getCurrentSpawnCap();
        let count = Math.floor(cap * 0.8); // 80% density
        count = Math.min(count, this.game.enemiesRemaining);

        if (count <= 0) return;

        const T = CONSTANTS.ENEMY_TYPES;
        let composition = [];

        // Define Wave Composition (Target A ratio <= 70%)
        switch (pattern) {
            case 'A': // Standard Swarm (A:70%, B:30%)
                composition = [
                    { type: T.NORMAL, weight: 70 },
                    { type: T.ZIGZAG, weight: 30 }
                ];
                break;
            case 'B': // Fast Assault (A:60%, B:20%, C:20%)
                composition = [
                    { type: T.NORMAL, weight: 60 },
                    { type: T.ZIGZAG, weight: 20 },
                    { type: T.EVASIVE, weight: 20 }
                ];
                break;
            case 'C': // Heavy (A:60%, B:20%, O/M:20%)
                composition = [
                    { type: T.NORMAL, weight: 60 },
                    { type: T.ZIGZAG, weight: 20 },
                    { type: T.TRICKSTER, weight: 10 }, // O: TRICKSTER (Fixed from ORBITER)
                    { type: T.FLANKER, weight: 10 }    // M: FLANKER (Fixed from MOMENTUM)
                ];
                break;
            case 'D': // Chaos (A:50%, B:10%, C:10%, O:10%, M:10%, E:10%)
                composition = [
                    { type: T.NORMAL, weight: 50 },
                    { type: T.ZIGZAG, weight: 10 },
                    { type: T.EVASIVE, weight: 10 },
                    { type: T.TRICKSTER, weight: 10 }, // O
                    { type: T.FLANKER, weight: 10 },   // M
                    { type: T.ELITE, weight: 10 }      // D (Kept as chaos element)
                ];
                break;
        }

        // Generate Queue based on composition
        let remainingCount = count;
        while (remainingCount > 0) {
            // CRITICAL: Double check budget inside loop
            if (this.game.enemiesRemaining - this.spawnQueue.length <= 0) break;

            // Check Quota Priority first
            let type = this.checkStage9Quota();
            if (!type) {
                type = this.pickFromComposition(composition);
            }

            // Decide between individual spawn or formation squad
            if (this.canFormFormation(type) && remainingCount >= 4 && this.random() < 0.4) {
                // Spawn as a squad formation (3 to 6 units)
                const squadSize = Math.min(remainingCount, 4 + Math.floor(this.random() * 3));
                const pattern = this.pickFormationPattern(type);
                this.queueFormation(pattern, type, squadSize);

                remainingCount -= squadSize;

                // Add a small breather after a squad to maintain Stage 9 rhythm
                if (this.spawnQueue.length > 0) {
                    this.spawnQueue[this.spawnQueue.length - 1].nextDelay = 800 + this.random() * 400;
                }
            } else {
                // Individual Random Spawn
                this.spawnQueue.push({
                    type: type,
                    pattern: 'RANDOM',
                    x: null, y: null,
                    nextDelay: this.random() * 50 + 50
                });
                remainingCount--;
            }
        }
    }

    pickFromComposition(comp) {
        const total = comp.reduce((acc, c) => acc + c.weight, 0);
        let r = this.random() * total;
        for (const c of comp) {
            r -= c.weight;
            if (r <= 0) return c.type;
        }
        return comp[0].type;
    }

    updateStage9Spice(dt) {
        this.stage9SpiceTimer += dt;
        const SPICE_INTERVAL_MS = 3000;

        if (this.stage9SpiceTimer >= SPICE_INTERVAL_MS) {
            this.stage9SpiceTimer = 0;

            // CRITICAL: Prevent extra spawns if budget is exhausted
            if (this.game.enemiesRemaining <= 0) return;
            const T = CONSTANTS.ENEMY_TYPES;
            const spicePool = [
                T.ELITE, T.REFLECTOR, T.DASHER, T.ORBITER,
                T.SPLITTER, T.BARRIER_PAIR, T.OBSERVER, T.SHIELDER
            ];

            // Filter valid candidates (Cooldown / Limits)
            const candidates = spicePool.filter(type => this.canSpawnSpice(type));

            if (candidates.length > 0) {
                const picked = candidates[Math.floor(this.random() * candidates.length)];

                // Direct Spawn / or Priority Queue
                this.injectSpiceToQueue(picked);
                this.log('SPICE', 'Injection', `Queueing ${picked}`);

                // Manual cooldown trigger (Optional, if executeSpawn doesn't set global CD for type)
                // this.cooldowns[picked] = ... (Built-in cooldown logic handled in update?) 
                // SpawnDirector uses global `cooldowns`? check.
                // Reset type specific cooldown
                const cd = CONSTANTS.SPAWN_COOLDOWNS[picked] || 10;
                this.cooldowns[picked] = cd * 1000;
            }
        }
    }

    canSpawnSpice(type) {
        // Check 1: Hard Limit
        // Check 2: Cooldown
        if ((this.cooldowns[type] || 0) > 0) return false;

        // Count active
        const limit = CONSTANTS.TYPE_LIMITS[type] || 999;
        const activeCount = this.game.enemies.filter(e => e.type === type && e.active).length;
        if (activeCount >= limit) return false;

        return true;
    }

    // Internal record helper if simulator calls separate logic, but 
    // executeSpawn usually handles instantiation. 
    // Wait, executeSpawn creates Enemy. 
    // Simulator hooks executeSpawn? No, Simulator runs SD.update/spawnQueue.
    // If I call executeSpawn directly here, it bypasses spawnQueue.
    // That's fine for "Injection".

    // NOTE: Simulator.js uses `spawnDirector.spawnQueue` to count "spawns".
    // If I use executeSpawn directly, Simulator Loop might miss it if it only drains queue.
    // Simulator.js Loop:
    // while(spawnQueue.length > 0) ... recordSpawn ...
    // So if I executeSpawn here, Simulator WON'T know unless I modify Simulator or use queue.
    // 
    // Better approach for Simulator compatibility: Push to Queue with 0 delay.

    injectSpiceToQueue(type) {
        this.spawnQueue.unshift({
            type: type,
            pattern: 'RANDOM',
            x: null, y: null,
            nextDelay: 0
        });
    }

    // --- Quota System ---
    initStage9Quota() {
        const T = CONSTANTS.ENEMY_TYPES;
        this.quotaByType = {};
        this.spawnCountByType = {}; // Managed in recordSpawn? No, separate tracking or reuse?
        // Reuse basic stats if robust, but for Stage 9 specific logic let's track here or use stageSpawnByType

        // Tier 2 (Min 20)
        [T.DASHER, T.ORBITER, T.SPLITTER, T.ATTRACTOR].forEach(t => this.quotaByType[t] = 20);

        // Tier 3 (Min 8)
        [T.ELITE, T.SHIELDER, T.BARRIER_PAIR, T.REFLECTOR, T.OBSERVER].forEach(t => this.quotaByType[t] = 8);
        this.quotaByType[T.GUARDIAN] = 3;

        this.debugQuotaStats = { hits: 0, failures: {} };
    }

    checkStage9Quota() {
        if (!this.quotaByType) return null;

        // Find unmet quotas
        const needs = [];
        for (const [type, limit] of Object.entries(this.quotaByType)) {
            const current = this.stageSpawnByType[type] || 0;
            if (current < limit) {
                needs.push(type);
            }
        }

        if (needs.length === 0) return null;

        // Filter by canSpawnNow (eligibility)
        // Note: Quota overrides weight but MUST respect limits/cooldowns to avoid bugs
        const eligible = needs.filter(t => this.canSpawnSpice(t));

        if (eligible.length === 0) {
            // Log failure for debugging
            needs.forEach(t => {
                this.debugQuotaStats.failures[t] = (this.debugQuotaStats.failures[t] || 0) + 1;
            });
            return null;
        }

        // Pick one (Random)
        const picked = eligible[Math.floor(this.random() * eligible.length)];
        this.debugQuotaStats.hits++;
        return picked;
    }

    // --- 各フェーズ生成メソッド ---

    generateRecoveryPhase() {
        // 全滅または休憩後の小休止フェーズ
        // 少数のみ湧く
        const cap = this.getCurrentSpawnCap();
        // Capの 20% 程度、最低3体、ただし残り数を超えないように
        let count = Math.max(3, Math.floor(cap * 0.2));
        count = Math.min(count, this.game.enemiesRemaining);
        if (count <= 0) count = 0;

        // 強敵の次は必ず休憩 (COREのみ, 小規模)
        const stage = this.game.currentStage + 1;
        let coreTypes = [CONSTANTS.ENEMY_TYPES.NORMAL];
        if (stage >= 2) coreTypes.push(CONSTANTS.ENEMY_TYPES.ZIGZAG);

        // --- ACTIVE LAYER FILTER ---
        const activeTypes = CONSTANTS.ACTIVE_ENEMY_TYPES || [];
        if (activeTypes.length > 0) {
            coreTypes = coreTypes.filter(t => activeTypes.includes(t));
            if (coreTypes.length === 0) coreTypes.push(CONSTANTS.ENEMY_TYPES.NORMAL); // Fallback
        }
        // ---------------------------

        let type = coreTypes[Math.floor(this.random() * coreTypes.length)];
        // HardCap check (Recoveryでも念のため)
        if (!this.checkPhaseHardCaps(type)) type = CONSTANTS.ENEMY_TYPES.NORMAL;

        this.currentPhase = {
            type: 'RECOVERY',
            mainType: type,
            count: count,
            interval: 600,
            cooldownMs: 2000,
            maxDurationMs: 8000
        };

        // --- ESCORT / COMMANDER LOGIC ---
        // Commander判定: Unfrozen または 強敵 または 複数同時不可
        // ただし DebugStage は除外
        let isCommander = false;
        if (!this.game.isDebugStage) {
            const isUnfrozen = (CONSTANTS.UNFROZEN_ENEMY_TYPES || []).includes(type);
            if (isUnfrozen || this.isStrongType(type) || !this.canSpawnMultiple(type)) {
                isCommander = true;
            }
        }

        const spawnType = isCommander ? CONSTANTS.ENEMY_TYPES.NORMAL : type; // 部下はNORMAL
        // -------------------------------

        this.currentPlan = { mainType: type, pattern: 'NONE' };

        // 生成
        for (let i = 0; i < this.currentPhase.count; i++) {
            // Leader Injection: 先頭だけ Commander にする
            const currentType = (isCommander && i === 0) ? type : spawnType;

            this.spawnQueue.push({
                type: currentType,
                pattern: 'NONE',
                x: null, y: null,
                nextDelay: 600 + this.random() * 400 // バラけさせる
            });
        }

        this.wasStrongPhase = false;
        this.formationPhaseCounter++;
        this.log('PHASE', 'Recovery', `Type: ${type} Count: ${this.currentPhase.count}`);
    }

    generateFormationPhase() {
        const stage = this.game.currentStage + 1;

        // パターン抽選
        const patterns = ['LINEAR', 'PINCER', 'V_SHAPE', 'CIRCLE', 'GRID', 'STREAM', 'CROSS', 'RANDOM_BURST'];

        // --- ACTIVE LAYER FILTER ---
        const activePatterns = CONSTANTS.ACTIVE_FORMATIONS || [];
        // ---------------------------

        const allowedPatterns = [];

        for (const p of patterns) {
            // Active Layer Filter
            if (activePatterns.length > 0 && !activePatterns.includes(p)) continue;

            if (stage >= 1 && (p === 'LINEAR' || p === 'PINCER')) allowedPatterns.push(p);
            if (stage >= 2 && (p === 'V_SHAPE' || p === 'STREAM')) allowedPatterns.push(p);
            if (stage >= 3 && (p === 'CIRCLE' || p === 'CROSS')) allowedPatterns.push(p);
            if (stage >= 4 && (p === 'GRID' || p === 'RANDOM_BURST')) allowedPatterns.push(p);
        }

        let pattern = 'LINEAR';
        if (allowedPatterns.length > 0) {
            pattern = allowedPatterns[Math.floor(this.random() * allowedPatterns.length)];
        } else if (activePatterns.length > 0) {
            // Fallback to first active pattern if none allowed by stage
            pattern = activePatterns[0];
        }

        // 敵タイプ抽選 (HardCap考慮)
        const candidates = this.buildCandidateList();
        let type = this.pickTypeWeighted(candidates) || CONSTANTS.ENEMY_TYPES.NORMAL;
        if (!this.checkPhaseHardCaps(type)) type = CONSTANTS.ENEMY_TYPES.NORMAL;

        // 数
        let count = Math.floor(this.getCurrentSpawnCap() * 0.6);
        count = Math.max(6, count);
        count = Math.min(count, this.game.enemiesRemaining);
        if (count <= 0) count = 0;

        // --- ACTIVE LAYER CAP Override (Optional) ---
        if (CONSTANTS.TEST_HARD_CAP) {
            count = Math.min(count, CONSTANTS.TEST_HARD_CAP);
        }

        // --- ESCORT / COMMANDER LOGIC ---
        let isCommander = false;
        if (!this.game.isDebugStage) {
            const isUnfrozen = (CONSTANTS.UNFROZEN_ENEMY_TYPES || []).includes(type);
            if (isUnfrozen || this.isStrongType(type) || !this.canSpawnMultiple(type)) {
                isCommander = true;
            }
        }

        // Commanderなら部下(Escort)をセット、本人はリーダーとして注入
        const leaderType = isCommander ? type : null;
        const memberType = isCommander ? CONSTANTS.ENEMY_TYPES.NORMAL : type; // 部下はNORMAL固定（改良可）
        // -------------------------------

        this.currentPhase = {
            type: 'FORMATION',
            mainType: type,
            pattern: pattern,
            count: count,
            cooldownMs: 1500,
            maxDurationMs: 15000
        };

        // queueFormation を拡張して leaderType を渡す必要があるが、
        // 既存の queueFormation は type を全員に適用する。
        // ここでは queueFormation 呼び出し後に spawnQueue の先頭を書き換える方式をとる（簡易実装）
        const preQueueLen = this.spawnQueue.length;
        this.queueFormation(pattern, memberType, count);

        if (isCommander && this.spawnQueue.length > preQueueLen) {
            // 先頭（リーダー）を Commander に書き換え
            this.spawnQueue[preQueueLen].type = leaderType;
        }

        this.wasStrongPhase = this.isStrongType(type);
        this.formationPhaseCounter = 0; // Reset
        this.log('PHASE', 'Formation', `Pattern: ${pattern} Type: ${type}`);
    }

    generateMixedPhase() {
        // 小波状攻撃 (Waves)
        const stage = this.game.currentStage + 1;
        const cap = this.getCurrentSpawnCap();

        const subWaves = 2 + Math.floor(this.random() * 2); // 2 or 3

        this.currentPhase = {
            type: 'MIXED',
            subWaves: subWaves,
            cooldownMs: 1000,
            maxDurationMs: 20000
        };

        const candidates = this.buildCandidateList();
        let budget = this.game.enemiesRemaining;

        for (let i = 0; i < subWaves; i++) {
            if (budget <= 0) break;
            // 各Waveでタイプを変えることも可能だが、今回は混ぜる
            let type = this.pickTypeWeighted(candidates) || CONSTANTS.ENEMY_TYPES.NORMAL;
            // HardCap: 強敵は1フェーズ1回まで -> wasStrongPhase ではなく ローカルでチェックが必要だが
            // checkPhaseHardCaps は単純な数チェックなので、ここでは「強敵なら以降は弱敵」のようなロジックを入れる
            if (this.isStrongType(type)) {
                // 既に強敵が選ばれていないか？ (簡易的に: 最初の1回以外は強敵禁止とか)
                if (i > 0) {
                    // 確率で弱体化
                    if (this.random() < 0.7) type = CONSTANTS.ENEMY_TYPES.NORMAL;
                }
            }
            if (!this.checkPhaseHardCaps(type)) type = CONSTANTS.ENEMY_TYPES.NORMAL;

            let subCount = Math.floor(cap * 0.15); // 15% per wave
            subCount = Math.max(2, subCount);
            subCount = Math.min(subCount, budget);
            budget -= subCount;

            // --- ESCORT / COMMANDER LOGIC ---
            let isCommander = false;
            if (!this.game.isDebugStage) {
                const isUnfrozen = (CONSTANTS.UNFROZEN_ENEMY_TYPES || []).includes(type);
                if (isUnfrozen || this.isStrongType(type) || !this.canSpawnMultiple(type)) {
                    isCommander = true;
                    // Mixedでは数は減らさない（護衛をつける）
                }
            }
            // -------------------------------

            const interval = 600 + this.random() * 400; // 0.6 - 1.0s

            if (this.canFormFormation(type) && subCount >= 3) {
                const pattern = this.pickFormationPattern(type);
                this.queueFormation(pattern, type, subCount);
                // Wave interval after formation
                if (this.spawnQueue.length > 0) {
                    this.spawnQueue[this.spawnQueue.length - 1].nextDelay = 1500;
                }
            } else {
                for (let j = 0; j < subCount; j++) {
                    // Leader Injection
                    const currentType = (isCommander && j === 0) ? type : (isCommander ? CONSTANTS.ENEMY_TYPES.NORMAL : type);

                    this.spawnQueue.push({
                        type: currentType,
                        pattern: 'NONE',
                        x: null, y: null,
                        nextDelay: (j === subCount - 1) ? 1500 : interval // Waveの最後は少し間隔を空ける
                    });
                }
            }
        }

        this.wasStrongPhase = false; // Mixedでは強敵扱いしない（分散してるので）
        this.formationPhaseCounter++;
        this.log('PHASE', 'Mixed', `Waves: ${subWaves}`);
    }

    generatePressurePhase() {
        // Pressure: 五月雨 (Streaming)
        // 0.5秒間隔で一定数を流し込む
        const cap = this.getCurrentSpawnCap();
        let rate = 0.5 + this.random() * 0.3;
        let count = Math.floor(cap * rate);
        count = Math.max(5, count);
        count = Math.min(count, this.game.enemiesRemaining);
        if (count <= 0) count = 0;

        // Pressureは主にCore/Harasserで行う
        let type = CONSTANTS.ENEMY_TYPES.NORMAL;

        // 簡易抽選 (Candidatesから選ぶ形に修正して Active List を適用)
        // 以前のロジック:
        // const r = this.random();
        // if (r < 0.4) type = CONSTANTS.ENEMY_TYPES.ZIGZAG;
        // else if (r < 0.6) type = CONSTANTS.ENEMY_TYPES.ASSAULT;
        // else if (r < 0.7) type = CONSTANTS.ENEMY_TYPES.DASHER; // 混ぜる

        // 新ロジック: buildCandidateList (Filtered) からランダムに選ぶ
        // ただし Pressure 向きの敵 (Core/Harasser) を優先したい
        const candidates = this.buildCandidateList();
        // フィルタリング: Pressureに適さない敵を除外 (例: SHIELDER, GUARDIAN, OBSERVER)
        const pressureCandidates = candidates.filter(t => {
            return t !== CONSTANTS.ENEMY_TYPES.SHIELDER &&
                t !== CONSTANTS.ENEMY_TYPES.GUARDIAN &&
                t !== CONSTANTS.ENEMY_TYPES.OBSERVER &&
                t !== CONSTANTS.ENEMY_TYPES.BARRIER_PAIR;
        });

        if (pressureCandidates.length > 0) {
            type = pressureCandidates[Math.floor(this.random() * pressureCandidates.length)];
        } else {
            type = CONSTANTS.ENEMY_TYPES.NORMAL;
        }

        if (!this.checkPhaseHardCaps(type)) type = CONSTANTS.ENEMY_TYPES.NORMAL;

        this.currentPhase = {
            type: 'PRESSURE',
            mainType: type,
            count: count,
            cooldownMs: 1000,
            maxDurationMs: 12000
        };

        // --- ESCORT / COMMANDER LOGIC ---
        let isCommander = false;
        if (!this.game.isDebugStage) {
            const isUnfrozen = (CONSTANTS.UNFROZEN_ENEMY_TYPES || []).includes(type);
            if (isUnfrozen || this.isStrongType(type) || !this.canSpawnMultiple(type)) {
                isCommander = true;
            }
        }
        // PressureでCommanderが選ばれた場合、数が多すぎるので
        // Commander自体は1体にし、残りをNormalにする（あるいはPressureではCommanderを禁止する手もあるが、今回は混ぜる）
        // -------------------------------

        this.currentPhase = {
            type: 'PRESSURE',
            mainType: type,
            count: count,
            cooldownMs: 1000,
            maxDurationMs: 12000
        };

        if (this.canFormFormation(type) && count >= 3) {
            const pattern = this.pickFormationPattern(type);
            this.queueFormation(pattern, type, count);
        } else {
            for (let i = 0; i < count; i++) {
                // Leader Injection
                const currentType = (isCommander && i === 0) ? type : (isCommander ? CONSTANTS.ENEMY_TYPES.NORMAL : type);

                this.spawnQueue.push({
                    type: currentType,
                    pattern: 'NONE',
                    x: null, y: null,
                    nextDelay: 400 + this.random() * 200 // 0.4-0.6s
                });
            }
        }

        this.wasStrongPhase = false;
        this.formationPhaseCounter++;
        this.log('PHASE', 'Pressure', `Type: ${type} Count: ${count}`);
    }

    generateStandardPhase() {
        // 従来の「パターンなし」ランダム湧きに近いが、まとめて投入
        // バラバラと一度に出す
        const cap = this.getCurrentSpawnCap();
        let rate = 0.4 + this.random() * 0.3;
        let count = Math.floor(cap * rate);
        count = Math.max(5, count);
        count = Math.min(count, this.game.enemiesRemaining);
        if (count <= 0) count = 0;
        const candidates = this.buildCandidateList();
        let type = this.pickTypeWeighted(candidates) || CONSTANTS.ENEMY_TYPES.NORMAL;
        if (!this.checkPhaseHardCaps(type)) type = CONSTANTS.ENEMY_TYPES.NORMAL;

        this.currentPhase = {
            type: 'STANDARD',
            mainType: type,
            count: count,
            cooldownMs: 1200,
            maxDurationMs: 15000
        };

        // --- ESCORT / COMMANDER LOGIC ---
        let isCommander = false;
        if (!this.game.isDebugStage) {
            const isUnfrozen = (CONSTANTS.UNFROZEN_ENEMY_TYPES || []).includes(type);
            if (isUnfrozen || this.isStrongType(type) || !this.canSpawnMultiple(type)) {
                isCommander = true;
            }
        }
        // -------------------------------

        if (this.canFormFormation(type) && this.currentPhase.count >= 3) {
            const pattern = this.pickFormationPattern(type);
            this.queueFormation(pattern, type, this.currentPhase.count);
        } else {
            // 一気に追加するが、出現自体はランダム位置
            for (let i = 0; i < this.currentPhase.count; i++) {
                // Leader Injection
                const currentType = (isCommander && i === 0) ? type : (isCommander ? CONSTANTS.ENEMY_TYPES.NORMAL : type);

                this.spawnQueue.push({
                    type: currentType,
                    pattern: 'NONE',
                    x: null, y: null, // executeSpawnでランダム決定
                    nextDelay: 100 + this.random() * 200 // 短い間隔でポンポン出る
                });
            }
        }

        this.wasStrongPhase = this.isStrongType(type);
        this.formationPhaseCounter++;
        this.log('PHASE', 'Standard', `Type: ${type} Count: ${count}`);
    }

    isStrongType(type) {
        return (
            type === CONSTANTS.ENEMY_TYPES.ELITE ||
            type === CONSTANTS.ENEMY_TYPES.SHIELDER ||
            type === CONSTANTS.ENEMY_TYPES.GUARDIAN ||
            type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR ||
            type === CONSTANTS.ENEMY_TYPES.OBSERVER ||
            type === CONSTANTS.ENEMY_TYPES.REFLECTOR
        );
    }

    forceCullEnemies() {
        // 画面外へ消去 (TIMEOUT_CULL)
        // killsは加算しない
        this.game.enemies.forEach(e => {
            if (e.active && !e.isBoss) {
                e.active = false;
                // エフェクトなしで消す、または専用エフェクト
                // ここでは単純に非アクティブ化し、cleanupで回収させる
                // ただし enemiesRemaining は減らさないといけない？ 
                // -> 規約: kill時のみ増やす(=remainingは減る)。 timeoutは倒してないのでremainingは減らない...
                // いや、remainingは「倒すべき総数」なので、timeoutで逃げられたら「倒せなかった」扱い。
                // つまり remaining は減らさず、Waveを進める。
                // しかし GameClear条件は remaining <= 0 なので、減らさないとクリアできない。
                // 結論: Timeoutでも「退却」扱いで Remaining は減らす必要がある。

                this.game.enemiesRemaining--;
                // Pool戻しは update Loop の cleanupEntities で行われるが、active=falseにする必要がある
            }
        });
    }

    buildCandidateList() {
        // --- 1. 最新の抽選候補リストを取得 (合成) ---
        const activeTypes = CONSTANTS.ACTIVE_ENEMY_TYPES || [];
        const unfrozenTypes = CONSTANTS.UNFROZEN_ENEMY_TYPES || [];
        const combinedCandidatePool = [...activeTypes, ...unfrozenTypes];

        // Debug Vars
        this.debugRejections = {};
        const logRejection = (type, reason) => {
            if (!this.debugRejections[type]) this.debugRejections[type] = {};
            this.debugRejections[type][reason] = (this.debugRejections[type][reason] || 0) + 1;
        };
        // ------------------------------------------

        const candidates = [];
        const stage = this.game.currentStage + 1;
        const counts = this.game.frameCache.roleCounts;
        const typeCounts = this.game.frameCache.typeCounts;

        for (const type of combinedCandidatePool) {
            // 絶対ルール: SPLITTER_CHILD(K) は直接抽選しない (Jの分裂のみ)
            if (type === 'K' || type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) continue;

            // 2. Unlock Check (基本に従う)
            if (!this.isUnlocked(type)) continue;

            const role = CONSTANTS.ENEMY_ROLES[type] || 'CORE';

            // 3. Cooldown Check (HardCap系)
            if (this.cooldowns[type] && this.cooldowns[type] > 0) {
                logRejection(type, 'CD');
                continue;
            }

            // 4. Type Limit Check (同時出現数制限)
            if (!this.checkPhaseHardCaps(type)) {
                logRejection(type, 'MaxAlive');
                continue;
            }

            // 5. Role Limit Check (Legacy)
            let roleLimit = CONSTANTS.ROLE_LIMITS[role] || 999;
            // Late Stage Role Cap Relaxation
            if (stage >= 6) {
                if (role === 'HARASSER') roleLimit = 6;  // 3 -> 6
                else if (role === 'ELITE') roleLimit = 3; // 2 -> 3
                else if (role === 'CONTROLLER') roleLimit = 2; // 1 -> 2 (BarrierPair x2)
                else if (role === 'DIRECTOR') roleLimit = 2;   // 1 -> 2
            }
            if ((counts[role] || 0) >= roleLimit) {
                logRejection(type, 'RoleMax');
                continue;
            }

            candidates.push(type);
        }

        // Fallback
        if (candidates.length === 0) {
            candidates.push(CONSTANTS.ENEMY_TYPES.NORMAL);
        }

        return candidates;
    }

    isUnlocked(type) {
        // 簡易判定 (Active Layer内でもStage制限は有効とするか？ -> 検証なので全部出しでOKだが、今回はUnlockも従う)
        const stage = this.game.currentStage + 1;

        // マッピング 
        const unlockMap = {
            [CONSTANTS.ENEMY_TYPES.ZIGZAG]: 1,      // B: Stage 1
            [CONSTANTS.ENEMY_TYPES.EVASIVE]: 1,     // C: Stage 1 (New)
            [CONSTANTS.ENEMY_TYPES.ELITE]: 1,       // D: Stage 1 (Default)
            [CONSTANTS.ENEMY_TYPES.ASSAULT]: 2,     // E: Stage 2
            [CONSTANTS.ENEMY_TYPES.SHIELDER]: 3,    // F: Stage 3
            [CONSTANTS.ENEMY_TYPES.SPLITTER]: 3,    // J: Stage 3
            [CONSTANTS.ENEMY_TYPES.DASHER]: 4,      // H: Stage 4
            [CONSTANTS.ENEMY_TYPES.GUARDIAN]: 5,    // G: Stage 5
            [CONSTANTS.ENEMY_TYPES.ORBITER]: 5,     // I: Stage 5
            [CONSTANTS.ENEMY_TYPES.OBSERVER]: 5,    // L: Stage 5
            [CONSTANTS.ENEMY_TYPES.TRICKSTER]: 5,   // O: Stage 5 (New)
            [CONSTANTS.ENEMY_TYPES.FLANKER]: 7,     // M: Stage 7
            [CONSTANTS.ENEMY_TYPES.ATTRACTOR]: 7,   // P: Stage 7
            [CONSTANTS.ENEMY_TYPES.BARRIER_PAIR]: 8,// N: Stage 8
            [CONSTANTS.ENEMY_TYPES.REFLECTOR]: 8    // Q: Stage 8
        };

        const req = unlockMap[type] || 1;
        return stage >= req;
    }

    checkPhaseHardCaps(type) {
        // ... (previous logic)
        const typeCounts = this.game.frameCache.typeCounts;

        // キュー内の数も考慮する (これがないと同一フェーズ内で複数追加される)
        const inQueue = this.spawnQueue.filter(q => q.type === type).length;
        const total = (typeCounts[type] || 0) + inQueue;

        const isLate = (this.game.currentStage + 1 >= 6);

        switch (type) {
            case CONSTANTS.ENEMY_TYPES.BARRIER_PAIR:
                // Normal: 1, Late: 2
                if (total >= (isLate ? 2 : 1)) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.SHIELDER:
                // Normal: 1, Late: 2
                if (total >= (isLate ? 2 : 1)) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.GUARDIAN:
                // Normal: 1, Late: 1 (Unchanged)
                if (total >= 1) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.OBSERVER:
                // Normal: 1, Late: 2
                if (total >= (isLate ? 2 : 1)) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.SPLITTER:
                // Normal: 2, Late: 3
                if (total >= (isLate ? 3 : 2)) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.DASHER:
            case CONSTANTS.ENEMY_TYPES.ORBITER:
                // Normal: 2, Late: 3
                if (total >= (isLate ? 3 : 2)) return false;
                break;
            case CONSTANTS.ENEMY_TYPES.ELITE:
            case CONSTANTS.ENEMY_TYPES.REFLECTOR:
                // Normal: 2 (Role limit usually), Late: 3
                if (total >= (isLate ? 3 : 2)) return false;
                break;
        }

        return true;
    }

    // ヘルパー: 複数同時スポーン(Formation等)して良いタイプか
    canSpawnMultiple(type) {
        // 基本的に HardCap が 1 のものは false
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) return false;
        if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) return false;
        if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) return false;
        if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) return false;
        return true;
    }

    checkTypeLimit(type, currentCounts) {
        if (!this.checkPhaseHardCaps(type)) return false;


        // CONSTANTS.TYPE_LIMITS はキー名(SHIELDER等)で定義されている。
        // type (ID) -> Key Name の変換が必要。
        // 負荷軽減のため、switchで書く
        let limit = 999;

        // 下記は記述量削減のため一部省略、主要なもののみ
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) limit = CONSTANTS.TYPE_LIMITS.SHIELDER;
        else if (type === CONSTANTS.ENEMY_TYPES.ORBITER) limit = CONSTANTS.TYPE_LIMITS.ORBITER;
        else if (type === CONSTANTS.ENEMY_TYPES.DASHER) limit = CONSTANTS.TYPE_LIMITS.DASHER;
        else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER) limit = CONSTANTS.TYPE_LIMITS.SPLITTER;
        else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) limit = CONSTANTS.TYPE_LIMITS.GUARDIAN;
        else if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) limit = CONSTANTS.TYPE_LIMITS.BARRIER_PAIR;
        else if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) limit = CONSTANTS.TYPE_LIMITS.OBSERVER;

        return (currentCounts[type] || 0) < limit;
    }

    pickTypeWeighted(candidates) {
        if (!candidates || candidates.length === 0) return null;

        // 0. Forced Non-A Logic (Stage 6+, Every 4th)
        const stage = this.game.currentStage + 1;
        this.debugForceStatus = { active: false, decision: this.spawnDecisionCount, period: 4, picked: null };

        if (stage >= 6) {
            this.spawnDecisionCount++;
            if (this.spawnDecisionCount % 4 === 0) {
                this.debugForceStatus.active = true;
                const forced = this.tryGetForcedNonAType(stage);
                if (forced) {
                    this.debugForceStatus.picked = forced;

                    // Track Force Stats
                    this.debugForceStats.activations++;
                    this.debugForceStats.picksByType[forced] = (this.debugForceStats.picksByType[forced] || 0) + 1;

                    return forced;
                }
            }
        }

        // 1. Roster保証 (最優先)
        const elapsed = (Date.now() - this.stageStartTime) / 1000;
        if (elapsed < 60 && this.rosterWanted.length > 0) {
            const rosterMatch = candidates.find(c => this.rosterWanted.includes(c));
            if (rosterMatch) {
                // Rosterからは削除
                this.rosterWanted = this.rosterWanted.filter(r => r !== rosterMatch);
                return rosterMatch;
            }
        }

        // 2. 重み付け抽選

        // A-Ratio Check (Target Control)
        const aCount = this.historyTypes.filter(t => t === CONSTANTS.ENEMY_TYPES.NORMAL).length;
        const aRatio = this.historyTypes.length > 0 ? aCount / this.historyTypes.length : 0;

        // Target: BurstON=0.70, OFF=0.50 (Stage 6+ only)
        const stageRef = this.game.currentStage + 1;
        let reduceA = false;
        if (stageRef >= 6) {
            const targetA = this.isABurstOn ? 0.70 : 0.50;
            if (aRatio > targetA) reduceA = true;
        }

        let totalWeight = 0;
        const weights = candidates.map(type => {
            let w = 1.0;
            const isLate = (stageRef >= 6);

            // Base Weight Assignment (Stage Based)
            if (isLate) {
                // Late Stage Redistribution
                if (type === CONSTANTS.ENEMY_TYPES.NORMAL) w = 0.30;
                else if (type === CONSTANTS.ENEMY_TYPES.ZIGZAG) w = 0.60;
                else if (type === CONSTANTS.ENEMY_TYPES.EVASIVE) w = 1.20;
                else if (type === CONSTANTS.ENEMY_TYPES.ASSAULT) w = 1.00;
                else if (type === CONSTANTS.ENEMY_TYPES.TRICKSTER) w = 1.20;
                else if (type === CONSTANTS.ENEMY_TYPES.FLANKER) w = 1.10;
                else w = 1.0; // Others default
            } else {
                // Early Stage (Legacy)
                if (type === CONSTANTS.ENEMY_TYPES.NORMAL) w = 0.5;
                else w = 1.0;
            }

            // A-specific Modifiers
            if (type === CONSTANTS.ENEMY_TYPES.NORMAL) {
                // 1) A Burst Logic
                if (!this.isABurstOn) w *= 0.2;
                // 2) A Ratio Target Logic
                if (reduceA) w *= 0.25;
            }

            // Quota Boost (Stage 6+)
            if (isLate) {
                const checkHistory = this.historyTypes.slice(-50);
                const count = checkHistory.filter(t => t === type).length;
                if (count === 0) {
                    // Boost Main Targets if missing
                    if (type === CONSTANTS.ENEMY_TYPES.EVASIVE ||
                        type === CONSTANTS.ENEMY_TYPES.TRICKSTER ||
                        type === CONSTANTS.ENEMY_TYPES.FLANKER) {
                        w *= 5.0;
                    }
                }
            }

            // Plan Bonus
            if (type === this.currentPlan.mainType) w *= 3.0;

            // Anti-Streak (Recent History)
            const streakCount = this.recentTypes.filter(t => t === type).length;
            if (streakCount === 1) w *= 0.25;
            else if (streakCount >= 2) w *= 0.10;

            // 3連続禁止 (実際にはcandidatesに残っていても選ばれないように極小にするか、0にする)
            // ただしここでは 0.10 で残す（完全に詰むのを防ぐため）

            totalWeight += w;
            return { type, weight: w };
        });

        const r = this.random() * totalWeight;
        let s = 0;
        for (const item of weights) {
            s += item.weight;
            if (r < s) {
                let selected = item.type;

                // 3) Filler Variation (Aが選ばれた時、30%で他へ)
                if (selected === CONSTANTS.ENEMY_TYPES.NORMAL && this.random() < 0.3) {
                    // 候補からNORMAL以外、かつ基本種(B/C/E/O)を探す
                    // Unlock済みのものに限る
                    const alts = candidates.filter(t =>
                        t !== CONSTANTS.ENEMY_TYPES.NORMAL &&
                        (t === CONSTANTS.ENEMY_TYPES.ZIGZAG ||
                            t === CONSTANTS.ENEMY_TYPES.EVASIVE ||
                            t === CONSTANTS.ENEMY_TYPES.ASSAULT ||
                            t === CONSTANTS.ENEMY_TYPES.TRICKSTER)
                    );
                    if (alts.length > 0) {
                        selected = alts[Math.floor(this.random() * alts.length)];
                    }
                }
                return selected;
            }
        }

        // Fallback: A (Normal)
        // Stage 6-10: Filler Pool Attempt
        if (stage >= 6) {
            const filler = this.tryGetFillerType(stage);
            if (filler) return filler;
        }

        return candidates[0]; // Fallback to A
    }

    tryGetFillerType(stage) {
        // Pool: B, C, E, O (Basic variants)
        // Late Stage: M, H, I, P (if unlocked & valid)
        let pool = [
            CONSTANTS.ENEMY_TYPES.ZIGZAG,
            CONSTANTS.ENEMY_TYPES.EVASIVE,
            CONSTANTS.ENEMY_TYPES.ASSAULT,
            CONSTANTS.ENEMY_TYPES.TRICKSTER
        ];

        if (stage >= 7) {
            pool.push(CONSTANTS.ENEMY_TYPES.FLANKER);
            pool.push(CONSTANTS.ENEMY_TYPES.ATTRACTOR);
        }
        if (stage >= 5) {
            pool.push(CONSTANTS.ENEMY_TYPES.DASHER);
            pool.push(CONSTANTS.ENEMY_TYPES.ORBITER);
        }

        // Shuffle
        pool.sort(() => this.random() - 0.5);

        for (const t of pool) {
            // Check availability
            if (!this.isUnlocked(t)) continue;
            if (this.cooldowns[t] > 0) continue;
            if (!this.checkPhaseHardCaps(t)) continue;
            // Role Limit check (optional but safer)
            const role = CONSTANTS.ENEMY_ROLES[t] || 'CORE';
            const roleLimit = CONSTANTS.ROLE_LIMITS[role] || 999;
            const counts = this.game.frameCache.roleCounts;
            if ((counts[role] || 0) >= roleLimit) continue;

            return t;
        }
        return null; // Failed to fill
    }

    tryGetForcedNonAType(stage) {
        // Priority 1: Main Targets (C, O, M)
        let pool1 = [
            CONSTANTS.ENEMY_TYPES.EVASIVE,
            CONSTANTS.ENEMY_TYPES.TRICKSTER,
            CONSTANTS.ENEMY_TYPES.FLANKER
        ];
        pool1.sort(() => this.random() - 0.5);

        for (const t of pool1) {
            if (this.canSpawnNow(t, stage)) return t;
        }

        // Priority 2: Other Non-A (B, E, H, I)
        let pool2 = [
            CONSTANTS.ENEMY_TYPES.ZIGZAG,
            CONSTANTS.ENEMY_TYPES.ASSAULT,
            CONSTANTS.ENEMY_TYPES.DASHER,
            CONSTANTS.ENEMY_TYPES.ORBITER
        ];
        pool2.sort(() => this.random() - 0.5);

        for (const t of pool2) {
            if (this.canSpawnNow(t, stage)) return t;
        }

        return null; // Failed to force
    }

    canSpawnNow(type, stage) {
        // 1. Unlock
        if (!this.isUnlocked(type)) return false;

        // 2. Cooldown
        if (this.cooldowns[type] && this.cooldowns[type] > 0) return false;

        // 3. Max Alive (Hard Cap)
        if (!this.checkPhaseHardCaps(type)) return false;

        // 4. Role Limit
        const role = CONSTANTS.ENEMY_ROLES[type] || 'CORE';
        let roleLimit = CONSTANTS.ROLE_LIMITS[role] || 999;

        // Late Stage Check (Sync with buildCandidateList logic)
        if (stage >= 6) {
            if (role === 'HARASSER') roleLimit = 6;
            else if (role === 'ELITE') roleLimit = 3;
            else if (role === 'CONTROLLER') roleLimit = 2;
            else if (role === 'DIRECTOR') roleLimit = 2;
        }

        const counts = this.game.frameCache.roleCounts;
        if ((counts[role] || 0) >= roleLimit) return false;

        return true;
    }

    executeSpawn(type, pattern = 'NONE', overrideX = null, overrideY = null, options = {}) {
        // ... (NAN check or similar)
        // Cooldown設定 (ID -> Key変換がここでも必要だが、Switchで)
        this.setCooldown(type);

        // 履歴更新 (Recent 8 for Anti-Streak)
        this.recentTypes.push(type);
        if (this.recentTypes.length > 8) this.recentTypes.shift();

        // History for Ratio (Last 200)
        this.historyTypes.push(type);
        if (this.historyTypes.length > this.historyMax) this.historyTypes.shift();

        // Cumulative Stats Update
        this.stageSpawnTotalCount++;
        this.stageSpawnByType[type] = (this.stageSpawnByType[type] || 0) + 1;

        // Spawn Position & Side Selection
        let x = overrideX;
        let y = overrideY;
        let side = 'CUSTOM';

        if (overrideX === null || overrideY === null) {
            side = this.getNextSpawnSide();
            const pos = this.calculateSpawnPos(side);
            x = pos.x;
            y = pos.y;
        }

        // Record for HUD stats
        this.recordSpawnStats(side, pattern);

        // Game側へ委譲
        const stageData = CONSTANTS.STAGE_DATA[this.game.currentStage] || { hpMul: 1.0, speedMul: 1.0 };
        const enemy = this.game.enemyPool.get();
        if (!enemy) return;

        enemy.init(x, y, this.game.player.x, this.game.player.y, type, stageData.hpMul, stageData.speedMul);

        // アトラクター属性決定（スポーン時に50%でRED/BLUE）
        if (type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) {
            enemy.attractorKind = this.random() < 0.5 ? CONSTANTS.ATTRACTOR_KIND.RED : CONSTANTS.ATTRACTOR_KIND.BLUE;
        }

        // --- PRODUCTION: Apply Entry & Formation Meta ---
        if (options.entry) enemy.entry = options.entry;
        if (options.formationInfo) enemy.formationInfo = options.formationInfo;

        enemy.id = Enemy.nextId++;
        enemy.age = 0;
        enemy.oobFrames = 0;

        this.game.enemies.push(enemy);

        // --- STATISTICS TRACKING (Unified for Game & Sim) ---
        this.stageSpawnTotalCount++;
        this.stageSpawnByType[type] = (this.stageSpawnByType[type] || 0) + 1;

        if (this.game.economyLogger) {
            this.game.economyLogger.recordSpawn(type);
        }
        this.game.enemiesRemaining--;
        this.game.currentSpawnBudget--;

        if (this.game.debugEnabled) {
            // console.log(`[SPAWN OK] id:${enemy.id} stage:${this.game.currentStage + 1} rem:${this.game.enemiesRemaining + 1}->${this.game.enemiesRemaining} type:${type} total:${this.game.enemies.length}`);
        }

        // 特殊: Barrier Pair
        if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) {
            const partner = this.game.enemyPool.get();
            if (partner) {
                partner.init(x + 40, y + 40, this.game.player.x, this.game.player.y, type, stageData.hpMul, stageData.speedMul);
                partner.id = Enemy.nextId++;
                partner.age = 0;
                partner.oobFrames = 0;

                this.game.enemies.push(partner);
                enemy.partner = partner;
                partner.partner = enemy;
                this.game.enemiesRemaining--;
                this.game.currentSpawnBudget--;
                if (this.game.debugEnabled) {
                    // console.log(`[SPAWN OK] (PARTNER) id:${partner.id} stage:${this.game.currentStage + 1} rem:${this.game.enemiesRemaining + 1}->${this.game.enemiesRemaining} type:${type} total:${this.game.enemies.length}`);
                }
            }
        }
    }

    setCooldown(type) {
        let cd = 0;
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) cd = CONSTANTS.SPAWN_COOLDOWNS.SHIELDER;
        else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) cd = CONSTANTS.SPAWN_COOLDOWNS.GUARDIAN;
        else if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) cd = CONSTANTS.SPAWN_COOLDOWNS.BARRIER_PAIR;
        else if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) cd = CONSTANTS.SPAWN_COOLDOWNS.OBSERVER;
        else if (type === CONSTANTS.ENEMY_TYPES.DASHER) cd = CONSTANTS.SPAWN_COOLDOWNS.DASHER;
        else if (type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) cd = CONSTANTS.SPAWN_COOLDOWNS.ATTRACTOR;

        if (cd > 0) {
            this.cooldowns[type] = cd * 1000; // ms変換
        }
    }

    setNextSpawnInterval() {
        const st = this.game.currentStage + 1;
        let base = 200; // default

        // Burst/Lull
        if (this.intensity === 'BURST') {
            base = 140 + this.random() * 80;
        } else {
            base = 280 + this.random() * 120;
        }

        // Stage補正 (Stage 2-4は遅く)
        if (stage === 2) base *= 1.8;
        else if (stage === 3) base *= 1.5;
        else if (stage === 4) base *= 1.2;

        this.spawnTimer = base;
    }

    enterBurst() {
        this.intensity = 'BURST';
        this.intensityTimer = 10000 + this.random() * 8000;

        // 隊列イベントチャンス (30%)
        if (this.game.currentStage >= 1 && this.random() < 0.3) {
            this.queueFormation();
        }
    }

    enterLull() {
        this.intensity = 'LULL';
        this.intensityTimer = 6000 + this.random() * 4000;
    }

    nextPhase() {
        // A -> B -> C rotation
        if (this.phase === 'A') this.phase = 'B';
        else if (this.phase === 'B') this.phase = 'C';
        else this.phase = 'A';
        this.phaseTimer = 10000;
        this.buildPlan();
    }

    buildPlan() {
        // フェーズごとのPlan構築 (簡易)
        const stage = this.game.currentStage + 1;

        if (this.phase === 'A') {
            this.currentPlan.mainRole = 'CORE';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.NORMAL;
            if (stage >= 2 && this.random() < 0.5) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.ZIGZAG;
        } else if (this.phase === 'B') {
            this.currentPlan.mainRole = 'HARASSER';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.EVASIVE;
            if (stage >= 5) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.DASHER;
        } else {
            this.currentPlan.mainRole = 'CONTROLLER';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.SHIELDER; // デフォルト
            if (stage >= 6) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.BARRIER_PAIR;
        }
    }

    canFormFormation(type) {
        const T = CONSTANTS.ENEMY_TYPES;
        // 除外リスト (SSOT)
        const EXCLUDED = [
            T.SHIELDER,     // 'F'
            T.GUARDIAN,     // 'G'
            T.BARRIER_PAIR, // 'N'
            T.SPLITTER_CHILD // 'K'
        ];
        return !EXCLUDED.includes(type);
    }

    pickFormationPattern(type) {
        const WEIGHTS = {
            DEFAULT: {
                LINE: 15, HLINE: 10, V_SHAPE: 10, FAN: 10, DOUBLE: 10,
                CIRCLE: 15, ARC: 10, GRID: 5, RANDOM_CLUSTER: 10, CROSS: 5, DOUBLE_RING: 5
            },
            // 難易度調整用 (速い/高HPなど)
            [CONSTANTS.ENEMY_TYPES.DASHER]: {
                LINE: 20, HLINE: 20, V_SHAPE: 20, FAN: 20, DOUBLE: 20, CIRCLE: 0, GRID: 0 // 速いので GRID 等は避ける
            }
        };

        const w = WEIGHTS[type] || WEIGHTS.DEFAULT;
        const total = Object.values(w).reduce((acc, v) => acc + v, 0);
        let r = this.random() * total;

        for (const [pattern, weight] of Object.entries(w)) {
            r -= weight;
            if (r <= 0) return pattern;
        }
        return 'LINE';
    }

    queueFormation(pattern, type, count) {
        // Pick an anchor side and position for the formation
        const side = this.getNextSpawnSide();
        let anchor = this.calculateSpawnPos(side);

        // NONE (Random/Cluster)
        if (pattern === 'NONE' || pattern === 'RANDOM_BURST') {
            for (let i = 0; i < count; i++) {
                // Apply scattering to anchor
                const offsetX = (this.random() - 0.5) * 200;
                const offsetY = (this.random() - 0.5) * 200;
                this.spawnQueue.push({
                    type, pattern: pattern,
                    x: anchor.x + offsetX,
                    y: anchor.y + offsetY,
                    side: side,
                    nextDelay: 50 + this.random() * 100
                });
            }
            return;
        }

        // Formation shapes
        const spacing = 60;
        const offsets = Formations.getOffsets(pattern, count, spacing);

        // Rotate offsets based on spawn side to face inward
        const rotatedOffsets = this.rotateOffsetsForSide(offsets, side);

        // --- PUSH-BACK LOGIC: Ensure no one spawns inside the screen ---
        // We adjust the anchor so that the entire formation starts outside the margin.
        const margin = 60;
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;

        if (rotatedOffsets.length > 0) {
            let minDX = 0, maxDX = 0, minDY = 0, maxDY = 0;
            rotatedOffsets.forEach(off => {
                minDX = Math.min(minDX, off.dx);
                maxDX = Math.max(maxDX, off.dx);
                minDY = Math.min(minDY, off.dy);
                maxDY = Math.max(maxDY, off.dy);
            });

            // Depending on side, push anchor further out
            switch (side) {
                case 'TOP':
                    anchor.y = -margin - maxDY;
                    break;
                case 'BOTTOM':
                    anchor.y = h + margin - minDY;
                    break;
                case 'LEFT':
                    anchor.x = -margin - maxDX;
                    break;
                case 'RIGHT':
                    anchor.x = w + margin - minDX;
                    break;
                case 'TOP_LEFT':
                    anchor.x = -margin - maxDX;
                    anchor.y = -margin - maxDY;
                    break;
                case 'TOP_RIGHT':
                    anchor.x = w + margin - minDX;
                    anchor.y = -margin - maxDY;
                    break;
                case 'BOTTOM_LEFT':
                    anchor.x = -margin - maxDX;
                    anchor.y = h + margin - minDY;
                    break;
                case 'BOTTOM_RIGHT':
                    anchor.x = w + margin - minDX;
                    anchor.y = h + margin - minDY;
                    break;
            }
        }
        // ----------------------------------------------------------------

        // Calculate Glide Vector (Anchor -> Center)
        const center = { x: CONSTANTS.TARGET_WIDTH / 2, y: CONSTANTS.TARGET_HEIGHT / 2 };
        const glideAngle = Math.atan2(center.y - anchor.y, center.x - anchor.x);
        const glideSpeed = 150; // Glide speed px/s
        const glideVX = Math.cos(glideAngle) * glideSpeed;
        const glideVY = Math.sin(glideAngle) * glideSpeed;

        for (let i = 0; i < rotatedOffsets.length; i++) {
            const off = rotatedOffsets[i];
            this.spawnQueue.push({
                type, pattern: pattern,
                x: anchor.x + off.dx,
                y: anchor.y + off.dy,
                side: side,
                nextDelay: (pattern === 'LINEAR' || pattern === 'HLINE') ? 150 : 0,
                // Meta for Production
                entry: { t: 0, dur: 0.8, vx: glideVX, vy: glideVY },
                formationInfo: { t: 0, anchor: anchor, offset: off, pattern: pattern }
            });
        }
    }

    rotateOffsetsForSide(offsets, side) {
        // We assume face inward is towards center.
        // Base orientation: TOP (spawning at top, moving DOWN, offsets relative to TOP)
        // Adjust offsets based on side.
        let angle = 0;
        switch (side) {
            case 'TOP': angle = 0; break;
            case 'BOTTOM': angle = Math.PI; break;
            case 'LEFT': angle = -Math.PI / 2; break;
            case 'RIGHT': angle = Math.PI / 2; break;
            case 'TOP_LEFT': angle = -Math.PI / 4; break;
            case 'TOP_RIGHT': angle = Math.PI / 4; break;
            case 'BOTTOM_LEFT': angle = -3 * Math.PI / 4; break;
            case 'BOTTOM_RIGHT': angle = 3 * Math.PI / 4; break;
        }

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return offsets.map(off => ({
            dx: off.dx * cos - off.dy * sin,
            dy: off.dx * sin + off.dy * cos
        }));
    }

    // --- Formation Helpers (Updated to use count) ---

    queueLine(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const margin = 50;
        const startX = this.random() * (w - 100) + 50;
        for (let i = 0; i < count; i++) {
            this.spawnQueue.push({
                type, pattern: 'LINEAR',
                x: startX, y: -margin - (i * 60),
                nextDelay: 150
            });
        }
    }

    queuePincer(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const margin = 50;
        // count must be pairs roughly
        const pairs = Math.ceil(count / 2);

        for (let i = 0; i < pairs; i++) {
            const y = h * (0.2 + 0.6 * (i / Math.max(1, pairs - 1)));
            // Left
            this.spawnQueue.push({
                type, pattern: 'PARALLEL',
                x: -margin, y: y,
                nextDelay: 0
            });
            // Right (if budget allowed)
            this.spawnQueue.push({
                type, pattern: 'PARALLEL',
                x: w + margin, y: y,
                nextDelay: 400
            });
        }
    }

    queueVShape(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const margin = 50;
        const centerX = this.random() * (w - 200) + 100;
        const startY = -margin;

        // Lead
        this.spawnQueue.push({ type, pattern: 'V_SHAPE', x: centerX, y: startY, nextDelay: 100 });

        // Wings
        // count = total enemies. 1 lead, rest wings.
        const wings = Math.max(0, count - 1);
        const pairs = Math.ceil(wings / 2);

        for (let i = 1; i <= pairs; i++) {
            const offsetX = i * 60;
            const offsetY = i * 50;
            if ((i * 2 - 1) <= wings) {
                // Left Wing
                this.spawnQueue.push({ type, pattern: 'V_SHAPE', x: centerX - offsetX, y: startY - offsetY, nextDelay: 0 });
            }
            if ((i * 2) <= wings) {
                // Right Wing
                this.spawnQueue.push({ type, pattern: 'V_SHAPE', x: centerX + offsetX, y: startY - offsetY, nextDelay: 100 });
            }
        }
    }

    queueCircle(type, count) {
        // Player surround or Center screen
        const cx = this.game.player.x;
        const cy = this.game.player.y;
        const radius = 350;
        // const count passed from arg

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;

            this.spawnQueue.push({
                type, pattern: 'CIRCLE',
                x: x, y: y,
                nextDelay: 50 // Almost simultaneous but slightly rippled
            });
        }
    }

    queueGrid(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const startX = this.random() > 0.5 ? 100 : w - 300;
        const startY = -100;

        // count -> cols x rows approximation
        const cols = 3;
        const rows = Math.ceil(count / cols);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if ((r * cols + c) >= count) break;

                this.spawnQueue.push({
                    type, pattern: 'GRID',
                    x: startX + c * 60,
                    y: startY - r * 60,
                    nextDelay: (c === cols - 1) ? 300 : 0 // Row by row
                });
            }
        }
    }

    queueStream(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const startX = this.random() * w;
        const margin = 50;
        // count from arg

        for (let i = 0; i < count; i++) {
            this.spawnQueue.push({
                type, pattern: 'STREAM',
                x: startX + (this.random() * 40 - 20), // Slight jitter
                y: -margin,
                nextDelay: 80 // Very fast stream
            });
        }
    }

    queueCross(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const margin = 50;

        // Top, Bottom, Left, Right
        const positions = [
            { x: w / 2, y: -margin },
            { x: w / 2, y: h + margin },
            { x: -margin, y: h / 2 },
            { x: w + margin, y: h / 2 }
        ];

        for (let i = 0; i < count; i++) {
            const pos = positions[i % 4];
            this.spawnQueue.push({
                type, pattern: 'CROSS',
                x: pos.x, y: pos.y,
                nextDelay: (i % 4 === 3) ? 400 : 0 // Batch of 4
            });
        }
    }

    queueRandomBurst(type, count) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const margin = 50;

        for (let i = 0; i < count; i++) {
            let x, y;
            if (this.random() < 0.5) {
                x = this.random() * w;
                y = this.random() < 0.5 ? -margin : h + margin;
            } else {
                x = this.random() < 0.5 ? -margin : w + margin;
                y = this.random() * h;
            }

            this.spawnQueue.push({
                type, pattern: 'RANDOM_BURST',
                x: x, y: y,
                nextDelay: 50 // Rapid fire
            });
        }
    }

    log(action, type, detail) {
        // Log system disabled
    }
    // --- DEBUG SPAWN ---
    handleDebugSpawn(dt) {
        // Refined Logic (Debug Tools Support):
        // 1. Target Type & Formation from Game
        const debugType = this.game.debugTargetType || CONSTANTS.ENEMY_TYPES.NORMAL;
        const debugType2 = this.game.debugTargetType2;
        const debugFormation = this.game.debugFormation || 'NONE';

        // 2. Queue Processing (Highest Priority)
        if (this.spawnQueue.length > 0) {
            this.spawnIntervalTimer -= dt;
            if (this.spawnIntervalTimer <= 0) {
                const task = this.spawnQueue[0];
                const options = {
                    entry: task.entry,
                    formationInfo: task.formationInfo
                };
                this.executeSpawn(task.type, task.pattern, task.x, task.y, options);
                this.spawnQueue.shift();

                // Interval for next task
                this.spawnIntervalTimer = (task.nextDelay !== undefined) ? task.nextDelay : 100;
            }
            return;
        }

        // 3. Count Active and Pending enemies
        const activeCount = this.game.enemies.filter(e => e.active).length;
        const pendingCount = this.spawnQueue.length;
        const totalCount = activeCount + pendingCount;

        // 4. Spawn Cap based on Slider
        const maxSpawn = this.game.debugSpawnCount || 1;

        if (totalCount < maxSpawn && this.spawnIntervalTimer <= 0) {
            // Determine which type to spawn (alternate between TYPE1 and TYPE2)
            let currentType = debugType;
            if (debugType2 && debugType2 !== 'NONE') {
                // Initialize toggle if not exists
                if (this.debugTypeToggle === undefined) this.debugTypeToggle = false;

                // Alternate between TYPE1 and TYPE2
                currentType = this.debugTypeToggle ? debugType2 : debugType;
                this.debugTypeToggle = !this.debugTypeToggle;
            }

            if (debugFormation !== 'NONE') {
                // Spawn as a formation
                const count = Math.min(6, maxSpawn - totalCount); // Limit squad size in debug
                const actualCount = count < 3 ? count : count; // logic
                this.queueFormation(debugFormation, currentType, count);
                // The queueFormation will fill spawnQueue, next update will process it.
            } else {
                // Conventional Single / Pair Spawn
                if (currentType === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) {
                    this.spawnPairDebug(currentType);
                    this.spawnIntervalTimer = 1000;
                } else {
                    const stageData = CONSTANTS.STAGE_DATA[this.game.currentStage] || { hpMul: 1.0, speedMul: 1.0 };
                    const hpMul = (this.game.debugHpMul || 1.0);
                    const speedMul = (this.game.debugSpeedMul || 1.0);

                    // Use executeSpawn with manual override if needed
                    this.executeSpawn(currentType, 'NONE', null, null);

                    // Apply debug overrides to the last spawned enemy
                    const lastE = this.game.enemies[this.game.enemies.length - 1];
                    if (lastE && lastE.active) {
                        lastE.maxHp *= hpMul;
                        lastE.hp = lastE.maxHp;
                        lastE.baseSpeed *= speedMul;
                        lastE.currentSpeed = lastE.baseSpeed;
                    }

                    this.spawnIntervalTimer = totalCount < maxSpawn / 2 ? 200 : 1000;
                }
            }
        } else {
            this.spawnIntervalTimer -= dt;
        }

        // Budget Logic (compatibility)
        this.budgetTimer -= dt;
        if (this.budgetTimer <= 0) {
            this.budgetTimer = 15000;
            this.specialBudget = 20;
        }
    }

    spawnPair(w, h, margin, type) {
        // Simple Barrier Pair Spawn Logic (reused or simplified)
        const e1 = this.game.enemyPool.get();
        const e2 = this.game.enemyPool.get();
        if (e1 && e2) {
            // Offset for pair
            const ox = 60;
            const cx = w / 2;
            const cy = -margin;

            const speedMul = 1.0;
            const hpMul = 1.0;

            e1.id = Enemy.nextId++;
            e2.id = Enemy.nextId++;
            e1.init(cx - ox, cy, this.game.player.x, this.game.player.y, type, hpMul, speedMul);
            e2.init(cx + ox, cy, this.game.player.x, this.game.player.y, type, hpMul, speedMul);

            // Link them
            e1.partner = e2;
            e2.partner = e1;

            this.game.enemies.push(e1);
            this.game.enemies.push(e2);
        }
    }

    spawnPairDebug(type) {
        const e1 = this.game.enemyPool.get();
        const e2 = this.game.enemyPool.get();
        if (e1 && e2) {
            const angle = this.random() * Math.PI * 2;
            const dist = 450;
            const cx = 400 + Math.cos(angle) * dist;
            const cy = 400 + Math.sin(angle) * dist;

            const ox = 40; // Pair offset
            const speedMul = this.game.debugSpeedMul || 1.0;
            const hpMul = this.game.debugHpMul || 1.0;

            e1.id = Enemy.nextId++;
            e2.id = Enemy.nextId++;
            e1.init(cx - ox, cy - ox, this.game.player.x, this.game.player.y, type, hpMul, speedMul);
            e2.init(cx + ox, cy + ox, this.game.player.x, this.game.player.y, type, hpMul, speedMul);

            e1.partner = e2;
            e2.partner = e1;

            this.game.enemies.push(e1);
            this.game.enemies.push(e2);
        }
    }

    // --- DEBUG SPAWN ---

    /**
     * デバッグ用ボス生成：多重生成を防止し、既存がいる場合はリセットする
     */
    spawnBossDebug(bossId, opts = {}) {
        const forceRespawn = opts.forceRespawn || false;

        // 1. 既存のボスを検索
        const existingBoss = this.game.enemies.find(e => e.active && e.isBoss);

        if (existingBoss && !forceRespawn) {
            // 既存を再利用：HP全快、位置リセット
            existingBoss.hp = existingBoss.maxHp;
            existingBoss.x = CONSTANTS.TARGET_WIDTH / 2;
            existingBoss.y = 150; // 画面内に配置
            existingBoss.vx = 0;
            existingBoss.vy = 0;

            // 特殊な移動状態のリセット（両方とも Stage 5 の接近・停止挙動に統一）
            existingBoss.bossIndex = bossId; // 識別子を更新
            existingBoss.movementMode = 'DIRECT'; // Boss Stop Logic が入るモード
            existingBoss.orbitRadius = 180; // (DIRECTモードでは参照されないが、念のためのフォールバック)
            existingBoss.turnRate = 0.03;
            if (bossId === 9) {
                existingBoss.orbitAngle = -Math.PI / 2;
            }

            if (this.game.audio) this.game.audio.play('upgrade', { volume: 0.5 });
            return existingBoss;
        }

        if (existingBoss && forceRespawn) {
            existingBoss.active = false; // デスポーン
        }

        // 2. 新規生成
        const boss = this.game.enemyPool.get();
        if (boss) {
            const x = CONSTANTS.TARGET_WIDTH / 2;
            const y = -100;
            const hpMul = this.game.debugHpMul || 1.0;

            // ステージごとのボス設定を模倣
            // bossId は内部的には 0-indexed (4: Stage 5, 9: Stage 10) と想定
            const targetStage = parseInt(bossId);
            const stageData = CONSTANTS.STAGE_DATA[targetStage] || { hpMul: 1.0 };

            boss.initBoss(x, y, this.game.player.x, this.game.player.y, stageData.hpMul * hpMul, (bx, by) => {
                this.game.handleBossSummon(bx, by);
            });
            boss.bossIndex = targetStage; // 識別子を設定

            // 両方とも Stage 5 の接近・停止挙動に統一
            boss.movementMode = 'DIRECT'; // Enemy.js 内で isBoss なら停止するロジックが動く
            boss.orbitRadius = 180;
            boss.turnRate = 0.03;

            this.game.enemies.push(boss);
            if (this.game.audio) this.game.audio.play('dash', { volume: 0.6 });
            return boss;
        }
        return null;
    }

    setRNG(rng) {
        this.rng = rng;
    }

    random() {
        if (this.rng) return this.rng.next();
        return Math.random();
    }
}

