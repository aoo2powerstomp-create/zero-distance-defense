import { CONSTANTS } from './constants.js';
import { Effects } from './Effects.js';
import { DEBUG_ENABLED } from './utils/env.js';

export class Enemy {
    static nextId = 0;
    constructor() {
        this.id = -1; // Assigned only at spawn
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.active = false;
        this.hp = 1;
        this.maxHp = 1;
        this.isMinion = false;
        this.lastContactTime = 0;
        this.type = CONSTANTS.ENEMY_TYPES.NORMAL;
        this.spawnTime = 0;
        this.baseAngle = 0; // 中央へ向かう基本角度
        this.isEvading = false;
        this.lastRetrackTime = 0;
        this.knockVX = 0;
        this.knockVY = 0;
        this.isBoss = false;
        this.lastSummonTime = 0;
        this.onSummon = null;
        this.partner = null; // BARRIER_PAIR 用
        this.isMinion = false; // Minionフラグ (Splitter子機など、フェーズ進行に関与しない)
        this.lifespan = 0;     // Minion用寿命 (秒)

        // ボス用の安全装置（DPSキャップ）
        this.damageInCurrentSecond = 0;
        this.lastDamageResetTime = 0;

        // シールダー用の状態
        this.barrierState = 'idle'; // 'idle', 'windup', 'active', 'vulnerable'
        this.barrierTimer = 0;
        this.orbitAngle = 0;
        this.killed = false;
        this.age = 0;
        this.movementPhase = 0;
        this.repulsionForce = { x: 0, y: 0 };
        this.destroyReason = null;
        this.deactivateReason = null; // Reason for becoming inactive (kill, oob, timeout, etc.)
        this.oobFrames = 0; // Screen-space OOB counter

        // リフレクター用の状態
        this.isReflectActive = true;
        this.reflectCycleTimer = 0;
    }

    init(x, y, targetX, targetY, type = CONSTANTS.ENEMY_TYPES.NORMAL, hpMul = 1.0, speedMul = 1.0, affinity = CONSTANTS.ENEMY_AFFINITIES.SWARM) {
        // NaN Guard
        if (isNaN(x)) x = 400;
        if (isNaN(y)) y = -50;
        if (isNaN(targetX)) targetX = 400;
        if (isNaN(targetY)) targetY = 400;

        this.x = x;
        this.y = y;
        this.renderX = x;
        this.renderY = y;
        this.renderAngle = 0;
        this.type = type;
        this.affinity = affinity;
        this.partner = null; // Stale partner reset
        this.isMinion = false;
        this.lifespan = 0;
        this.spawnTime = Date.now();
        this.isEvading = false;
        this.evasiveStartTime = 0;
        this.lastRetrackTime = Date.now();
        this.stageSpeedMul = speedMul;
        this.angle = Math.atan2(targetY - y, targetX - x);
        this.killed = false;
        this.active = true;
        this.age = 0;
        this.movementPhase = Math.random() * Math.PI * 2;
        this.repulsionForce = { x: 0, y: 0 };
        this.vx = 0;
        this.vy = 0;
        this.destroyReason = null;
        this.oobFrames = 0;

        // タイプ別の基本速度倍率 (定数ファイルに個別定義がない場合の等倍フォールバック)
        let typeSpeedMul = 1.0;
        const enemyCfg = CONSTANTS[Object.keys(CONSTANTS.ENEMY_TYPES).find(key => CONSTANTS.ENEMY_TYPES[key] === type)];

        if (enemyCfg && enemyCfg.speed !== undefined) {
            typeSpeedMul = enemyCfg.speed;
            this.baseSpeed = typeSpeedMul * speedMul; // 定数定義があればそれをベースにする
        } else {
            // 互換性のためのハードコード倍率
            if (type === CONSTANTS.ENEMY_TYPES.ZIGZAG) typeSpeedMul = 1.2;
            else if (type === CONSTANTS.ENEMY_TYPES.EVASIVE) typeSpeedMul = 1.4;
            else if (type === CONSTANTS.ENEMY_TYPES.TRICKSTER) typeSpeedMul = 1.3;
            else if (type === CONSTANTS.ENEMY_TYPES.ORBITER) typeSpeedMul = 2.5;
            else if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) typeSpeedMul = 2.0;
            else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) typeSpeedMul = 1.5;
            else if (type === CONSTANTS.ENEMY_TYPES.FLANKER) typeSpeedMul = 1.4;
            else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER) typeSpeedMul = 1.2;
            else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) typeSpeedMul = 1.5;
            else if (type === CONSTANTS.ENEMY_TYPES.DASHER) typeSpeedMul = 1.2;
            else if (type === CONSTANTS.ENEMY_TYPES.REFLECTOR) typeSpeedMul = 1.0;

            this.baseSpeed = CONSTANTS.ENEMY_BASE_SPEED * speedMul * typeSpeedMul;
        }

        // リフレクターの初期化
        if (type === CONSTANTS.ENEMY_TYPES.REFLECTOR) {
            this.isReflectActive = true;
            this.reflectCycleTimer = CONSTANTS.REFLECTOR.activeDurationMs || 7000;
        }

        // 移動設定の初期化
        this.configureMovement(type);

        // 初期角度の設定
        this.angle = Math.atan2(targetY - y, targetX - x); // 実際の移動方向
        this.vx = Math.cos(this.angle) * this.baseSpeed;
        this.vy = Math.sin(this.angle) * this.baseSpeed;

        // FLANKER の初期角度補正 (出現時から少し横を向く)
        if (this.movementMode === 'FLANK') {
            this.flankSide = Math.random() < 0.5 ? 1 : -1;
            this.angle += (Math.PI / 4) * this.flankSide;
            this.vx = Math.cos(this.angle) * this.baseSpeed;
            this.vy = Math.sin(this.angle) * this.baseSpeed;
        }

        // DASHERの初期化
        if (this.movementMode === 'DASH') {
            this.dashState = 0; // Use integer 0 (Approach) instead of string 'normal'
            this.dashTimer = Math.random() * (CONSTANTS.DASHER.dashCooldownMs || 2000);
            this.curveDir = (this.id % 2 === 0) ? 1 : -1;
            this.weavePhase = Math.random() * Math.PI * 2;
        }

        this.currentSpeed = this.baseSpeed;
        this.movementPhase = Math.random() * Math.PI * 2;

        this.renderX = x;
        this.renderY = y;
        this.active = true;

        let eliteHpMul = 1.0;
        if (type === CONSTANTS.ENEMY_TYPES.ELITE) {
            eliteHpMul = CONSTANTS.ELITE_HP_MUL;
        }

        // 属性補正（ARMOREDはHP高め）
        let affinityHpMul = 1.0;
        if (affinity === CONSTANTS.ENEMY_AFFINITIES.ARMORED) {
            affinityHpMul = 1.5; // +50%
        }

        // HP設定
        if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER) {
            this.hp = Math.round(CONSTANTS.SHIELDER.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
            this.hp = Math.round(CONSTANTS.GUARDIAN.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) {
            this.hp = Math.round(CONSTANTS.ATTRACTOR.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.DASHER) {
            this.hp = Math.round(CONSTANTS.DASHER.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.ORBITER) {
            this.hp = Math.round(CONSTANTS.ORBITER.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.SPLITTER) {
            this.hp = Math.round(CONSTANTS.SPLITTER.maxHp * hpMul);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) {
            this.hp = Math.round(CONSTANTS.SPLITTER_CHILD.maxHp * hpMul);
        } else {
            this.hp = Math.round(1 * hpMul * eliteHpMul * affinityHpMul);
        }
        this.maxHp = this.hp;
        this.lastContactTime = 0;
        this.knockVX = 0;
        this.knockVY = 0;
        this.isBoss = false;
        this.lastSummonTime = Date.now();
        this.onSummon = null;

        // 制御レイヤー：世代管理と回避制限
        this.generation = 0;
        this.evasionTimer = 0;

        // OBSERVER 用
        this.obsState = 'hold';
        this.obsTimer = 0;
        this.slotIndex = 0;
        this.nextSlotIndex = 0;
        this.didMarkThisHold = false;

        this.startX = x;
        this.startY = y;
        this.isShielded = false; // オーラ保護状態のキャッシュ
        this.pulseOutlineTimer = 0; // パルスヒット時の発光用

        // 進行方向への回転設定
        const directionalTypes = [
            CONSTANTS.ENEMY_TYPES.ASSAULT,
            CONSTANTS.ENEMY_TYPES.DASHER,
            CONSTANTS.ENEMY_TYPES.ELITE,
            CONSTANTS.ENEMY_TYPES.EVASIVE,
            CONSTANTS.ENEMY_TYPES.ORBITER,
            CONSTANTS.ENEMY_TYPES.ZIGZAG,
            CONSTANTS.ENEMY_TYPES.FLANKER,
            CONSTANTS.ENEMY_TYPES.TRICKSTER,
            CONSTANTS.ENEMY_TYPES.SPLITTER,
            CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD,
            CONSTANTS.ENEMY_TYPES.REFLECTOR,
            CONSTANTS.ENEMY_TYPES.DASHER,
            CONSTANTS.ENEMY_TYPES.SHIELDER,
            CONSTANTS.ENEMY_TYPES.GUARDIAN,
            CONSTANTS.ENEMY_TYPES.OBSERVER,
            CONSTANTS.ENEMY_TYPES.ATTRACTOR,
            CONSTANTS.ENEMY_TYPES.BARRIER_PAIR,
            CONSTANTS.ENEMY_TYPES.ASSAULT,
            CONSTANTS.ENEMY_TYPES.NORMAL
        ];
        this.hasDirection = directionalTypes.includes(this.type);
        this.angle = 0;
    }

    initBoss(x, y, targetX, targetY, hpMul, onSummon) {
        // ボスは属性なし（または全属性耐性なしなどの特殊扱いも可だが、一旦SWARM固定）
        this.init(x, y, targetX, targetY, CONSTANTS.ENEMY_TYPES.NORMAL, hpMul * CONSTANTS.BOSS_HP_MUL, CONSTANTS.BOSS_SPEED_MUL, CONSTANTS.ENEMY_AFFINITIES.SWARM);
        this.isBoss = true;
        this.radius = CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL;
        this.onSummon = onSummon;
        this.lastSummonTime = Date.now();
    }

    applyKnockback(vx, vy, power) {
        // NaN Guard
        if (isNaN(vx) || isNaN(vy) || isNaN(power)) return;

        // ボスは完全不動
        if (this.isBoss) return;

        // エリート耐性の適用
        let actualPower = power;
        if (this.type === CONSTANTS.ENEMY_TYPES.ELITE) {
            actualPower *= (1.0 - CONSTANTS.ELITE_KB_RESIST);
        }

        // 属性耐性（ARMOREDはKB耐性あり）
        if (this.affinity === CONSTANTS.ENEMY_AFFINITIES.ARMORED) {
            actualPower *= 0.7; // 30%軽減
        }

        // 弾の進行方向ベクトルを正規化してパワーを掛ける
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > 0.001) { // Safety epsilon
            this.knockVX += (vx / mag) * actualPower;
            this.knockVY += (vy / mag) * actualPower;

            // 吹き飛び過ぎ防止（クランプ）
            const kMag = Math.sqrt(this.knockVX * this.knockVX + this.knockVY * this.knockVY);
            const limit = this.isBoss ? CONSTANTS.ENEMY_KNOCKBACK_MAX * 0.5 : CONSTANTS.ENEMY_KNOCKBACK_MAX;
            if (kMag > limit) {
                this.knockVX = (this.knockVX / kMag) * limit;
                this.knockVY = (this.knockVY / kMag) * limit;
            }
        }
    }

    configureMovement(type) {
        // デフォルト設定のリセット
        this.movementMode = 'DIRECT';
        this.turnRate = 0; // 0 = 無制限 (Instant Turn)
        this.orbitRadius = 0;
        this.subState = 0;
        this.chargeAngle = 0;

        // サブステートタイマー類の強制リセット（プール再利用対策）
        this.flankState = undefined;
        this.flankTimer = 0;
        this.dashState = undefined;
        this.dashTimer = 0;
        this.eliteState = undefined;
        this.eliteTimer = 0;
        this.stepTimer = undefined;
        this.evasionState = 0;
        this.evasionTimer = 0;

        switch (type) {
            case CONSTANTS.ENEMY_TYPES.NORMAL:
                this.movementMode = 'DIRECT';
                break;
            case CONSTANTS.ENEMY_TYPES.ZIGZAG:
            case 'ZIGZAG':
                this.movementMode = 'ZIGZAG';
                this.zigzagFreq = 0.003;
                this.zigzagAmp = 50;
                break;
            case CONSTANTS.ENEMY_TYPES.SPLITTER:
            case 'SPLITTER':
                this.movementMode = 'STEP';
                this.stepTimer = 0;
                this.stepAxis = Math.random() < 0.5 ? 0 : 1;
                this.stepDir = Math.random() < 0.5 ? 1 : -1;
                break;
            case CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD:
            case 'SPLITTER_CHILD':
                // Randomized Movement for children (as requested)
                const childTypes = [
                    CONSTANTS.ENEMY_TYPES.NORMAL,  // 'A'
                    CONSTANTS.ENEMY_TYPES.ZIGZAG,  // 'B'
                    CONSTANTS.ENEMY_TYPES.EVASIVE, // 'C'
                    CONSTANTS.ENEMY_TYPES.ORBITER, // 'I'
                    CONSTANTS.ENEMY_TYPES.FLANKER, // 'M'
                    CONSTANTS.ENEMY_TYPES.TRICKSTER // 'O'
                ];
                const selectedType = childTypes[Math.floor(Math.random() * childTypes.length)];

                // Recursively configure as the selected type's movement pattern
                this.configureMovement(selectedType);

                // Keep child-specific stats (from constants)
                const childCfg = CONSTANTS.SPLITTER_CHILD;
                if (this.movementMode === 'ZIGZAG') {
                    this.zigzagFreq = childCfg.zigzagFreq || 0.006;
                    this.zigzagAmp = childCfg.zigzagAmp || 30;
                }
                break;
            case CONSTANTS.ENEMY_TYPES.ASSAULT:
                this.movementMode = 'ASSAULT_CURVE';
                this.turnRate = CONSTANTS.ASSAULT_CURVE.turnRateWhileWeaving;
                this.assaultState = 0; // 0:Weave, 1:Charge
                this.weavePhase = Math.random() * Math.PI * 2;
                break;
            case CONSTANTS.ENEMY_TYPES.EVASIVE:
                this.movementMode = 'EVASIVE';
                this.turnRate = 0.12; // High turn rate for recovery
                this.evasionTimer = Math.random() * 1000 + 500; // Initial delay
                this.evasionState = 0; // 0:Approach, 1:Evade
                this.evasionDir = 1;
                break;
            case CONSTANTS.ENEMY_TYPES.ELITE:
                this.movementMode = 'ELITE';
                this.turnRate = 0.05;
                this.orbitRadius = 180;
                this.eliteState = 0; // 0:Orbit, 1:Telegraph, 2:Charge, 3:Cooldown
                this.eliteTimer = CONSTANTS.ELITE_CHARGE.orbitDuration + Math.random() * 1000;
                break;
            case CONSTANTS.ENEMY_TYPES.SHIELDER:
            case CONSTANTS.ENEMY_TYPES.GUARDIAN:
            // CONSTANTS.ENEMY_TYPES.ELITE (Separated)
            case CONSTANTS.ENEMY_TYPES.ATTRACTOR:
            case CONSTANTS.ENEMY_TYPES.OBSERVER:
                this.movementMode = 'HOVER';
                this.turnRate = (type === CONSTANTS.ENEMY_TYPES.OBSERVER) ? 0.05 : 0.03;
                this.orbitRadius = (type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) ? 300 : 180;

                // シールダー系初期化
                if (type === CONSTANTS.ENEMY_TYPES.SHIELDER || type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
                    const config = type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
                    this.barrierState = 'idle';
                    this.barrierTimer = Math.random() * (config.barrierCooldownMs || 0);
                    this.orbitAngle = Math.random() * Math.PI * 2;
                }
                break;
            case CONSTANTS.ENEMY_TYPES.ORBITER:
                this.movementMode = 'ORBIT';
                this.orbitRadius = 250;
                this.orbitAngle = Math.random() * Math.PI * 2;
                break;
            case CONSTANTS.ENEMY_TYPES.DASHER:
                this.movementMode = 'DASH';
                this.turnRate = 0.12; // High turn rate for weaving
                this.dashState = 0;
                this.weavePhase = Math.random() * Math.PI * 2;
                this.hasDirection = true; // Force direction flag
                break;
            case CONSTANTS.ENEMY_TYPES.FLANKER:
                this.movementMode = 'FLANK';
                this.turnRate = 0.06;
                this.orbitRadius = 220;
                this.flankState = 0; // Force start from approach
                this.flankTimer = 0;
                this.chargeAngle = 0;
                break;
            case CONSTANTS.ENEMY_TYPES.TRICKSTER:
                this.movementMode = 'TRICKSTER';
                break;
            case CONSTANTS.ENEMY_TYPES.REFLECTOR:
                this.movementMode = 'REFLECT';
                this.orbitRadius = 200;
                break;
            case CONSTANTS.ENEMY_TYPES.BARRIER_PAIR:
                this.movementMode = 'AVOID';
                this.orbitRadius = 240;
                this.turnRate = 0.05;
                break;
            default:
                this.movementMode = 'DIRECT';
                break;
        }
    }

    update(playerX, playerY, playerAngle, dt = 16.6, options = {}) {
        // 数値安定化ガード (NaN / Infinity 対策: 削除せず画面内に復帰させる)
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
            const width = CONSTANTS.TARGET_WIDTH || 800;
            const height = CONSTANTS.TARGET_HEIGHT || 800;
            this.x = Math.min(Math.max(this.x || 0, 0), width);
            this.y = Math.min(Math.max(this.y || 0, 0), height);
            this.vx = 0;
            this.vy = 0;
            if (DEBUG_ENABLED) console.warn(`[FIX] Enemy ${this.id} pos/vel recovered from NaN/Inf`);
        }

        const now = Date.now();
        const dtMod = dt / 16.6;
        this.age += dt / 1000; // 秒単位で加算

        // Safety check for inputs
        if (isNaN(playerX)) playerX = 400; // Default to center if NaN
        if (isNaN(playerY)) playerY = 400;
        if (isNaN(playerAngle)) playerAngle = 0;

        // Self-preservation from NaN (Corrupt state recovery)
        if (isNaN(this.x) || isNaN(this.y)) {
            console.warn('--- CRITICAL: Enemy NaN Detected ---', {
                id: this.id,
                type: this.type,
                mode: this.movementMode,
                pos: { x: this.x, y: this.y },
                vel: { vx: this.vx, vy: this.vy },
                knock: { kvx: this.knockVX, kvy: this.knockVY }
            });
            this.x = Math.random() < 0.5 ? -50 : 850;
            this.y = Math.random() < 0.5 ? -50 : 850;
            this.vx = 0;
            this.vy = 0;
            this.knockVX = 0;
            this.knockVY = 0;
        }
        if (isNaN(this.vx) || isNaN(this.vy)) {
            this.vx = 0;
            this.vy = 0;
        }
        // Critical Fix: Reset knockback if NaN to prevent loop
        if (isNaN(this.knockVX) || isNaN(this.knockVY)) {
            this.knockVX = 0;
            this.knockVY = 0;
        }
        if (isNaN(this.angle)) this.angle = 0;

        // アイテム効果 (FREEZE) によるスロウ
        const freezeMul = options.isFrozen ? (CONSTANTS.ITEM_CONFIG.freezeSpeedMultiplier || 0.2) : 1.0;
        const effectiveDtMod = dtMod * freezeMul;

        // OBSERVER 特殊処理 (移動はHOVERモードで統合するが、ノックバック処理等は共通)
        if (this.type === CONSTANTS.ENEMY_TYPES.OBSERVER) {
            this.updateObserver(playerX, playerY, dt);
        }

        // Apply Barrier Logic for SHIELDER/GUARDIAN
        if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER || this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
            this.updateBarrier(dt);
        }

        // 1. 速度計算 (距離減衰 & バフ)
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSq = dx * dx + dy * dy;

        this.updateSpeed(dist, options);

        // 2. 移動ロジック (Movement Mode Switch)
        this.updateMovement(dtMod, playerX, playerY, dist, now, playerAngle, dt);

        // 3. 共通物理演算 (ノックバック & 位置更新)
        this.x += (this.vx * freezeMul + this.knockVX) * dtMod;
        this.y += (this.vy * freezeMul + this.knockVY) * dtMod;

        // ノックバック減衰
        const damp = Math.pow(CONSTANTS.ENEMY_KNOCKBACK_DAMP, dtMod);
        this.knockVX *= damp;
        this.knockVY *= damp;
        if (Math.abs(this.knockVX) < 0.05) this.knockVX = 0;
        if (Math.abs(this.knockVY) < 0.05) this.knockVY = 0;

        // タイマー更新
        if (this.evasionTimer > 0) this.evasionTimer -= dt;
        if (this.pulseOutlineTimer > 0) this.pulseOutlineTimer = Math.max(0, this.pulseOutlineTimer - dt);

        // リフレクターの周期更新
        if (this.type === CONSTANTS.ENEMY_TYPES.REFLECTOR) {
            this.reflectCycleTimer -= dt;
            if (this.reflectCycleTimer <= 0) {
                this.isReflectActive = !this.isReflectActive;
                const cfg = CONSTANTS.REFLECTOR;
                this.reflectCycleTimer = this.isReflectActive ?
                    (cfg.activeDurationMs || 7000) :
                    (cfg.vulnerableDurationMs || 3000);
            }
        }

        // ボス召喚
        if (this.isBoss && this.onSummon) {
            const hpPercent = this.hp / this.maxHp;
            const interval = hpPercent <= 0.5 ? CONSTANTS.BOSS_SUMMON_INTERVAL_ENRAGED_MS : CONSTANTS.BOSS_SUMMON_INTERVAL_NORMAL_MS;
            if (now - this.lastSummonTime > interval) {
                this.onSummon(this.x, this.y);
                this.lastSummonTime = now;
            }
        }

        // Minion寿命チェック
        if (this.isMinion && this.lifespan > 0) {
            this.lifespan -= dt / 1000;
            if (this.lifespan <= 0) {
                // 時間切れで自然消滅
                this.destroy('LIFETIME', this.game);
            }
        }

        // 画面外チェック (main.js 側で統一管理するため不要)
        // this.checkBounds();
    }

    updateSpeed(dist, options) {
        let speedRatio = 1.0;
        // 至近距離での減速 (FLANKERの背後回り込み〜突進中は無効化して機動力を維持)
        const isFlankingOrCharging = (this.movementMode === 'FLANK' && this.flankState >= 1);
        const isDashing = (this.movementMode === 'DASH' && this.dashState === 2);

        if (dist < (CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS || 0) && !isFlankingOrCharging && !isDashing) {
            const t = Math.max(0, dist / CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS);
            speedRatio = CONSTANTS.ENEMY_MIN_SPEED_RATIO + (1.0 - CONSTANTS.ENEMY_MIN_SPEED_RATIO) * t;
        }

        // 突進中などの特殊速度設定を保護するため、1.0未満の時のみ適用orベース速度を元に計算
        if (this.movementMode === 'FLANK' && this.flankState === 3) {
            // Already set high speed, don't overwrite
        } else if (this.movementMode === 'DASH' && this.dashState === 2) {
            // Already set high speed
        } else {
            this.currentSpeed = this.baseSpeed * speedRatio;
        }

        // バフ適用
        this.hasGuardBuff = options.globalGuardBuffActive || false;
        this.hasMarkBuff = options.globalMarkActive || false;
        if (this.hasGuardBuff) this.currentSpeed *= (CONSTANTS.GUARDIAN.globalBuffSpeedMultiplier || 1.2);
        else if (this.hasMarkBuff) this.currentSpeed *= (CONSTANTS.OBSERVER.globalBuffSpeedMul || 1.1);

        // シールダー/ガーディアン弱い時
        if ((this.type === CONSTANTS.ENEMY_TYPES.SHIELDER || this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) && this.barrierState === 'vulnerable') {
            this.currentSpeed *= 0.5;
        }
    }

    updateMovement(dtMod, px, py, dist, now, playerAngle, dt = 16.6) {
        // 描画座標リセット (Render offset reset)
        this.renderX = this.x;
        this.renderY = this.y;

        const targetAngle = Math.atan2(py - this.y, px - this.x);

        switch (this.movementMode) {
            case 'DIRECT':
                // 直線追尾: 常にプレイヤー方向へ
                // ボスの場合、一定距離で停止して召喚を行う (距離維持)
                if (this.isBoss && dist < (CONSTANTS.BOSS_STOP_DISTANCE || 280)) {
                    this.vx = 0;
                    this.vy = 0;
                    this.angle = targetAngle;

                    // 待機モーション (Sway): 浮遊感の演出
                    const now = Date.now();
                    const swayX = Math.cos(now * 0.001) * 20;
                    const swayY = Math.sin(now * 0.0013) * 10;
                    this.renderX = this.x + swayX;
                    this.renderY = this.y + swayY;
                    return; // coordinate updates handled here
                } else {
                    this.vx = Math.cos(targetAngle) * this.currentSpeed;
                    this.vy = Math.sin(targetAngle) * this.currentSpeed;
                    this.angle = targetAngle;
                }
                break;

            case 'ASSAULT':
                // 旋回制限付き追尾: 急旋回禁止
                this.turnTowards(targetAngle, this.turnRate * dtMod);
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'EVASIVE':
                // Approach & Side-Step Logic
                if (this.evasionState === 0) {
                    // Approach Mode
                    this.turnTowards(targetAngle, (this.turnRate || 0.1) * dtMod);
                    this.evasionTimer -= dt;
                    if (this.evasionTimer <= 0) {
                        // Switch to Evade
                        this.evasionState = 1;
                        this.evasionTimer = 600 + Math.random() * 400; // Longer Evade duration (User request)
                        this.evasionDir = Math.random() < 0.5 ? 1 : -1;
                    }
                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;
                } else {
                    // Evade Mode
                    // Move perpendicular to player direction (Quick side-step)
                    const evadeAngle = targetAngle + (Math.PI / 2) * this.evasionDir;
                    this.turnTowards(evadeAngle, 0.4 * dtMod); // Much faster turn (0.2 -> 0.4)

                    this.evasionTimer -= dt;
                    if (this.evasionTimer <= 0) {
                        // Switch back to Approach
                        this.evasionState = 0;
                        this.evasionTimer = 800 + Math.random() * 1200; // Next interval
                    }
                    // Double speed for "Evade" action
                    this.vx = Math.cos(this.angle) * this.currentSpeed * 2.0;
                    this.vy = Math.sin(this.angle) * this.currentSpeed * 2.0;

                    // Jet Thruster Effect
                    // 噴射は進行方向の逆
                    const thrusterAngle = this.angle + Math.PI;
                    // 2つ出す（左右のエンジン感）
                    const offset = 10;
                    const p1x = this.renderX + Math.cos(this.angle + Math.PI / 2) * offset;
                    const p1y = this.renderY + Math.sin(this.angle + Math.PI / 2) * offset;
                    const p2x = this.renderX + Math.cos(this.angle - Math.PI / 2) * offset;
                    const p2y = this.renderY + Math.sin(this.angle - Math.PI / 2) * offset;

                    if (Math.random() < 0.8) Effects.createThruster(p1x, p1y, thrusterAngle);
                    if (Math.random() < 0.8) Effects.createThruster(p2x, p2y, thrusterAngle);
                }
                break;

            case 'ELITE':
                // State Machine: 0:Orbit -> 1:Telegraph -> 2:Charge -> 3:Cooldown
                this.eliteTimer -= dt;

                if (this.eliteState === 0) {
                    // ORBIT
                    // Maintain distance and circle around
                    let targetDist = this.orbitRadius || 200;

                    // Adjust distance
                    if (dist < targetDist - 20) targetDist += 50;
                    if (dist > targetDist + 20) targetDist -= 50;

                    const orbitSpeed = 0.002 * dtMod;
                    const orbitAngle = now * orbitSpeed + (this.id * 0.5); // Spread out by ID

                    // Target position on orbit
                    const tx = px + Math.cos(orbitAngle) * targetDist;
                    const ty = py + Math.sin(orbitAngle) * targetDist;

                    const approachAngle = Math.atan2(ty - this.y, tx - this.x);
                    this.turnTowards(approachAngle, (this.turnRate || 0.05) * dtMod);

                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;

                    if (this.eliteTimer <= 0) {
                        this.eliteState = 1; // To Telegraph
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.telegraphDuration;
                        this.chargeAngle = targetAngle; // Lock on logic start
                    }

                } else if (this.eliteState === 1) {
                    // TELEGRAPH (Pull back / Charge up)
                    // Slow down and aim strictly at player
                    this.turnTowards(targetAngle, 0.2 * dtMod); // Fast turn to lock
                    this.chargeAngle = this.angle; // Keep updating charge vector

                    // Visual shake or pull back? 
                    // Let's just slow down
                    this.vx = Math.cos(this.angle) * this.currentSpeed * 0.2;
                    this.vy = Math.sin(this.angle) * this.currentSpeed * 0.2;

                    if (this.eliteTimer <= 0) {
                        this.eliteState = 2; // To Charge
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.chargeDuration;
                        this.chargeAngle = this.angle; // Final lock
                        this.currentSpeed = this.baseSpeed * CONSTANTS.ELITE_CHARGE.chargeSpeedMul;

                        // Effect trigger
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 2.0);
                    }

                } else if (this.eliteState === 2) {
                    // CHARGE
                    // Move straight in locked direction
                    // No turning
                    this.vx = Math.cos(this.chargeAngle) * this.currentSpeed;
                    this.vy = Math.sin(this.chargeAngle) * this.currentSpeed;

                    // Thruster trail
                    if (Math.random() < 0.3) {
                        Effects.createThruster(this.renderX, this.renderY, this.chargeAngle + Math.PI, 1.5);
                    }

                    if (this.eliteTimer <= 0) {
                        this.eliteState = 3; // To Cooldown
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.cooldownDuration;
                        this.currentSpeed = this.baseSpeed * 0.5; // Slow down
                    }

                } else if (this.eliteState === 3) {
                    // COOLDOWN
                    // Stop or slow movement, recover
                    this.vx *= 0.9; // Friction
                    this.vy *= 0.9;
                    if (this.eliteTimer <= 0) {
                        this.eliteState = 0; // Back to Orbit
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.orbitDuration;
                        this.currentSpeed = this.baseSpeed;
                    }
                }
                break;

            case 'ASSAULT_CURVE':
                if (this.assaultState === 0) {
                    // Phase 1: Weaving Approach
                    this.weavePhase += (CONSTANTS.ASSAULT_CURVE.weaveFreq || 0.004) * dt;
                    const weaveOffset = Math.sin(this.weavePhase) * (CONSTANTS.ASSAULT_CURVE.weaveAmp || 0.7);
                    const weaveTarget = targetAngle + weaveOffset;

                    this.turnTowards(weaveTarget, this.turnRate * dtMod);
                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;

                    // Trigger Charge
                    if (dist < (CONSTANTS.ASSAULT_CURVE.triggerDist || 280)) {
                        this.assaultState = 1;
                        this.currentSpeed = this.baseSpeed * (CONSTANTS.ASSAULT_CURVE.chargeSpeedMul || 2.5);
                    }
                } else {
                    // Phase 2: Rapid Strike (Charge)
                    this.turnTowards(targetAngle, 0.02 * dtMod); // Minimal turn

                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;

                    // Trail effect
                    if (Math.random() < 0.5) {
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 1.2);
                    }
                }
                break;

            case 'ZIGZAG':
                // Sine wave weaving
                this.angle = targetAngle;
                const elapsedZ = Date.now() - this.spawnTime;
                const freqZ = this.zigzagFreq || 0.003;
                const ampZ = this.zigzagAmp || 50;
                const oscVelZ = ampZ * freqZ * Math.cos(elapsedZ * freqZ) * 16.6;
                const perpZ = this.angle + Math.PI / 2;
                this.vx = Math.cos(this.angle) * this.currentSpeed + Math.cos(perpZ) * oscVelZ;
                this.vy = Math.sin(this.angle) * this.currentSpeed + Math.sin(perpZ) * oscVelZ;
                break;

            case 'STEP':
                // ORTHOGONAL STEP MOVEMENT (Kaku-Kaku: Byun-Pita)
                if (this.stepTimer === undefined) this.stepTimer = 0;
                if (this.subState === undefined) this.subState = 0; // 0: Pause, 1: Dash
                this.stepTimer -= dt;

                const cfgS = (this.type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) ?
                    CONSTANTS.SPLITTER_CHILD : CONSTANTS.SPLITTER;

                if (this.stepTimer <= 0) {
                    if (this.subState === 0) {
                        // Switch to DASH
                        this.subState = 1;
                        this.stepTimer = cfgS.dashDurationMs || 300;

                        // Pick next direction (orthogonal)
                        this.stepAxis = 1 - (this.stepAxis || 0);
                        const rand = Math.random();
                        const randomness = 0.2; // Constant bias

                        if (this.stepAxis === 0) {
                            const towardsP = (px > this.x) ? 1 : -1;
                            this.stepDir = (rand > randomness) ? towardsP : -towardsP;
                        } else {
                            const towardsP = (py > this.y) ? 1 : -1;
                            this.stepDir = (rand > randomness) ? towardsP : -towardsP;
                        }
                    } else {
                        // Switch to PAUSE
                        this.subState = 0;
                        this.stepTimer = cfgS.pauseDurationMs || 600;
                        this.vx = 0;
                        this.vy = 0;
                    }
                }

                // Apply Physics depending on subState
                if (this.subState === 1) {
                    // DASH phase
                    const spd = this.baseSpeed * (cfgS.dashSpeedMultiplier || 4.0);
                    if (this.stepAxis === 0) {
                        this.vx = this.stepDir * spd;
                        this.vy = 0;
                        this.angle = (this.stepDir > 0) ? 0 : Math.PI;
                    } else {
                        this.vx = 0;
                        this.vy = this.stepDir * spd;
                        this.angle = (this.stepDir > 0) ? Math.PI / 2 : -Math.PI / 2;
                    }
                    // Dash trail
                    if (Math.random() < 0.6) {
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 1.2);
                    }
                } else {
                    // PAUSE phase
                    this.vx = 0;
                    this.vy = 0;
                    // Keep looking forward
                }
                break;

            case 'HOVER':
            case 'ORBIT':
                this.orbitAngle += (this.type === CONSTANTS.ENEMY_TYPES.ORBITER ? 0.02 : 0.01) * dtMod;
                let tDist = this.orbitRadius || 200;
                if (dist < tDist - 50) tDist += 50;
                if (dist > tDist + 50) tDist -= 50;

                const tPosX = px + Math.cos(this.orbitAngle) * tDist;
                const tPosY = py + Math.sin(this.orbitAngle) * tDist;

                const hAngle = Math.atan2(tPosY - this.y, tPosX - this.x);
                this.turnTowards(hAngle, (this.turnRate || 0.03) * dtMod);

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'FLANK':
                // FLANKER State Machine (Assassin: Approach -> Flank -> Maintain -> Assassinate)
                // 0: Approach (Move directly towards player until close)
                // 1: Agile Flank (Move to the back with high speed/turn)
                // 2: Maintain position (Wait 2 sec)
                // 3: Super Fast Charge (12x, Guaranteed hit accuracy)

                if (this.flankState === undefined) {
                    this.flankState = 0;
                    this.flankTimer = 0;
                }

                const cfgF = CONSTANTS.FLANKER;
                const pRot = playerAngle;
                const tBackAngle = pRot + Math.PI;

                // Current polar relative to player
                const dX = this.x - px;
                const dY = this.y - py;
                let cAngle = Math.atan2(dY, dX);
                let cDist = Math.sqrt(dX * dX + dY * dY);

                // Shortest angular difference to rear
                let aDiff = tBackAngle - cAngle;
                while (aDiff <= -Math.PI) aDiff += Math.PI * 2;
                while (aDiff > Math.PI) aDiff -= Math.PI * 2;

                if (this.flankState === 0) {
                    // PHASE 0: DIRECT APPROACH
                    this.turnTowards(targetAngle, 0.1 * dtMod);
                    if (cDist < (cfgF.approachDist || 350)) {
                        this.flankState = 1;
                    }
                } else if (this.flankState === 1) {
                    // PHASE 1: AGILE FLANKING
                    const oSpeed = (cfgF.flankTurnRate || 0.15) * dtMod;
                    if (Math.abs(aDiff) < oSpeed) {
                        cAngle = tBackAngle;
                    } else {
                        cAngle += (aDiff > 0) ? oSpeed : -oSpeed;
                    }

                    const iDist = cfgF.orbitRadius || 220;
                    if (cDist > iDist) cDist -= this.currentSpeed * 1.0 * dtMod;
                    else if (cDist < iDist - 20) cDist += this.currentSpeed * 1.0 * dtMod;

                    const tX = px + Math.cos(cAngle) * cDist;
                    const tY = py + Math.sin(cAngle) * cDist;
                    this.turnTowards(Math.atan2(tY - this.y, tX - this.x), (cfgF.flankTurnRate || 0.15) * dtMod);

                    // Check if reached position (behind player)
                    if (Math.abs(aDiff) < 0.2) {
                        this.flankState = 2;
                        this.flankTimer = cfgF.maintainDurationMs || 2000;
                    }
                } else if (this.flankState === 2) {
                    // PHASE 2: MAINTAIN POSITION (Assassin's Focus)
                    this.flankTimer -= dt;

                    // Stick strictly to back
                    const oSpeed = (cfgF.flankTurnRate || 0.2) * dtMod;

                    // 中断チェック：背後から大幅に外れた場合（自機が急旋回した場合など）は回り込みに戻る
                    if (Math.abs(aDiff) > 0.7) {
                        this.flankState = 1;
                        this.flankTimer = 0;
                        return;
                    }

                    cAngle += aDiff * 0.2; // Aggressive snap to back

                    const iDist = cfgF.orbitRadius || 220;
                    const tX = px + Math.cos(cAngle) * iDist;
                    const tY = py + Math.sin(cAngle) * iDist;
                    this.turnTowards(Math.atan2(tY - this.y, tX - this.x), (cfgF.flankTurnRate || 0.2) * dtMod);

                    // Visual charge-up effect (Pulsing outline)
                    if (this.flankTimer < 1000) {
                        this.pulseOutlineTimer = 100; // Keep pulsing just before charge
                    }

                    if (this.flankTimer <= 0) {
                        this.flankState = 3;
                        // ATOMIC LOCK-ON: Set everything NOW to avoid 1-frame mismatch
                        this.chargeAngle = targetAngle;
                        this.angle = this.chargeAngle;
                        this.currentSpeed = this.baseSpeed * (cfgF.chargeSpeedMul || 12.0);
                        this.vx = Math.cos(this.chargeAngle) * this.currentSpeed;
                        this.vy = Math.sin(this.chargeAngle) * this.currentSpeed;

                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 4.0);
                        if (this.game && this.game.audio) this.game.audio.play('dash', { volume: 0.6, pitch: 1.2 });
                    }
                } else if (this.flankState === 3) {
                    // PHASE 3: SUPER CHARGE (12x)
                    // Keep moving in the locked direction
                    this.vx = Math.cos(this.chargeAngle) * this.currentSpeed;
                    this.vy = Math.sin(this.chargeAngle) * this.currentSpeed;
                    this.angle = this.chargeAngle;

                    if (Math.random() < 0.7) {
                        Effects.createThruster(this.renderX, this.renderY, this.chargeAngle + Math.PI, 2.5);
                    }
                }

                // Apply physics ONLY for non-charging states (already set in state 3)
                if (this.flankState !== 3) {
                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;
                }
                break;

            case 'DASH':
                // DASHER State Machine (Designed for broad curve)
                // 0: Broad Curve Approach (No stop)
                // 1: Snapping Telegraph (Speed up/turn fast)
                // 2: Final Dash (Burst)
                // 3: Cooldown Glide

                if (this.dashState === undefined) {
                    this.dashState = 0;
                    this.dashTimer = 0;
                }
                if (this.curveDir === undefined) {
                    this.curveDir = (this.id % 2 === 0) ? 1 : -1;
                }
                this.dashTimer -= dt;

                if (this.dashState === 0) {
                    // BROAD CURVE APPROACH
                    const triggerDist = 220; // Lowered from 320 to stay in curve longer

                    if (dist < triggerDist && this.dashTimer <= 0) {
                        this.dashState = 1; // To Snapping Telegraph
                        this.dashTimer = (CONSTANTS.DASHER.windupMs || 500) * 1.6; // Extended telegraph
                        this.currentSpeed *= 1.3; // Slight surge during lock-on
                    } else {
                        // Dynamic Curve: Offset decreases as distance increases to ensure convergence
                        // If dist > 500, move more directly. If dist is 350, curve more.
                        const curveIntensity = Math.max(0, Math.min(1, 450 / dist));
                        const baseOffset = (Math.PI / 180) * 55; // Up to 55 deg
                        const curveOffset = baseOffset * curveIntensity * this.curveDir;
                        const finalTarget = targetAngle + curveOffset;

                        const turnSpeed = (this.turnRate || 0.08) * 0.8 * dtMod; // Softer turn for longer curve
                        this.turnTowards(finalTarget, turnSpeed);

                        this.vx = Math.cos(this.angle) * this.currentSpeed;
                        this.vy = Math.sin(this.angle) * this.currentSpeed;
                        this.hasDirection = true;
                    }

                } else if (this.dashState === 1) {
                    // SNAPPING TELEGRAPH (No Stop)
                    // High rotation to lock onto player while keeping momentum
                    const lockSpeed = (this.turnRate || 0.12) * 2.0 * dtMod;
                    this.turnTowards(targetAngle, lockSpeed);
                    this.chargeAngle = this.angle; // Keep updating until the very last frame

                    // Trail / Warning effect
                    if (Math.random() < 0.3) {
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 1.2);
                    }

                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;

                    if (this.dashTimer <= 0) {
                        this.dashState = 2; // To Final Dash
                        this.dashTimer = CONSTANTS.DASHER.dashDurationMs || 600;
                        this.currentSpeed = this.baseSpeed * (CONSTANTS.DASHER.dashSpeedMultiplier || 4.0);
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 3.0);
                        if (this.game && this.game.audio) {
                            this.game.audio.play('dash', { volume: 0.5 });
                        }
                    }

                } else if (this.dashState === 3) {
                    // COOLDOWN GLIDE
                    // Slowly recovering, slide away but start turning back
                    this.vx *= 0.95;
                    this.vy *= 0.95;

                    // Start turning back towards player even in cooldown
                    this.turnTowards(targetAngle, (this.turnRate || 0.05) * 0.5 * dtMod);

                    if (this.dashTimer <= 0) {
                        this.dashState = 0; // Back to Start
                        this.currentSpeed = this.baseSpeed;
                        this.dashTimer = 100; // Snap to ready
                    }
                }
                break;

            case 'AVOID':
                // 照準回避 (BARRIER_PAIR)
                // ペアがいない場合は自棄になって突っ込む (ASSAULTへ移行)
                if (!this.partner || !this.partner.active) {
                    this.movementMode = 'ASSAULT';
                    this.turnRate = 0.2; // Aggressive turn
                    this.currentSpeed *= 1.5; // Speed up
                    // Fallthrough to next frame's ASSAULT logic
                    break;
                }

                // 安定化: IDの大小で左右を分担する
                // プレイヤーの照準に対して、片方は +65度、片方は -65度 の位置をキープしようとする
                const isLeader = this.id < this.partner.id;
                const formationSide = isLeader ? 1 : -1;

                // 目標とする角度 (Player aiming angle + side offset)
                // 65度くらい開けば、間のバリアが正面を塞ぐ形になる
                let targetFormationAngle = playerAngle + (formationSide * (Math.PI / 180 * 65));

                // 現在の角度
                const currentAngleToSelf = Math.atan2(this.y - py, this.x - px);

                // 距離メンテナンス (つかず離れず)
                let targetDist2 = this.orbitRadius || 240; // Rename variable to avoid conflict if any
                // 基本は orbitRadius を維持だが、近すぎると下がる
                if (dist < targetDist2 - 30) targetDist2 += 30;
                if (dist > targetDist2 + 30) targetDist2 -= 30;

                // Move towards formation target
                // 目標地点
                const tx2 = px + Math.cos(targetFormationAngle) * targetDist2;
                const ty2 = py + Math.sin(targetFormationAngle) * targetDist2;

                const approachAngle2 = Math.atan2(ty2 - this.y, tx2 - this.x);

                // 旋回
                this.turnTowards(approachAngle2, (this.turnRate || 0.05) * dtMod);

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'REFLECT':
                // 高度なリフレクト移動: 多彩な動き + 自機非接触
                if (this.reflectTimer === undefined) {
                    this.reflectTimer = 0;
                    this.reflectStrafeDir = Math.random() < 0.5 ? 1 : -1;
                    this.reflectOrbitPhase = Math.random() * Math.PI * 2;
                }

                this.reflectTimer -= dt;
                if (this.reflectTimer <= 0) {
                    // 2〜4秒ごとに旋回方向を検討
                    this.reflectStrafeDir = Math.random() < 0.7 ? this.reflectStrafeDir : -this.reflectStrafeDir;
                    this.reflectTimer = 2000 + Math.random() * 2000;
                }

                // 距離の伸縮 (200 - 350px)
                this.reflectOrbitPhase += 0.01 * dtMod;
                const baseOrbit = 260;
                const orbitAmp = 80;
                const targetOrbitDist = baseOrbit + Math.sin(this.reflectOrbitPhase) * orbitAmp;

                // 旋回運動
                this.orbitAngle += 0.015 * this.reflectStrafeDir * dtMod;

                // 目標座標の計算
                const txR = px + Math.cos(this.orbitAngle) * targetOrbitDist;
                const tyR = py + Math.sin(this.orbitAngle) * targetOrbitDist;

                const moveAngleR = Math.atan2(tyR - this.y, txR - this.x);
                this.turnTowards(moveAngleR, 0.08 * dtMod);

                // 速度適用
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;

                // 強制的な自機回避 (180px 以内に入りそうなら外へ逃げる)
                if (dist < 180) {
                    const fleeAngle = Math.atan2(this.y - py, this.x - px);
                    this.vx = Math.cos(fleeAngle) * this.currentSpeed * 1.5;
                    this.vy = Math.sin(fleeAngle) * this.currentSpeed * 1.5;
                }

                // 常に向きはプレイヤーを固定
                this.renderAngle = targetAngle;
                break;

            case 'TRICKSTER':
                // 不規則
                this.movementPhase += (Math.random() - 0.5) * 0.2 * dtMod;
                const trickAngle = targetAngle + Math.sin(this.movementPhase) * 1.0;
                this.turnTowards(trickAngle, 0.1 * dtMod);
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            default:
                // Fallback DIRECT
                this.vx = Math.cos(targetAngle) * this.currentSpeed;
                this.vy = Math.sin(targetAngle) * this.currentSpeed;
                this.angle = targetAngle;
                break;
        }

        // 基本Angle更新 (描画用)
        // this.angle は updateMovement 内で更新済み
        // hasDirection系の敵はこれが描画角度になる
    }

    turnTowards(targetAngle, rate) {
        if (rate <= 0) {
            this.angle = targetAngle;
            return;
        }
        let diff = targetAngle - this.angle;
        // Normalize -PI to PI
        while (diff <= -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < rate) {
            this.angle = targetAngle;
        } else {
            this.angle += (diff > 0) ? rate : -rate;
        }
    }

    // checkBounds() { ... } // 廃止: main.js でスクリーン座標判定を行う





    draw(ctx) {
        ctx.save();
        ctx.translate(this.renderX, this.renderY);

        // 進行方向への回転適用 (本体のみに適用するため save)
        ctx.save();
        if (this.hasDirection) {
            // スプライトは元々-Y方向(上)を向いていると仮定し、進行方向(this.angle)に向けるために+90度補正
            ctx.rotate(this.angle + Math.PI / 2);
        }

        let assetKey = null;
        let filter = "none";

        switch (this.type) {
            case CONSTANTS.ENEMY_TYPES.NORMAL: assetKey = 'ENEMY_A'; break;
            case CONSTANTS.ENEMY_TYPES.ZIGZAG: assetKey = 'ENEMY_B'; break;
            case CONSTANTS.ENEMY_TYPES.EVASIVE: assetKey = 'ENEMY_C'; break;
            case CONSTANTS.ENEMY_TYPES.ELITE: assetKey = 'ENEMY_D'; break;
            case CONSTANTS.ENEMY_TYPES.ASSAULT: assetKey = 'ENEMY_E'; break;
            case CONSTANTS.ENEMY_TYPES.SHIELDER: assetKey = 'ENEMY_F'; break;
            case CONSTANTS.ENEMY_TYPES.GUARDIAN: assetKey = 'ENEMY_G'; break;
            case CONSTANTS.ENEMY_TYPES.DASHER: assetKey = 'ENEMY_H'; break;
            case CONSTANTS.ENEMY_TYPES.ORBITER: assetKey = 'ENEMY_I'; break;
            case CONSTANTS.ENEMY_TYPES.SPLITTER: assetKey = 'ENEMY_J'; break;
            case CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD: assetKey = 'ENEMY_K'; break;
            case CONSTANTS.ENEMY_TYPES.OBSERVER: assetKey = 'ENEMY_L'; break;

            // 新敵タイプ (既存アセットの流用 + フィルタ)
            case CONSTANTS.ENEMY_TYPES.FLANKER:
                assetKey = 'ENEMY_A';
                filter = "hue-rotate(240deg) brightness(0.8)";
                break;
            case CONSTANTS.ENEMY_TYPES.BARRIER_PAIR:
                assetKey = 'ENEMY_F';
                filter = "hue-rotate(180deg) brightness(1.2)";
                break;
            case CONSTANTS.ENEMY_TYPES.TRICKSTER:
                assetKey = 'ENEMY_A';
                filter = "hue-rotate(60deg) brightness(1.2) drop-shadow(0 0 5px #ffff00)";
                break;
            case CONSTANTS.ENEMY_TYPES.ATTRACTOR:
                assetKey = 'ENEMY_G';
                filter = "hue-rotate(120deg) brightness(1.1)";
                break;
            case CONSTANTS.ENEMY_TYPES.REFLECTOR:
                assetKey = 'ENEMY_F';
                filter = "hue-rotate(0deg) brightness(1.1)"; // 後で金縁風の描画を追加検討
                break;
        }
        if (this.isBoss) {
            const stageNum = (this.game) ? this.game.currentStage + 1 : 1;
            assetKey = (stageNum <= 5) ? 'ENEMY_BOSS_5' : 'ENEMY_BOSS_10';
        }

        const asset = (this.game && this.game.assetLoader) ? this.game.assetLoader.get(assetKey) : null;

        if (asset) {
            if (filter !== "none") ctx.filter = filter;
            // アセットがある場合：スプライト描画
            let size = CONSTANTS.ENEMY_SIZE * 2.5;
            if (this.isBoss) {
                size = CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL * 2.5;
            } else if (this.type === CONSTANTS.ENEMY_TYPES.ELITE) {
                size = CONSTANTS.ENEMY_SIZE * CONSTANTS.ELITE_SIZE_MUL * 2.5;
            } else if (this.type === CONSTANTS.ENEMY_TYPES.TRICKSTER) {
                size *= CONSTANTS.TRICKSTER.sizeMul;
            }
            ctx.drawImage(asset, -size / 2, -size / 2, size, size);
            ctx.filter = "none";

            // (Barrier Line removed from here to follow rotation-free context below)

            // REFLECTOR のゴージャスな半円シールド演出
            if (this.type === CONSTANTS.ENEMY_TYPES.REFLECTOR && this.isReflectActive) {
                ctx.save();
                const r = size / 2.2;

                // 正面（自機側）を向く半円の範囲 (-90度〜90度)
                const startAngle = -Math.PI / 2;
                const endAngle = Math.PI / 2;

                // 1. 強力な外光グロー (Super Outer Glow)
                ctx.shadowBlur = 35;
                ctx.shadowColor = "rgba(255, 215, 0, 0.9)";

                ctx.strokeStyle = "rgba(255, 230, 100, 0.4)";
                ctx.lineWidth = 4;
                ctx.lineCap = "round"; // 端を丸める
                ctx.beginPath();
                ctx.arc(0, 0, r, startAngle, endAngle);
                ctx.stroke();

                // 2. メインのグラデーション弧 (Main Gradient Arc)
                ctx.shadowBlur = 20;
                const grad = ctx.createLinearGradient(0, -r, 0, r);
                grad.addColorStop(0, "#ffd700");
                grad.addColorStop(0.5, "#fff8dc");
                grad.addColorStop(1, "#b8860b");

                ctx.strokeStyle = grad;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, r, startAngle, endAngle);
                ctx.stroke();

                // 3. 回転する光沢、ただしシールドの範囲内のみ表示 (Specular Highlight clamped to arc)
                ctx.shadowBlur = 0;
                let highlightAngle = ((Date.now() * 0.005) % (Math.PI * 2)) - Math.PI; // -PI 〜 PI

                // 表示範囲内にあれば描画
                if (highlightAngle > startAngle && highlightAngle < endAngle) {
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, highlightAngle, Math.min(highlightAngle + 0.8, endAngle));
                    ctx.stroke();
                }

                ctx.restore();
            }

            /* 
            // パルス時のアウトライン (画像の場合は矩形枠を表示)
            if (this.pulseOutlineTimer > 0) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.rect(-size / 2, -size / 2, size, size);
                ctx.stroke();
            }
            */
        } else {
            // アセットがない場合：従来の図形描画
            switch (this.type) {
                case CONSTANTS.ENEMY_TYPES.NORMAL:
                    this.drawShape(ctx, 3, '#ff0000'); // Triangle
                    break;
                case CONSTANTS.ENEMY_TYPES.ZIGZAG:
                    this.drawShape(ctx, 4, '#ff00ff'); // Square
                    break;
                case CONSTANTS.ENEMY_TYPES.CHASER: // Pent
                    this.drawShape(ctx, 5, '#ff8800');
                    break;
                case CONSTANTS.ENEMY_TYPES.SPEEDER: // Hex
                    this.drawShape(ctx, 6, '#ffff00');
                    break;
                case CONSTANTS.ENEMY_TYPES.DASHER: // Star (5)
                    this.drawStar(ctx, 5, '#00ffff');
                    break;
                case CONSTANTS.ENEMY_TYPES.TANK: // 8角形
                    this.drawShape(ctx, 8, '#8800ff');
                    // 重装甲感の追加
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.fillStyle = `rgba(255, 255, 255, ${this.flashTimer / 5})`;
                    ctx.fill();
                    break;
                case CONSTANTS.ENEMY_TYPES.SHOOTER:
                    this.drawShape(ctx, 3, '#00ff00'); // 仮定
                    break;
                case CONSTANTS.ENEMY_TYPES.HOMING:
                    this.drawShape(ctx, 4, '#ff8888'); // 仮定
                    break;
                case CONSTANTS.ENEMY_TYPES.EXPLODER:
                    this.drawShape(ctx, 6, '#ff0088'); // 仮定
                    break;
                case CONSTANTS.ENEMY_TYPES.ORBITER:
                    this.drawShape(ctx, 4, '#00ffff'); // 仮定
                    break;
                case CONSTANTS.ENEMY_TYPES.SHIELDER:
                case CONSTANTS.ENEMY_TYPES.GUARDIAN:
                    // SHIELDER/GUARDIAN は特殊エフェクトが下に続くが、本体も描画
                    this.drawShape(ctx, 6, '#00ffff', false); // アウトラインなし
                    break;
                default:
                    this.drawShape(ctx, 3, '#ff0000');
                    break;
            }
        }

        // シールダーのバリア/弱点演出 (HEX GRID VERSION) - GUARDIAN removed
        if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER) {
            const baseSize = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;

            if (this.barrierState === 'windup') {
                // 予兆: 点滅
                const flash = Math.sin(Date.now() * 0.02);
                if (flash > 0) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${flash})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, baseSize * 1.5, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else if (this.barrierState === 'active') {
                const now = Date.now();
                const radius = CONSTANTS.SHIELDER.auraRadius || (baseSize * 1.8);
                const color = '0, 255, 255';

                // HEX GRID TILING
                // No outer circle, just filled hexes
                const hexSize = 10;
                const gridRadius = Math.ceil(radius / (hexSize * 1.5));

                ctx.save();
                ctx.strokeStyle = `rgba(${color}, 0.5)`;
                ctx.fillStyle = `rgba(${color}, 0.15)`;
                ctx.lineWidth = 1;

                // Pulsing effect
                const pulse = Math.sin(now * 0.005);

                for (let q = -gridRadius; q <= gridRadius; q++) {
                    for (let r = -gridRadius; r <= gridRadius; r++) {
                        const x = hexSize * 1.5 * q;
                        const y = hexSize * Math.sqrt(3) * (r + q / 2);

                        // Check if inside barrier radius
                        if (Math.sqrt(x * x + y * y) < radius - 5) {
                            // Draw small hex
                            ctx.beginPath();
                            // Rotate individual hexes
                            for (let i = 0; i < 6; i++) {
                                const angle = (Math.PI / 3) * i + (now * 0.001);
                                const hx = x + Math.cos(angle) * (hexSize * 0.9);
                                const hy = y + Math.sin(angle) * (hexSize * 0.9);
                                if (i === 0) ctx.moveTo(hx, hy);
                                else ctx.lineTo(hx, hy);
                            }
                            ctx.closePath();

                            // Wave flicker
                            const distVal = Math.sqrt(x * x + y * y);
                            const wave = Math.sin(distVal * 0.1 - now * 0.01);
                            if (wave > 0.5) ctx.stroke();
                            if (wave > 0.8) ctx.fill(); // Fill only strongest wave parts
                        }
                    }
                }
                ctx.restore();
            }
        }

        // バリア状態の描画 (統合済みのため削除)
        // if (this.barrierState === 'active') { this.drawBarrier(ctx); }

        // パルスヒット時のアウトライン
        if (this.pulseOutlineTimer > 0) {
            ctx.strokeStyle = `rgba(255, 128, 0, ${this.pulseOutlineTimer / 200})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            const r = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
            ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Gorgeous Guardian Mandala Effect (When Active)
        if (this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && this.barrierState === 'active') {
            const nowTime = Date.now();
            const radius = 60;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Layer 1: Outer glowing ring
            ctx.strokeStyle = `rgba(0, 255, 100, ${0.4 + Math.sin(nowTime * 0.003) * 0.2})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
            ctx.stroke();

            // Layer 2: Rotating Magic Circle (Mandala)
            ctx.save();
            ctx.rotate(nowTime * 0.001);
            ctx.strokeStyle = 'rgba(0, 255, 150, 0.6)';
            ctx.lineWidth = 1.5;

            for (let j = 0; j < 2; j++) {
                ctx.rotate(Math.PI / 4);
                ctx.beginPath();
                const sides = 4 + j * 2;
                for (let i = 0; i < sides; i++) {
                    const theta = (i / sides) * Math.PI * 2;
                    const x = Math.cos(theta) * radius * 1.3;
                    const y = Math.sin(theta) * radius * 1.3;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            }
            ctx.restore();

            // Layer 3: Inner fast-rotating gear
            ctx.save();
            ctx.rotate(-nowTime * 0.002);
            ctx.strokeStyle = 'rgba(200, 255, 200, 0.8)';
            ctx.beginPath();
            const points = 12;
            for (let i = 0; i < points; i++) {
                const r = i % 2 === 0 ? radius * 0.8 : radius * 0.4;
                const theta = (i / points) * Math.PI * 2;
                const x = Math.cos(theta) * r;
                const y = Math.sin(theta) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // Rising Particles
            const pCount = 5;
            for (let i = 0; i < pCount; i++) {
                const seed = (nowTime + i * 500) * 0.001;
                const px = Math.sin(seed * 4) * radius * 0.8;
                const py = (seed % 1) * -radius * 2 + radius;
                const pAlpha = 1 - (Math.abs(py) / (radius * 2));
                ctx.fillStyle = `rgba(0, 255, 100, ${pAlpha * 0.5})`;
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        // --- END OF ROTATABLE SECTION ---
        ctx.restore(); // Ends rotation save at line 1000

        // BARRIER_PAIR Line
        if (this.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && this.partner && this.partner.active &&
            this.partner.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && this.partner.partner === this) {
            if (this.id < this.partner.id) {
                ctx.save();
                ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
                ctx.lineWidth = CONSTANTS.BARRIER_PAIR.barrierWidth || 6;
                ctx.setLineDash([12, 6]);
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00ffff";
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(this.partner.x - this.x, this.partner.y - this.y);
                ctx.stroke();
                ctx.restore();
            }
        }

        // HP Bar
        if (!this.isBoss && this.hp < this.maxHp) {
            const barW = 40;
            const barH = 4;
            const yOff = -CONSTANTS.ENEMY_SIZE - 10;
            ctx.fillStyle = '#444';
            ctx.fillRect(-barW / 2, yOff, barW, barH);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-barW / 2, yOff, barW * (this.hp / this.maxHp), barH);
        }

        // Apply Shadow to the main body drawing
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffaa';

        ctx.restore(); // Final balance for Save at line 996 (Translation Context)

        // GLOBAL GUARDIAN BUFF (Applied to all enemies)
        // This is separate because it needs its own translation if the above one is closed
        if (this.game && this.game.globalGuardianActive) {
            const buffSize = (this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE) * 1.6;
            const nowTime = Date.now();
            ctx.save();
            ctx.translate(this.renderX, this.renderY);
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 0; // Clear any leaking shadow

            // Pulsing Background Glow
            const glowAlpha = 0.15 + Math.sin(nowTime * 0.005) * 0.05;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, buffSize);
            grad.addColorStop(0, `rgba(0, 255, 150, ${glowAlpha})`);
            grad.addColorStop(1, 'rgba(0, 255, 150, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, buffSize, 0, Math.PI * 2);
            ctx.fill();

            // Layer 1: Outer Rotating Hex
            ctx.strokeStyle = 'rgba(0, 255, 150, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const sides = 6;
            const angle1 = nowTime * 0.0015 + (this.id * 0.1);
            for (let i = 0; i < sides; i++) {
                const theta = (i / sides) * Math.PI * 2 + angle1;
                ctx.lineTo(Math.cos(theta) * buffSize, Math.sin(theta) * buffSize);
            }
            ctx.closePath();
            ctx.stroke();

            // Layer 2: Pulse Ring
            const pulse = (Math.sin(nowTime * 0.005) + 1) * 0.5;
            if (pulse > 0.5) {
                ctx.strokeStyle = `rgba(0, 255, 100, ${0.4 * (pulse - 0.5)})`;
                ctx.beginPath();
                ctx.arc(0, 0, buffSize * pulse, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Layer 3: Inner floating hex
            ctx.save();
            const floatY = Math.sin(nowTime * 0.004 + this.id) * 5;
            ctx.translate(0, -buffSize * 0.8 + floatY);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const theta = (i / 6) * Math.PI * 2 + (nowTime * 0.002);
                ctx.lineTo(Math.cos(theta) * 8, Math.sin(theta) * 8);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            ctx.restore();
        }
    }

    updateObserver(playerX, playerY, dt) {
        const config = CONSTANTS.OBSERVER;
        this.obsTimer += dt;

        if (this.obsState === 'hold') {
            if (this.obsTimer >= config.markWindupMs && !this.didMarkThisHold) {
                this.didMark = true; // main.js が監視
                this.didMarkThisHold = true;
            }
            if (this.obsTimer >= config.holdMs) {
                this.obsState = 'snap';
                this.obsTimer = 0;

                // 現在の位置（移動開始点）を計算
                const curAngle = (this.slotIndex / config.slots) * Math.PI * 2;
                this.startX = playerX + Math.cos(curAngle) * config.observerRadius;
                this.startY = playerY + Math.sin(curAngle) * config.observerRadius;

                // 次の目的地を決定
                let next;
                do {
                    next = Math.floor(Math.random() * config.slots);
                } while (next === this.slotIndex || Math.abs(next - this.slotIndex) === 1 || Math.abs(next - this.slotIndex) === (config.slots - 1));
                this.nextSlotIndex = next;

                const nxtAngle = (this.nextSlotIndex / config.slots) * Math.PI * 2;
                this.endX = playerX + Math.cos(nxtAngle) * config.observerRadius;
                this.endY = playerY + Math.sin(nxtAngle) * config.observerRadius;
            }
            const angle = (this.slotIndex / config.slots) * Math.PI * 2;
            this.x = playerX + Math.cos(angle) * config.observerRadius;
            this.y = playerY + Math.sin(angle) * config.observerRadius;
        } else if (this.obsState === 'snap') {
            const t = Math.min(1.0, this.obsTimer / config.snapMs);
            // イージング（滑らかな加減速）を追加
            const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            this.x = this.startX + (this.endX - this.startX) * easeT;
            this.y = this.startY + (this.endY - this.startY) * easeT;

            if (t >= 1.0) {
                this.obsState = 'hold';
                this.obsTimer = 0;
                this.slotIndex = this.nextSlotIndex; // 移動完了後にスロットを確定
                this.didMarkThisHold = false;
                this.didMark = false;
            }
        }
        this.renderX = this.x;
        this.renderY = this.y;
    }

    drawShape(ctx, sides, color, useStroke = true) {
        ctx.fillStyle = color;
        ctx.beginPath();
        const size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * size;
            const y = Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        if (useStroke) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    drawStar(ctx, points, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        const outer = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
        const inner = outer * 0.5;
        for (let i = 0; i < points * 2; i++) {
            const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = (i % 2 === 0) ? outer : inner;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    drawBarrier(ctx) {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL * 1.5 : CONSTANTS.ENEMY_SIZE * 1.5;
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    takeDamage(amount, options = {}) {
        if (this.type === CONSTANTS.ENEMY_TYPES.OBSERVER && this.obsState === 'snap') return; // SNAP中は無敵
        let actualAmount = amount;

        // 1) SHIELDER 軽減 (床あり)
        // ※オーラ内にいる場合は options.isAuraProtected が true で渡される想定
        if (options.isAuraProtected) {
            const reduced = actualAmount * CONSTANTS.SHIELDER.damageMultiplierWhileBarrier;
            const floor = actualAmount * (CONSTANTS.SHIELDER.minDamageRatio || 0.1);
            actualAmount = Math.max(reduced, floor);
        }

        // 2) DASHER windup 倍率
        if (this.type === CONSTANTS.ENEMY_TYPES.DASHER && this.dashState === 'windup') {
            actualAmount *= (CONSTANTS.DASHER.windupVulnerableMultiplier || 1.5);
        }

        // 3) GUARDIAN 全体バフ (1段階のみ / 防御バフとして適用)
        if (options.globalBuffActive) {
            // バフがかかっている敵は受けるダメージが減少
            actualAmount /= (CONSTANTS.GUARDIAN.globalBuffDamageMultiplier || 1.2);
        }

        // 4) 既存の弱点状態（SHIELDER/GUARDIAN 本体の露出時）
        if ((this.type === CONSTANTS.ENEMY_TYPES.SHIELDER || this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) && this.barrierState === 'vulnerable') {
            const config = this.type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
            actualAmount *= config.vulnerableDamageMultiplier;
        }

        // 5) 既存ボス安全装置 (DPSキャップ)
        if (this.isBoss) {
            const now = Date.now();
            if (now - this.lastDamageResetTime > 1000) {
                this.damageInCurrentSecond = 0;
                this.lastDamageResetTime = now;
            }

            const limit = Math.max(
                CONSTANTS.BOSS_DAMAGE_LIMIT_MIN_DPS,
                this.maxHp * CONSTANTS.BOSS_DAMAGE_LIMIT_RATIO_PER_SEC
            );

            const remaining = limit - this.damageInCurrentSecond;
            if (remaining <= 0) return;

            actualAmount = Math.min(actualAmount, remaining);
            Effects.spawnHitEffect(this.renderX, this.renderY, actualAmount);
            this.hp -= actualAmount;
            this.damageInCurrentSecond += actualAmount;
        } else {
            // 6) HP 減算
            Effects.spawnHitEffect(this.renderX, this.renderY, actualAmount);
            this.hp -= actualAmount;
        }
    }

    returnToPool() {
        this.active = false;
        if (this.game && this.game.enemyPool) {
            this.game.enemyPool.release(this);
        }
    }

    destroy(reason = 'damage', game) {
        if (!this.active) return;
        this.active = false;
        this.deactivateReason = reason;
        this.destroyReason = reason;

        // 破壊エフェクト
        if (reason === 'damage' || reason === 'bullet' || reason === 'bomb' || reason === 'nuke' || reason === 'BULLET' || reason === 'BARRIER_DAMAGE' || reason === 'LIFETIME') {
            Effects.createExplosion(this.renderX, this.renderY, this.type === CONSTANTS.ENEMY_TYPES.BOSS ? 200 : 50);
            game.audio.play('explosion', { variation: 0.3, priority: 'medium' });
        }

        // スコア・統計加算 (正当な撃破時のみ)
        if (this.hp <= 0) {
            game.totalKills++;
            game.killCount++;
            this.killed = true;
            this.destroyReason = 'DEAD';
        }

        // バリアペアの片割れが死んだ場合、もう片方の挙動を変える
        if (this.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && this.partner) {
            this.partner.partner = null; // リンク解除
            this.partner.barrierState = 'vulnerable'; // または専用のステート
        }

        // ドロップ処理
        if (reason !== 'glitch' && reason !== 'GLITCH' && reason !== 'return' && reason !== 'LIFETIME' && reason !== 'OOB') {
            // GOLD (100% drop)
            const goldAmount = CONSTANTS.ENEMY_GOLD[this.type] || 10;
            const g = game.goldPool.get();
            if (g) {
                g.init(this.renderX, this.renderY, goldAmount);
                game.golds.push(g);
            }

            // アイテムドロップ
            if (game.itemManager) {
                game.itemManager.spawnDrop(this.renderX, this.renderY, this.type, game);
            }
        }

        // Splitter 分裂処理 (A案: Minion化)
        if (this.type === CONSTANTS.ENEMY_TYPES.SPLITTER && reason !== 'LIFETIME' && reason !== 'OOB' && reason !== 'return') {
            const childrenCount = CONSTANTS.SPLITTER.splitCount || 2;

            // Safe Stage Data Access
            let stageData = CONSTANTS.STAGE_DATA[game.currentStage];
            if (!stageData) {
                // Fallback for Debug Stage or Error
                stageData = { hpMul: 1.0, speedMul: 1.0 };
            }

            for (let i = 0; i < childrenCount; i++) {
                const child = game.enemyPool.get();
                if (child) {
                    const offsetAngle = (Math.PI * 2 / childrenCount) * i + Math.random();
                    const dist = 30;
                    const cx = this.x + Math.cos(offsetAngle) * dist;
                    const cy = this.y + Math.sin(offsetAngle) * dist;

                    // SPLITTER_CHILD を生成
                    child.init(cx, cy, game.player.x, game.player.y, CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD, stageData.hpMul * 0.5, stageData.speedMul);

                    // Minion設定
                    child.isMinion = true;
                    child.lifespan = 10.0; // 10秒で消滅

                    // 少し散らす
                    child.vx = Math.cos(offsetAngle) * child.baseSpeed * 1.5;
                    child.vy = Math.sin(offsetAngle) * child.baseSpeed * 1.5;

                    game.enemies.push(child);
                    // Minionなので enemiesRemaining は減らさない (フェーズ生成数に含まれないため)
                }
            }
        }
    }

    updateBarrier(dt) {
        if (this.barrierState === 'idle') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                // Activate barrier
                this.barrierState = 'active';
                const config = this.type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
                this.barrierTimer = (config.barrierDurationMs || 3000) * 2.0; // Double Duration
                // Sound effect could go here
            }
        } else if (this.barrierState === 'active') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                // Deactivate barrier (cooldown / vulnerable)
                this.barrierState = 'vulnerable';
                const config = this.type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
                this.barrierTimer = config.vulnerableDurationMs || 2000;
            }
        } else if (this.barrierState === 'vulnerable') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                // Back to idle
                this.barrierState = 'idle';
                const config = this.type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
                this.barrierTimer = config.barrierCooldownMs || 3000;
            }
        }
    }
}
