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
        this.bossIndex = -1; // [NEW] ボス個別の識別子（Stage 5=4, Stage 10=9等）
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

        // アトラクターバフ用の倍率（main.jsで毎フレーム更新）
        this.damageMultiplier = 1.0;  // 攻撃力倍率（RED）
        this.speedMultiplier = 1.0;   // 移動速度倍率（BLUE）
        this.attractorKind = null;    // 'RED' or 'BLUE'）

        // 演出用
        this.entry = null;         // { t, dur, vx, vy }
        this.formationInfo = null; // { t, anchor, offset, pattern }
        this.shieldAlpha = 0;      // 保護オーラ用透明度 (0.0 - 1.0)

        // Stage5Boss プラズマ・ドローン用 [NEW]
        this.droneCd = 0;
        this.rimLaserCd = 0; // [NEW] RIM LASER 用クールダウン
        this.isDrone = false;
        this.isRimLaser = false; // [NEW] RIM LASER フラグ
        this.dischargeTimer = 0; // 放電演出用タイマー

        // RIM_LASER 状態
        this.rimState = 'RIM_RUN'; // 'RIM_RUN', 'DIVE_WARN', 'DIVE'
        this.rimSide = 0; // 0: 上, 1: 右, 2: 下, 3: 左
        this.rimT = 0; // 周回進捗 (0.0 - 1.0)
        this.rimTargetT = 0; // 突入予定位置
        this.rimWarnTimer = 0;
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
        this.spawnTime = this.game.getTime();
        this.isEvading = false;
        this.evasiveStartTime = 0;
        this.lastRetrackTime = this.game.getTime();
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
        this.entry = null;
        this.formationInfo = null;
        this.shieldAlpha = 0;

        // 状態のリセット (再利用時のバグ防止)
        this.barrierState = 'idle';
        this.barrierTimer = 0;
        this.orbitAngle = 0;
        this.damageMultiplier = 1.0;
        this.speedMultiplier = 1.0;
        this.attractorKind = null;
        this.isReflectActive = false;
        this.reflectCycleTimer = 0;
        this.isShielded = false;
        this.shieldAlpha = 0;
        this.pulseOutlineTimer = 0;
        this.obsState = 'hold';
        this.obsTimer = 0;
        this.didMark = false;
        this.didMarkThisHold = false;
        this.dashTimer = 0;
        this.searchTimer = 0;
        this.revengeState = 0;
        this.revengeTimer = 0;
        this.isBoss = false;
        this.ownerId = null;
        this.isDrone = false;
        this.isRimLaser = false;
        this.dischargeTimer = 0;
        this.rimState = 'RIM_RUN';
        this.rimT = 0;
        this.rimWarnTimer = 0;
        this.droneCd = 0;
        this.rimLaserCd = 0;

        if (this.isRimLaser || this.isDrone) {
            console.warn(`[POOL BUG] Enemy re-init with stale flags! Type: ${type}, ID: ${this.id}, isRimLaser: ${this.isRimLaser}, isDrone: ${this.isDrone}`);
        }

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
            else if (type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) typeSpeedMul = 1.5;

            this.baseSpeed = CONSTANTS.ENEMY_BASE_SPEED * speedMul * typeSpeedMul;
        }

        // リフレクターの初期化
        if (type === CONSTANTS.ENEMY_TYPES.REFLECTOR) {
            this.isReflectActive = true;
            this.reflectCycleTimer = CONSTANTS.REFLECTOR.activeDurationMs || 7000;
            this.renderAngle = this.angle; // 出現時の初期角度（通常はプレイヤー方向）で固定
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
            this.weavePhase = Math.PI * 2;
        }

        // configureMovement後にcurrentSpeedを設定（configureMovement内でbaseSpeedが変更される場合があるため）
        this.currentSpeed = this.baseSpeed;
        this.movementPhase = Math.random() * Math.PI * 2;

        if (this.type === CONSTANTS.ENEMY_TYPES.PLASMA_DRONE_STAGE5) {
            this.hasDirection = true;
        }

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
        // isBoss などの主要なフラグは冒頭のリセットブロックに移動済み

        // 制御レイヤー：世代管理と回避制限
        this.generation = 0;
        this.evasionTimer = 0;

        // OBSERVER 用 (冒頭で一部リセット済みだが、スロット等はここでも可)
        this.slotIndex = 0;
        this.nextSlotIndex = 0;

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
            CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5, // [NEW] 方向制御を有効化
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
        this.lastSummonTime = this.game.getTime();
        this.droneCd = CONSTANTS.PLASMA_DRONE_STAGE5.intervalMs; // 初期クールダウン
    }

    initPlasmaDrone(x, y, targetX, targetY, ownerId) {
        console.log(`[SPAWN] PlasmaDrone Init. Owner: ${ownerId}`);
        const cfg = CONSTANTS.PLASMA_DRONE_STAGE5;
        this.init(x, y, targetX, targetY, CONSTANTS.ENEMY_TYPES.PLASMA_DRONE_STAGE5, 1.0, 1.0);
        this.isDrone = true;
        this.maxHp = cfg.maxHp;
        this.hp = this.maxHp;
        this.ownerId = ownerId;
        this.lifespan = cfg.lifespanMs / 1000;
        this.isMinion = true; // フェーズ進行に影響させない
        this.currentSpeed = cfg.v0;
        this.angle = Math.atan2(targetY - y, targetX - x);
        this.vx = Math.cos(this.angle) * this.currentSpeed;
        this.ownerId = ownerId;
        this.hp = 1; // 1固定
        this.maxHp = 1;
        this.isMinion = true;
        this.lifespan = 8;

        // 挙動パターンのランダム割り当て
        const patterns = ['straight', 'sine', 'zigzag'];
        this.dronePattern = patterns[Math.floor(Math.random() * patterns.length)];
        this.patternSeed = Math.random() * Math.PI * 2;
        this.phase = 0;
    }

    initRimLaser(x, y, ownerId) {
        console.log(`[SPAWN] RimLaser Init. Owner: ${ownerId}`);
        const cfg = CONSTANTS.RIM_LASER_STAGE5;
        this.init(x, y, x, y, CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5);
        this.isRimLaser = true;
        this.ownerId = ownerId;
        this.hp = cfg.maxHp || 2;
        this.maxHp = this.hp;
        this.isMinion = true;
        this.lifespan = 12; // 念のための寿命

        this.rimState = 'RIM_RUN';
        // ボスから左右どちらかの画面端に向かわせるための初期設定
        this.rimSide = (Math.random() < 0.5) ? 1 : 3; // 1:右, 3:左
        this.rimT = 0; // 上端からスタート
        this.rimWarnTimer = 0;
        this.rimTargetT = 0.2 + Math.random() * 0.6;
        this.diveCooldown = 1.0 + Math.random() * 1.5;
        this.curveDir = (Math.random() < 0.5) ? 1 : -1;
    }

    applyKnockback(vx, vy, power) {
        // NaN Guard
        if (isNaN(vx) || isNaN(vy) || isNaN(power)) return;

        // ボスおよびドローン、リムレーザーは不動
        if (this.isBoss || this.isDrone || this.isRimLaser) return;

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
            case CONSTANTS.ENEMY_TYPES.OBSERVER:
                this.movementMode = 'HOVER';
                this.turnRate = (type === CONSTANTS.ENEMY_TYPES.OBSERVER) ? 0.05 : 0.03;
                this.orbitRadius = 180;

                // シールダー系初期化
                if (type === CONSTANTS.ENEMY_TYPES.SHIELDER || type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
                    const config = type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;
                    this.barrierState = 'idle';
                    this.barrierTimer = Math.random() * (config.barrierCooldownMs || 0);
                    this.orbitAngle = Math.random() * Math.PI * 2;
                }
                break;
            case CONSTANTS.ENEMY_TYPES.ATTRACTOR:
                // アトラクターはプレイヤーの周りを回る（接近しない）
                this.movementMode = 'ORBIT';
                this.orbitRadius = 300;
                this.orbitAngle = Math.random() * Math.PI * 2;
                this.turnRate = 0.05;  // 旋回速度
                // ランダムにREDまたはBLUEを選択
                this.attractorKind = Math.random() < 0.5 ? CONSTANTS.ATTRACTOR_KIND.RED : CONSTANTS.ATTRACTOR_KIND.BLUE;
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
            case CONSTANTS.ENEMY_TYPES.PLASMA_DRONE_STAGE5:
                this.movementMode = 'PLASMA_DRONE';
                break;
            case CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5:
                this.movementMode = 'RIM_LASER';
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

        const now = this.game.getTime();
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

        // --- PRODUCTION: Entry Glide ---
        if (this.entry) {
            this.entry.t += dt / 1000;
            if (this.entry.t >= this.entry.dur) {
                this.entry = null;
            } else {
                // Glide position (Constant velocity addition)
                this.x += this.entry.vx * dt / 1000;
                this.y += this.entry.vy * dt / 1000;
            }
        }

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

        // 保護オーラのフェード処理
        if (this.isShielded) {
            this.shieldAlpha = Math.min(1.0, this.shieldAlpha + dt / 200); // 0.2秒でフェードイン
        } else {
            this.shieldAlpha = Math.max(0.0, this.shieldAlpha - dt / 500); // 0.5秒でフェードアウト
        }

        // 1. 速度計算 (距離減衰 & バフ)
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSq = dx * dx + dy * dy;

        this.updateSpeed(dist, options);

        // 2. 移動ロジック (Movement Mode Switch)
        this.updateMovement(dtMod, playerX, playerY, dist, now, playerAngle, dt, options);

        // 3. 共通物理演算 (ノックバック & 位置更新)
        this.x += (this.vx * freezeMul * this.speedMultiplier + this.knockVX) * dtMod;
        this.y += (this.vy * freezeMul * this.speedMultiplier + this.knockVY) * dtMod;

        // 放電演出用タイマーの進行
        if (this.dischargeTimer > 0) {
            this.dischargeTimer -= dt / 1000;
            if (this.dischargeTimer <= 0) {
                this.dischargeTimer = 0;
                this.active = false;
                this.destroy('DISCHARGE_DONE', this.game); // 演出終了後に消滅
            }
        }

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

        // ボス更新
        if (this.isBoss && this.onSummon) {
            const hpPercent = this.hp / this.maxHp;
            let interval = hpPercent <= 0.5 ? CONSTANTS.BOSS_SUMMON_INTERVAL_ENRAGED_MS : CONSTANTS.BOSS_SUMMON_INTERVAL_NORMAL_MS;

            // Stage5Boss (bossIndex === 4) の召喚間隔を調整
            if (this.bossIndex === 4) {
                interval *= CONSTANTS.BOSS_STAGE5_SUMMON_INTERVAL_MUL;
            }

            if (now - this.lastSummonTime > interval) {
                // コールバック経由で main.js の handleBossSummon を呼ぶ
                // main.js 側で bossIndex を見て数制限を行う
                this.onSummon(this.x, this.y, this);
                this.lastSummonTime = now;
            }

            // プラズマ・ドローン ＆ RIM LASER 発射ロジック (Stage5Boss & Stage10Boss 共有)
            if (this.bossIndex === 4 || this.bossIndex === 9) {
                // ドローン
                this.droneCd -= dt;
                if (this.droneCd <= 0) {
                    if (options.spawnPlasmaDrone) {
                        if (options.spawnPlasmaDrone(this)) {
                            // Stage 10 でも Stage 5 の定数を共有（同等の動き）
                            this.droneCd = CONSTANTS.PLASMA_DRONE_STAGE5.intervalMs;
                        } else {
                            this.droneCd = 500;
                        }
                    }
                }

                // RIM LASER
                this.rimLaserCd -= dt;
                if (this.rimLaserCd <= 0) {
                    if (options.spawnRimLaser) {
                        if (options.spawnRimLaser(this)) {
                            this.rimLaserCd = CONSTANTS.RIM_LASER_STAGE5.intervalMs;
                        } else {
                            this.rimLaserCd = 500;
                        }
                    }
                }
            }
        }

        // Minion寿命 & 距離チェック
        if (this.isMinion) {
            // 寿命チェック
            if (this.lifespan > 0) {
                this.lifespan -= dt / 1000;
                if (this.lifespan <= 0) {
                    this.destroy('LIFETIME', this.game);
                }
            }
            // 距離チェック (迷子防止: プレイヤーから1000px以上離れたら対処)
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 1000) {
                if (this.isRimLaser) {
                    // RIM LASER は削除せず、プレイヤーへ向けて再突進させる
                    this.rimState = 'DIVE';
                    this.angle = Math.atan2(dy, dx);
                } else {
                    // その他のミニオンは遠すぎたら削除
                    this.destroy('OOB', this.game);
                }
            }
        }
    }

    updateSpeed(dist, options) {
        let speedRatio = 1.0;
        // 突進中などの特殊速度設定を保護するため、1.0未満の時のみ適用orベース速度を元に計算
        const isCharging =
            (this.movementMode === 'FLANK' && this.flankState === 3) ||
            (this.movementMode === 'DASH' && this.dashState === 2) ||
            (this.movementMode === 'ELITE' && this.eliteState === 2) ||
            (this.movementMode === 'ASSAULT_CURVE' && this.assaultState === 1) ||
            (this.movementMode === 'ASSAULT');

        if (dist < (CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS || 0) && !isCharging) {
            const t = Math.max(0, dist / CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS);
            speedRatio = CONSTANTS.ENEMY_MIN_SPEED_RATIO + (1.0 - CONSTANTS.ENEMY_MIN_SPEED_RATIO) * t;
        }

        if (isCharging) {
            // Keep high speed
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

    updateMovement(dtMod, px, py, dist, now, playerAngle, dt = 16.6, options = {}) {
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

                // 突撃時の倍率を適用 (ASSAULT 自体が突撃モード扱い)
                const assaultSpd = this.baseSpeed * (CONSTANTS.ASSAULT_CURVE.chargeSpeedMul || 2.5);
                this.vx = Math.cos(this.angle) * assaultSpd;
                this.vy = Math.sin(this.angle) * assaultSpd;
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

                    // Only start charge sequence if close enough to player
                    if (this.eliteTimer <= 0 && dist <= CONSTANTS.ELITE_CHARGE.minChargeDistance) {
                        this.eliteState = 1; // To Telegraph
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.telegraphDuration;
                        this.chargeAngle = targetAngle; // Lock on logic start
                    } else if (this.eliteTimer <= 0) {
                        // Reset timer if too far away
                        this.eliteTimer = CONSTANTS.ELITE_CHARGE.orbitDuration;
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

                // 5) Apply position updates
                this.x += this.vx * dtMod;
                this.y += this.vy * dtMod;

                // --- PRODUCTION: Formation Morph Correction (Weak adjustment) ---
                if (this.formationInfo) {
                    this.formationInfo.t += dt / 1000;
                    const t = this.formationInfo.t;
                    let targetOffset = { dx: this.formationInfo.offset.dx, dy: this.formationInfo.offset.dy };

                    // Apply Morph variations
                    if (this.formationInfo.pattern === 'CIRCLE') {
                        // CIRCLE_SHRINK: Lerp radius 1.0 -> 0.4 over 2s
                        const shrink = Math.max(0.4, 1.0 - (t / 2.0) * 0.6);
                        targetOffset.dx *= shrink;
                        targetOffset.dy *= shrink;
                    } else if (this.formationInfo.pattern === 'ARC') {
                        // ARC_ROTATE: Rotate 0.8 rad/s
                        const angle = 0.8 * t;
                        const cos = Math.cos(angle);
                        const sin = Math.sin(angle);
                        const rx = targetOffset.dx * cos - targetOffset.dy * sin;
                        const ry = targetOffset.dx * sin + targetOffset.dy * cos;
                        targetOffset.dx = rx;
                        targetOffset.dy = ry;
                    }

                    const targetX = this.formationInfo.anchor.x + targetOffset.dx;
                    const targetY = this.formationInfo.anchor.y + targetOffset.dy;

                    // Weak adjustment (k=3.0) to keep AI character
                    const k = 3.0;
                    this.x += (targetX - this.x) * k * dt / 1000;
                    this.y += (targetY - this.y) * k * dt / 1000;
                }

            // 6) Screen Boundary Logic (Collision with play area or wrap)

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
                        if (this.game && this.game.audio) this.game.audio.playSe('SE_BARRIER_02', { volume: 0.6, pitch: 1.2 });
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
                        this.chargeAngle = this.angle; // FINAL LOCK
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 3.0);
                        if (this.game && this.game.audio) {
                            this.game.audio.playSe('SE_BARRIER_02', { volume: 0.5 });
                        }
                    }

                } else if (this.dashState === 2) {
                    // FINAL DASH (Burst) [FIXED: Added missing implementation]
                    this.vx = Math.cos(this.chargeAngle) * this.currentSpeed;
                    this.vy = Math.sin(this.chargeAngle) * this.currentSpeed;
                    this.angle = this.chargeAngle;

                    // Dash trail
                    if (Math.random() < 0.6) {
                        Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 2.0);
                    }

                    if (this.dashTimer <= 0) {
                        this.dashState = 3; // To Cooldown
                        this.dashTimer = 800; // Cooldown duration
                        this.currentSpeed = this.baseSpeed * 0.4; // Heavy slowdown
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
                // ゲート型スイープ (BARRIER_PAIR)
                // ペアがいない場合は索敵モードへ (SEARCHへ移行)
                if (!this.partner || !this.partner.active || this.partner.partner !== this) {
                    this.movementMode = 'SEARCH';
                    this.searchTimer = CONSTANTS.BARRIER_PAIR.searchDurationMs || 7000;
                    break;
                }

                // [FIX] プレイヤーに近すぎたら逃げる (接触自滅防止)
                const fleeDist = CONSTANTS.BARRIER_PAIR.fleeDistance || 140;
                if (dist < fleeDist) {
                    const fleeAngle = Math.atan2(this.y - py, this.x - px);
                    this.turnTowards(fleeAngle, 0.2 * dtMod);
                    this.vx = Math.cos(this.angle) * this.currentSpeed * 1.5;
                    this.vy = Math.sin(this.angle) * this.currentSpeed * 1.5;
                    break;
                }

                // 安定化: IDの大小で左右を分担する
                const isLeader = this.id < this.partner.id;
                const formationSide = isLeader ? 1 : -1;

                // --- 分散包囲ロジック ---
                // 全ペア中での自身のインデックスを特定して分散する
                let baseAngle = playerAngle;
                if (this.game && this.game.frameCache && this.game.frameCache.barrierPairs.length > 1) {
                    const pairs = this.game.frameCache.barrierPairs;
                    const myId1 = Math.min(this.id, this.partner.id);
                    const myId2 = Math.max(this.id, this.partner.id);
                    const pairIndex = pairs.findIndex(p => p.id1 === myId1 && p.id2 === myId2);

                    if (pairIndex !== -1) {
                        // 全ペアで 360度を等分し、正面(playerAngle)を基準にオフセット
                        const totalPairs = pairs.length;
                        baseAngle = playerAngle + (pairIndex / totalPairs) * Math.PI * 2;
                    }
                }

                // 各ペアごとのスイープ (ベース角度を中心に左右に振る)
                const sweepFreq = 0.001;
                const sweepRange = (Math.PI / 180) * 40; // 40度の範囲でスイープ
                const sweepCenter = baseAngle + Math.sin(now * sweepFreq + (this.id % 10)) * sweepRange;

                // 2体の間隔 (30度程度)
                const gapAngle = (Math.PI / 180) * 30;
                let targetFormationAngle = sweepCenter + (formationSide * gapAngle);

                // ハンティング・パルス (距離の伸縮 180-320px)
                const pulseFreq = 0.0015;
                const baseOrbitR = 250;
                const orbitRange = 70;
                let targetDist2 = baseOrbitR + Math.sin(now * pulseFreq + (this.id % 5)) * orbitRange;

                // 目標座標の計算
                const tx2 = px + Math.cos(targetFormationAngle) * targetDist2;
                const ty2 = py + Math.sin(targetFormationAngle) * targetDist2;

                const approachAngle2 = Math.atan2(ty2 - this.y, tx2 - this.x);
                this.turnTowards(approachAngle2, (this.turnRate || 0.05) * dtMod);

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'SEARCH':
                // 相方喪失時の索敵・再ペアリング
                this.searchTimer -= dt;

                // 他のはぐれ個体(SEARCH状態のBARRIER_PAIR)を探す
                if (options.allEnemies && ((options.frameCount + this.id) % 20 === 0)) { // 負荷軽減のため20フレームに1回
                    const others = options.allEnemies;
                    for (let i = 0; i < others.length; i++) {
                        const e = others[i];
                        if (e !== this &&
                            e.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR &&
                            e.movementMode === 'SEARCH' &&
                            e.active) {

                            // 合流！
                            this.partner = e;
                            e.partner = this;
                            this.movementMode = 'AVOID';
                            e.movementMode = 'AVOID';

                            if (this.game && this.game.audio) this.game.audio.playSe('SE_BARRIER_02', { volume: 0.4, pitch: 1.5 });
                            break;
                        }
                    }
                }

                if (this.searchTimer <= 0) {
                    this.movementMode = 'REVENGE';
                    this.revengeState = 0; // ANGER
                    this.revengeTimer = 800;
                    break;
                }

                // 外周を回る挙動
                const searchR = CONSTANTS.BARRIER_PAIR.searchOrbitRadius || 360;
                this.orbitAngle += 0.012 * dtMod;
                const sx = px + Math.cos(this.orbitAngle) * searchR;
                const sy = py + Math.sin(this.orbitAngle) * searchR;

                this.turnTowards(Math.atan2(sy - this.y, sx - this.x), 0.06 * dtMod);
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'REVENGE':
                // 単独突撃 (怒りの復讐)
                this.revengeTimer -= dt;

                if (this.revengeState === 0) {
                    // 0: ANGER (溜め)
                    this.vx *= 0.85;
                    this.vy *= 0.85;
                    this.turnTowards(targetAngle, 0.1 * dtMod);

                    // 激しく震える演出
                    this.renderX += (Math.random() - 0.5) * 6;
                    this.renderY += (Math.random() - 0.5) * 6;

                    if (this.revengeTimer <= 0) {
                        this.revengeState = 1; // ZIGZAG CHARGE
                        this.currentSpeed = this.baseSpeed * 5.4; // [FIX] 3.0倍に強化 (1.8 * 3)
                        if (this.game && this.game.audio) this.game.audio.playSe('SE_BARRIER_02', { volume: 0.4 });
                    }
                } else if (this.revengeState === 1) {
                    // 1: ZIGZAG CHARGE
                    const amp = CONSTANTS.BARRIER_PAIR.revengeZigzagAmp || 120;
                    const freq = CONSTANTS.BARRIER_PAIR.revengeZigzagFreq || 0.008;
                    const osc = Math.sin(now * freq) * amp;
                    const perp = targetAngle + Math.PI / 2;

                    const tx = px + Math.cos(targetAngle) * 50 + Math.cos(perp) * osc;
                    const ty = py + Math.sin(targetAngle) * 50 + Math.sin(perp) * osc;

                    this.turnTowards(Math.atan2(ty - this.y, tx - this.x), 0.15 * dtMod);
                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;

                    if (dist < (CONSTANTS.BARRIER_PAIR.revengeChargeDist || 250)) {
                        this.revengeState = 2; // SONIC BURST
                        this.revengeTimer = 600;
                        this.chargeAngle = targetAngle;
                        this.currentSpeed = this.baseSpeed * 13.5; // [FIX] 3.0倍に強化 (4.5 * 3)
                    }
                } else if (this.revengeState === 2) {
                    // 2: SONIC BURST (直線高速突進)
                    this.vx = Math.cos(this.chargeAngle) * this.currentSpeed;
                    this.vy = Math.sin(this.chargeAngle) * this.currentSpeed;
                    this.angle = this.chargeAngle;

                    // 高速移動時のエフェクト強化
                    if (Math.random() < 0.9) Effects.createThruster(this.renderX, this.renderY, this.angle + Math.PI, 2.5);
                    if (Math.random() < 0.3) Effects.createSpark(this.renderX, this.renderY, '#00ffff');

                    if (this.revengeTimer <= 0) {
                        this.revengeState = 1; // 蛇行に戻る
                    }
                }
                break;

            case 'REFLECT':
                // 高度なリフレクト移動: 多彩な動き + 自機非接触
                if (this.reflectTimer === undefined) {
                    this.reflectTimer = 0;
                    this.reflectStrafeDir = Math.random() < 0.5 ? 1 : -1;
                    this.reflectOrbitPhase = Math.random() * Math.PI * 2;
                    this.orbitAngle = targetAngle + Math.PI; // 初期位置付近からスタート
                }

                this.reflectTimer -= dt;

                // orbitAngle を playerAngle（プレイヤーの正面方向）に寄せる
                let orbitTarget = playerAngle;

                let angDiff = orbitTarget - this.orbitAngle;
                while (angDiff < -Math.PI) angDiff += Math.PI * 2;
                while (angDiff > Math.PI) angDiff -= Math.PI * 2;

                this.orbitAngle += angDiff * 0.05 * dtMod;

                // 距離の伸縮 (200 - 350px)
                this.reflectOrbitPhase += 0.01 * dtMod;
                const baseOrbit = 260;
                const orbitAmp = 80;

                // 旋回運動 (既存の orbitAngle は上で更新済みなので、ここでは位置のみ)
                // const moveAngleR = Math.atan2(tyR - this.y, txR - this.x); 
                // this.turnTowards(moveAngleR, 0.08 * dtMod);
                // -> 移動自体は orbitAngle に基づく目標地点 txR, tyR を目指す
                const reflectOrbitDist = baseOrbit + Math.sin(this.reflectOrbitPhase) * orbitAmp;
                const txR = px + Math.cos(this.orbitAngle) * reflectOrbitDist;
                const tyR = py + Math.sin(this.orbitAngle) * reflectOrbitDist;
                const moveAngleR = Math.atan2(tyR - this.y, txR - this.x);
                this.turnTowards(moveAngleR, 0.12 * dtMod); // 回り込みは機敏に

                // 速度適用
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;

                // 強制的な自機回避 (150px 以内に入りそうなら外へ逃げる)
                if (dist < 150) {
                    const fleeAngle = Math.atan2(this.y - py, this.x - px);
                    this.vx = Math.cos(fleeAngle) * this.currentSpeed * 1.5;
                    this.vy = Math.sin(fleeAngle) * this.currentSpeed * 1.5;
                }

                // ★盾の向き (renderAngle) をプレイヤー方向 (targetAngle) に向ける
                // ただし即時ではなく、少し遅延させる（ユーザ要望：7割程度の追従感）
                let rDiff = targetAngle - this.renderAngle;
                while (rDiff < -Math.PI) rDiff += Math.PI * 2;
                while (rDiff > Math.PI) rDiff -= Math.PI * 2;

                const rotationLimit = 0.055 * dtMod; // 旋回速度を制限（プレイヤーの急旋回を逃す隙）
                if (Math.abs(rDiff) < rotationLimit) {
                    this.renderAngle = targetAngle;
                } else {
                    this.renderAngle += Math.sign(rDiff) * rotationLimit;
                }
                break;


            case 'ORBIT':
                // 周回移動: プレイヤーの周りを一定距離で回る
                // アトラクター、ORBITERなどが使用

                if (this.orbitAngle === undefined) {
                    this.orbitAngle = Math.atan2(this.y - py, this.x - px);
                }

                // 目標距離
                const targetOrbitDist = this.orbitRadius || 250;
                const minSafeDist = targetOrbitDist * 0.8;  // 最小安全距離
                const maxDist = targetOrbitDist * 1.2;      // 最大距離

                // 距離が近すぎる場合は強制的に外へ逃げる（最優先）
                if (dist < minSafeDist) {
                    // 強制的に外へ
                    const fleeAngle = Math.atan2(this.y - py, this.x - px);
                    this.vx = Math.cos(fleeAngle) * this.currentSpeed * 2.0;
                    this.vy = Math.sin(fleeAngle) * this.currentSpeed * 2.0;
                    this.angle = fleeAngle;
                } else if (dist > maxDist) {
                    // 遠すぎる場合は近づく
                    const approachAngle = Math.atan2(py - this.y, px - this.x);
                    this.turnTowards(approachAngle, (this.turnRate || 0.05) * dtMod);
                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;
                } else {
                    // 適切な距離：周回運動
                    const orbitSpeed = 0.015 * dtMod;
                    this.orbitAngle += orbitSpeed;

                    // 目標位置
                    const tx = px + Math.cos(this.orbitAngle) * targetOrbitDist;
                    const ty = py + Math.sin(this.orbitAngle) * targetOrbitDist;

                    // 目標位置へ移動
                    const moveAngle = Math.atan2(ty - this.y, tx - this.x);
                    this.turnTowards(moveAngle, (this.turnRate || 0.05) * dtMod);

                    this.vx = Math.cos(this.angle) * this.currentSpeed;
                    this.vy = Math.sin(this.angle) * this.currentSpeed;
                }
                break;

            case 'HOVER':
                // ホバリング移動: 一定距離を保ちながらゆっくり移動
                // SHIELDER、GUARDIAN、OBSERVERなどが使用

                const hoverDist = this.orbitRadius || 180;

                if (dist < hoverDist - 30) {
                    // 遠ざかる
                    const awayAngle = Math.atan2(this.y - py, this.x - px);
                    this.turnTowards(awayAngle, (this.turnRate || 0.03) * dtMod);
                } else if (dist > hoverDist + 30) {
                    // 近づく
                    this.turnTowards(targetAngle, (this.turnRate || 0.03) * dtMod);
                } else {
                    // 距離を維持しながら横移動
                    const tangentAngle = targetAngle + Math.PI / 2;
                    this.turnTowards(tangentAngle, (this.turnRate || 0.03) * dtMod);
                }

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'TRICKSTER':
                // 不規則
                this.movementPhase += (Math.random() - 0.5) * 0.2 * dtMod;
                const trickAngle = targetAngle + Math.sin(this.movementPhase) * 1.0;
                this.turnTowards(trickAngle, 0.1 * dtMod);
                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

                break;

            case 'PLASMA_DRONE':
                // プラズマ・ドローン専用ロジック: 多様な誘導パターン、特定距離で加速、至近距離で放電
                const cfgPD = CONSTANTS.PLASMA_DRONE_STAGE5;
                this.phase += dtMod * 0.05;

                // 1. 各パターンに応じたターゲット角度のオフセット計算
                let angleOffset = 0;
                if (this.dronePattern === 'sine') {
                    // ゆらゆらとサインカーブで接近
                    angleOffset = Math.sin(this.phase * 1.5 + this.patternSeed) * 0.8;
                } else if (this.dronePattern === 'zigzag') {
                    // カクカクとジグザグに接近
                    angleOffset = (Math.sin(this.phase * 2.5 + this.patternSeed) > 0 ? 0.7 : -0.7);
                }

                // 2. 旋回制限付き誘導 (オフセット適用)
                this.turnTowards(targetAngle + angleOffset, (cfgPD.turnRate || 0.02) * dtMod);

                // 3. 加速ロジック: 一定距離以内に入ると最大速度まで加速
                // ※加速中は直進性が強まるようにオフセットの影響を減らす
                const accelRange = (cfgPD.accelDist || 250);
                if (dist < accelRange) {
                    this.currentSpeed = Math.min(cfgPD.vMax, this.currentSpeed + 0.05 * dtMod);
                    // 接近するほど「獲物を捉えた」ように補正を弱める
                    const proximityMul = Math.max(0, (dist - 100) / (accelRange - 100));
                    this.angle += angleOffset * proximityMul * 0.02;
                }

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;

                // 4. 放電(DISCHARGE)判定: 至近距離で放電して消滅
                if (dist < (cfgPD.dischargeDist || 60)) {
                    this.destroy('DISCHARGE', this.game);
                }
                break;

            case 'RIM_LASER':
                // RIM LASER 専用移動ロジック (周回 -> 警告 -> ダイブ)
                const rimCfg = (this.game && this.game.currentStage >= 10) ? CONSTANTS.RIM_LASER_STAGE10 : CONSTANTS.RIM_LASER_STAGE5;
                const margin = -80; // [RESTORED] 画面を大きく外周させる
                const wEdge = CONSTANTS.TARGET_WIDTH - margin * 2;
                const hEdge = CONSTANTS.TARGET_HEIGHT - margin * 2;

                if (this.rimState === 'RIM_RUN') {
                    // 1. 周回移動 (RIM_RUN): 画面端（外側）を矩形に回る [RESTORED]

                    this.rimT += (rimCfg.speed / 1000) * dtMod;
                    if (this.rimT >= 1.0) {
                        this.rimT -= 1.0;
                        this.rimSide = (this.rimSide + 1) % 4;
                    }

                    // ダイブ判定
                    if (this.diveCooldown > 0) {
                        this.diveCooldown -= dt / 1000;
                    } else if (Math.random() < 0.04) {
                        // 上端(0)以外からダイブするように制限
                        if (this.rimSide !== 0) {
                            this.rimState = 'DIVE_WARN';
                            this.rimWarnTimer = rimCfg.warnDuration || 0.25;
                            this.vx = 0;
                            this.vy = 0;
                        }
                    }

                    let tx, ty;
                    if (this.rimSide === 0) { // 上
                        tx = margin + this.rimT * wEdge;
                        ty = margin;
                    } else if (this.rimSide === 1) { // 右
                        tx = margin + wEdge;
                        ty = margin + this.rimT * hEdge;
                    } else if (this.rimSide === 2) { // 下
                        tx = margin + wEdge - this.rimT * wEdge;
                        ty = margin + hEdge;
                    } else { // 左
                        tx = margin;
                        ty = margin + hEdge - this.rimT * hEdge;
                    }

                    const angleToTarget = Math.atan2(ty - this.y, tx - this.x);
                    this.angle = angleToTarget;
                    // ボス近傍は離脱を早める
                    const spd = (dist < 150) ? rimCfg.speed * 2.5 : rimCfg.speed;
                    this.vx = Math.cos(this.angle) * spd;
                    this.vy = Math.sin(this.angle) * spd;

                } else if (this.rimState === 'DIVE_WARN') {
                    // 2. 侵入直前予告 (DIVE_WARN): その場で停止
                    this.rimWarnTimer -= dt / 1000;
                    this.vx = 0;
                    this.vy = 0;
                    // プレイヤーの方を向く
                    this.angle = targetAngle;

                    if (this.rimWarnTimer <= 0) {
                        this.rimState = 'DIVE';
                        if (this.game && this.game.audio) this.game.audio.playSe('SE_SHOT_RIFLE', { variation: 0.2, pitch: 1.5 });
                    }
                } else if (this.rimState === 'DIVE') {
                    // 3. 弧状突進 (DIVE): [RESTORED] 大きなカーブを描いてプレイヤーを追い詰める
                    if (this.curveDir === undefined) {
                        this.curveDir = (this.id % 2 === 0) ? 1 : -1;
                    }

                    // 距離に応じたカーブ（遠いほど膨らむ）
                    const curveIntensity = Math.max(0.15, Math.min(1.0, dist / 450));
                    const baseOffset = (Math.PI / 180) * 80; // 最大80度 (よりダイナミックに)
                    const curveOffset = baseOffset * curveIntensity * this.curveDir;

                    const finalTarget = targetAngle + curveOffset;
                    this.turnTowards(finalTarget, 0.18 * dtMod); // 旋回性能を少し向上

                    this.vx = Math.cos(this.angle) * rimCfg.diveSpeed;
                    this.vy = Math.sin(this.angle) * rimCfg.diveSpeed;
                }
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
        // [ROBUST FIX] 描画状態を完全に分離するための外側ラッパー
        ctx.save();
        try {
            ctx.translate(this.renderX, this.renderY);

            // 進行方向への回転適用 (本体のみに適用するため save)
            ctx.save();
            if (this.hasDirection) {
                // リフレクターは移動方向(angle)ではなく、盾の向き(renderAngle)で回転させる
                const rot = (this.type === CONSTANTS.ENEMY_TYPES.REFLECTOR) ? this.renderAngle : this.angle;
                // スプライトは元々-Y方向(上)を向いていると仮定し、進行方向に向けるために+90度補正
                ctx.rotate(rot + Math.PI / 2);
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
                // bossIndex が設定されている場合は優先、なければ game の現在ステージを参照
                const idx = (this.bossIndex !== -1) ? this.bossIndex : (this.game ? this.game.currentStage : 0);
                const stageNum = idx + 1;
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

                    // 正面（自機側）を向く半円の範囲 (本体回転 PI/2 により、自機方向は local -PI/2)
                    const startAngle = -Math.PI;
                    const endAngle = 0;

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
                // (PD5/RL5などは意図的に独自描画を行っているため警告を抑制)
                switch (this.type) {
                    case CONSTANTS.ENEMY_TYPES.NORMAL:
                        this.drawShape(ctx, 3, '#ff0000'); // Triangle
                        break;
                    case CONSTANTS.ENEMY_TYPES.PLASMA_DRONE_STAGE5:
                        // プラズマ・ドローンの独自図形描画: コア + リング
                        const sizePD = 20;
                        // Stage 10 (ownerId === 9) は赤系、Stage 5 は青系 [FIX]
                        const isStage10 = this.ownerId === 9;
                        const droneColor = isStage10 ? '#ff5555' : '#0ff';
                        const droneColorRGB = isStage10 ? '255, 85, 85' : '0, 255, 255';

                        // 1. 放電エフェクト (dischargeTimer 進行時)
                        if (this.dischargeTimer > 0) {
                            const progress = 1.0 - (this.dischargeTimer / 0.5);
                            const r = progress * CONSTANTS.PLASMA_DRONE_STAGE5.dischargeRadius;
                            ctx.save();
                            ctx.strokeStyle = `rgba(${droneColorRGB}, ${1.0 - progress})`;
                            ctx.lineWidth = 4;
                            ctx.shadowBlur = 30;
                            ctx.shadowColor = droneColor;
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.beginPath();
                            ctx.arc(0, 0, r, 0, Math.PI * 2);
                            ctx.stroke();

                            // スパーク演出
                            if (Math.random() < 0.5) {
                                ctx.rotate(Math.random() * Math.PI * 2);
                                ctx.strokeStyle = "#fff";
                                ctx.lineWidth = 2;
                                ctx.beginPath();
                                ctx.moveTo(r * 0.8, 0);
                                ctx.lineTo(r * 1.1, 0);
                                ctx.stroke();
                            }
                            ctx.restore();
                        }

                        // 2. 本体コア (Glowing Core)
                        ctx.save();
                        const coreGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
                        coreGlow.addColorStop(0, "#fff");
                        coreGlow.addColorStop(0.4, droneColor);
                        coreGlow.addColorStop(1, `rgba(${droneColorRGB}, 0)`);
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = droneColor;
                        ctx.fillStyle = coreGlow;
                        ctx.beginPath();
                        ctx.arc(0, 0, 8, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        // 3. 外部リング (Rotating Ring) - 削除

                        // 4. トレイル（微弱な粒子）
                        if (Math.random() < 0.2) {
                            Effects.createSpark(this.x, this.y, droneColor);
                        }
                        break;

                    case CONSTANTS.ENEMY_TYPES.RIM_LASER_STAGE5:
                        // RIM LASER の描画: 発光する矩形（光弾）
                        ctx.save();
                        ctx.globalCompositeOperation = 'lighter';

                        // 1. 警告エフェクト
                        if (this.rimState === 'DIVE_WARN') {
                            const p = 1.0 - (this.rimWarnTimer / 0.25);
                            ctx.save();
                            // もし画面外にいる場合は、画面端（プレイエリア内）に警告枠を出す
                            const screenMargin = 20;
                            const drawX = Math.max(-this.renderX + screenMargin, Math.min(CONSTANTS.TARGET_WIDTH - this.renderX - screenMargin, 0));
                            const drawY = Math.max(-this.renderY + screenMargin, Math.min(CONSTANTS.TARGET_HEIGHT - this.renderY - screenMargin, 0));

                            ctx.translate(drawX, drawY);
                            ctx.shadowBlur = 40;
                            ctx.shadowColor = "#fff";
                            ctx.strokeStyle = `rgba(255, 255, 255, ${p})`;
                            ctx.lineWidth = 2 + p * 8;
                            ctx.beginPath();
                            ctx.strokeRect(-20, -15, 40, 30);
                            ctx.restore();
                        }

                        // 2. 本体
                        // [FIX] 進行方向に平行な（aligned）鋭いライン形状
                        // ctx.rotate(rot + PI/2) により、ローカルY軸が進行方向
                        // Stage 10 (ownerId === 9) は赤系、Stage 5 は青系 [FIX]
                        const isStage10Rim = this.ownerId === 9;
                        const rimColor = isStage10Rim ? '#ff5555' : '#0ff';

                        ctx.shadowBlur = 25;
                        ctx.shadowColor = rimColor;
                        ctx.strokeStyle = rimColor;
                        ctx.lineWidth = 2;

                        ctx.beginPath();
                        ctx.moveTo(0, -18);
                        ctx.lineTo(0, 18);
                        ctx.stroke();

                        // 3. コア（光る芯）
                        ctx.fillStyle = "#fff";
                        ctx.fillRect(-1, -15, 2, 30);

                        // 4. 電撃エフェクト (Electrical Discharge)
                        // [FIX] 羽のようなトレイルを廃止し、本体周囲にジグザグの電撃を走らせる
                        const now = Date.now();
                        ctx.strokeStyle = "#fff";
                        ctx.lineWidth = 1;
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = rimColor;

                        for (let i = 0; i < 2; i++) {
                            ctx.beginPath();
                            let startY = -18;
                            ctx.moveTo((Math.random() - 0.5) * 6, startY);
                            for (let y = -10; y <= 18; y += 8) {
                                ctx.lineTo((Math.random() - 0.5) * 10, y);
                            }
                            ctx.stroke();
                        }

                        // トレイル（微かな粒子のみ、頻度を大幅に下げるか廃止）
                        if (Math.random() < 0.05) {
                            Effects.createSpark(this.x, this.y, rimColor);
                        }

                        ctx.restore();
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
            ctx.restore(); // [FIX] Restore Save R (Body Rotation context at line 1362)

            // シールダーのバリア/弱点演出 (HEX GRID VERSION)
            if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER) {
                const baseSize = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;

                if (this.barrierState === 'windup') {
                    const now = Date.now();
                    const radius = CONSTANTS.SHIELDER.auraRadius || (baseSize * 1.8);
                    const color = '0, 255, 255';

                    // 設置が近づくにつれて強まる点滅
                    const flash = Math.sin(now * 0.02);
                    const progress = 1.0 - (this.barrierTimer / (CONSTANTS.SHIELDER.barrierWindupMs || 800));

                    ctx.save();


                    // 波打つ六角形グリッド (Telegraph)
                    const hexSize = 10;
                    const gridRadius = Math.ceil(radius / (hexSize * 1.5));

                    ctx.globalCompositeOperation = 'lighter';
                    for (let q = -gridRadius; q <= gridRadius; q++) {
                        for (let r = -gridRadius; r <= gridRadius; r++) {
                            const hx = hexSize * (3 / 2 * q);
                            const hy = hexSize * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
                            const distVal = Math.sqrt(hx * hx + hy * hy);

                            if (distVal < radius) {
                                // 同心円状に波打つロジック
                                const wave = Math.sin(distVal * 0.1 - now * 0.015);
                                const alpha = (wave > 0.4 ? 0.4 : 0.1) * (0.5 + progress * 0.5);

                                ctx.strokeStyle = `rgba(${color}, ${alpha})`;
                                ctx.fillStyle = `rgba(${color}, ${alpha * 0.3})`;

                                ctx.beginPath();
                                for (let i = 0; i < 6; i++) {
                                    const ang = (i / 6) * Math.PI * 2;
                                    ctx.lineTo(hx + Math.cos(ang) * (hexSize - 1), hy + Math.sin(ang) * (hexSize - 1));
                                }
                                ctx.closePath();
                                if (wave > 0.7) ctx.fill();
                                ctx.stroke();
                            }
                        }
                    }
                    ctx.restore();
                }
            }

            // 設置型バリア演出 (SHIELDER 以外の敵タイプ)
            if (this.barrierState === 'active' && this.type !== CONSTANTS.ENEMY_TYPES.SHIELDER && this.type !== CONSTANTS.ENEMY_TYPES.GUARDIAN) {
                // GUARDIAN などの従来型バリア演出は維持（SHIELDERは設置型へ移行したため除外）
                const baseSize = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
                const now = Date.now();
                const radius = CONSTANTS.SHIELDER.auraRadius || (baseSize * 1.8);
                const color = '0, 255, 255';

                ctx.save();

                // シンプルな円形バリア（軽量化版）
                const pulse = Math.sin(now * 0.005) * 0.2 + 0.8;
                ctx.strokeStyle = `rgba(${color}, ${0.6 * pulse})`;
                ctx.fillStyle = `rgba(${color}, ${0.1 * pulse})`;
                ctx.lineWidth = 2;

                // 外側の円
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // 内側の回転する六角形（1つだけ）
                ctx.save();
                ctx.rotate(now * 0.001);
                ctx.strokeStyle = `rgba(${color}, 0.8)`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const ang = (i / 6) * Math.PI * 2;
                    const x = Math.cos(ang) * radius * 0.7;
                    const y = Math.sin(ang) * radius * 0.7;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();

                ctx.restore();
            }

            // (Protect shield outline removed per user request)

            // Pulsing effect
            const pulse = Math.sin(Date.now() * 0.005);

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

            // [REDESIGNED] Matrix Digital Forcefield Effect
            if (this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && this.barrierState === 'active') {
                const nowTime = Date.now();
                const radius = 60;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Core Digital Layers
                const charSize = 8;
                for (let j = 0; j < 3; j++) {
                    const r = radius * (1.2 + j * 0.25);
                    const alpha = 0.6 - j * 0.15;
                    ctx.save();
                    ctx.rotate(nowTime * (0.0005 + j * 0.0002));
                    ctx.fillStyle = `rgba(0, 255, 150, ${alpha * (0.7 + Math.sin(nowTime * 0.005) * 0.3)})`;

                    const numSidesMatrix = 6;
                    for (let side = 0; side < numSidesMatrix; side++) {
                        const sAng = (side / numSidesMatrix) * Math.PI * 2;
                        const eAng = ((side + 1) / numSidesMatrix) * Math.PI * 2;
                        const sx = Math.cos(sAng) * r;
                        const sy = Math.sin(sAng) * r;
                        const ex = Math.cos(eAng) * r;
                        const ey = Math.sin(eAng) * r;

                        const edgeLen = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
                        const count = Math.floor(edgeLen / charSize);
                        for (let i = 0; i < count; i++) {
                            const t = i / count;
                            const px = sx + (ex - sx) * t;
                            const py = sy + (ey - sy) * t;

                            // Seeded random bit
                            const bitSeed = Math.floor(nowTime / 150) + side * 13 + i + j * 71;
                            const char = (Math.abs(Math.sin(bitSeed * 7.89)) > 0.5) ? "1" : "0";
                            ctx.fillText(char, px, py);
                        }
                    }
                    ctx.restore();
                }
                // (Inner Scan Glow removed per user request: No lines/circles)

                ctx.restore();
            }

            // アトラクターのオーラエフェクト（RED/BLUE）
            if (this.type === CONSTANTS.ENEMY_TYPES.ATTRACTOR && this.attractorKind) {
                const nowTime = Date.now();
                const radius = CONSTANTS.ATTRACTOR.pullRadius || 200;

                // 属性に応じた色設定
                let color, colorRGB;
                if (this.attractorKind === CONSTANTS.ATTRACTOR_KIND.RED) {
                    color = 'rgba(255, 50, 50, '; // RED
                    colorRGB = '255, 50, 50';
                } else if (this.attractorKind === CONSTANTS.ATTRACTOR_KIND.BLUE) {
                    colorRGB = '50, 100, 255';
                    color = 'rgba(50, 100, 255, '; // BLUE
                } else {
                    color = 'rgba(0, 255, 0, '; // デフォルト（緑）
                    colorRGB = '0, 255, 0';
                }

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                // Layer 1: パルスする外側のリング
                const pulse = Math.sin(nowTime * 0.004) * 0.15 + 0.85;
                ctx.strokeStyle = color + (0.3 + Math.sin(nowTime * 0.003) * 0.15) + ')';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
                ctx.stroke();

                // Layer 2: 回転する内側のリング
                ctx.save();
                ctx.rotate(nowTime * 0.0015);
                ctx.strokeStyle = color + '0.5)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
                ctx.stroke();

                // 回転する装飾ライン
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    const x1 = Math.cos(angle) * radius * 0.5;
                    const y1 = Math.sin(angle) * radius * 0.5;
                    const x2 = Math.cos(angle) * radius * 0.9;
                    const y2 = Math.sin(angle) * radius * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();

                // Layer 3: 中心の強調リング
                ctx.strokeStyle = color + '0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 25, 0, Math.PI * 2);
                ctx.stroke();

                // パーティクル（属性色）
                const pCount = 8;
                for (let i = 0; i < pCount; i++) {
                    const seed = (nowTime + i * 300) * 0.0008;
                    const angle = (i / pCount) * Math.PI * 2 + seed;
                    const dist = (seed % 1) * radius * 0.8 + radius * 0.2;
                    const px = Math.cos(angle) * dist;
                    const py = Math.sin(angle) * dist;
                    const pAlpha = 1 - (dist / radius);
                    ctx.fillStyle = `rgba(${colorRGB}, ${pAlpha * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }

            // --- END OF ROTATABLE SECTION ---

            // Barrier_PAIR Line
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

            // シールダーバリアバフエフェクト（六角形）
            if (this.isShielded) {
                const size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
                const hexRadius = size * 1.3;
                const nowTime = Date.now();

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 + Math.sin(nowTime * 0.005) * 0.2})`;
                ctx.lineWidth = 2;

                // 六角形を描画
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2; // -90度から開始
                    const x = Math.cos(angle) * hexRadius;
                    const y = Math.sin(angle) * hexRadius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();

                // 回転する内側の六角形
                ctx.save();
                ctx.rotate(nowTime * 0.001);
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.3})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const x = Math.cos(angle) * hexRadius * 0.7;
                    const y = Math.sin(angle) * hexRadius * 0.7;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.restore();

                ctx.restore();
            }

            // アトラクターバフインジケーター（▲マーク）
            // アトラクター自身は表示しない
            if (this.type !== CONSTANTS.ENEMY_TYPES.ATTRACTOR) {
                const hasRedBuff = this.damageMultiplier && this.damageMultiplier > 1.0;
                const hasBlueBuff = this.speedMultiplier && this.speedMultiplier > 1.0;

                if (hasRedBuff || hasBlueBuff) {
                    const size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
                    const offsetX = size * 0.7;  // 右上
                    const offsetY = -size * 0.7;

                    ctx.save();
                    ctx.font = 'bold 16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // 縁取り
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;

                    if (hasRedBuff) {
                        ctx.strokeText('▲', offsetX, offsetY);
                        ctx.fillStyle = '#ff4444';
                        ctx.fillText('▲', offsetX, offsetY);
                    }

                    if (hasBlueBuff) {
                        const blueOffsetY = hasRedBuff ? offsetY + 18 : offsetY;
                        ctx.strokeText('▲', offsetX, blueOffsetY);
                        ctx.fillStyle = '#4444ff';
                        ctx.fillText('▲', offsetX, blueOffsetY);
                    }

                    ctx.restore();
                }
            }

            // Apply Shadow to the main body drawing
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ffaa';

            // GLOBAL GUARDIAN BUFF (Applied to all enemies)
            // This is separate because it needs its own translation if the above one is closed
            if (this.game && this.game.globalGuardianActive) {
                const buffSize = (this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE) * 1.6;
                const nowTime = Date.now();
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowBlur = 0; // Clear any leaking shadow

                // (Pulsing background removed per user request: Numbers only)
                ctx.beginPath(); // Reset path state
                // [REDESIGNED] Pure Matrix Global Buff Aura (Numbers Only)
                const pulseMatrix = (Math.sin(nowTime * 0.005) + 1) * 0.5;
                ctx.save();
                ctx.rotate(nowTime * 0.0008);
                ctx.font = '8px monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(0, 255, 150, ${0.4 + Math.sin(nowTime * 0.005) * 0.2})`;

                const sides = 6;
                const charSize = 7;
                for (let side = 0; side < sides; side++) {
                    const sAng = (side / sides) * Math.PI * 2;
                    const eAng = ((side + 1) / sides) * Math.PI * 2;
                    const sx = Math.cos(sAng) * buffSize;
                    const sy = Math.sin(sAng) * buffSize;
                    const ex = Math.cos(eAng) * buffSize;
                    const ey = Math.sin(eAng) * buffSize;

                    const edgeLen = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
                    const count = Math.ceil(edgeLen / charSize);
                    for (let i = 0; i < count; i++) {
                        const t = i / count;
                        const char = (Math.abs(Math.sin(side * 17 + i + Math.floor(nowTime / 200))) > 0.5) ? "1" : "0";
                        ctx.fillText(char, sx + (ex - sx) * t, sy + (ey - sy) * t);
                    }
                }
                ctx.restore();
                ctx.restore(); // Restore GGB (1909)
            }
        } catch (e) {
            console.error(`[Enemy Draw Error] type=${this.type}, id=${this.id}, error:`, e);
        } finally {
            ctx.restore(); // [ROBUST FIX] メソッド開始時の Save を確実に復元
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
        if (this.type === CONSTANTS.ENEMY_TYPES.OBSERVER && this.obsState === 'snap') return 0; // SNAP中は無敵
        let actualAmount = amount;

        // 1) SHIELDER 軽減 (設置型シールド内)
        if (options.isAuraProtected) {
            actualAmount = 1; // ★全ダメージ 1 固定
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
            if (remaining <= 0) return 0;

            actualAmount = Math.min(actualAmount, remaining);
            Effects.spawnHitEffect(this.renderX, this.renderY, actualAmount);
            this.hp -= actualAmount;
            this.damageInCurrentSecond += actualAmount;
        } else {
            // 6) HP 減算
            Effects.spawnHitEffect(this.renderX, this.renderY, actualAmount);
            this.hp -= actualAmount;
        }

        return actualAmount; // 実際に受けたダメージを返す
    }

    returnToPool() {
        this.active = false;
        if (this.game && this.game.enemyPool) {
            this.game.enemyPool.release(this);
        }
    }

    destroy(reason = 'damage', game) {
        if (!this.active) return;

        // ドローンの放電(DISCHARGE)時は即座に active = false にせず、タイマーを回す
        if (reason === 'DISCHARGE') {
            if (this.dischargeTimer === 0) {
                this.dischargeTimer = 0.5; // 0.5秒の演出時間

                // [FIX] 演出待ちで return する前に、ダメージ判定を即座に行う
                if (game && game.player) {
                    const dx = game.player.x - this.x;
                    const dy = game.player.y - this.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < CONSTANTS.PLASMA_DRONE_STAGE5.dischargeRadius) {
                        game.player.takeDamage(CONSTANTS.PLASMA_DRONE_STAGE5.damage);
                    }
                }

                if (this.game && this.game.audio) this.game.audio.playSe('SE_SHOT_LASER', { variation: 0.8, pitch: 2.0 });
            }
            return; // 演出待ち
        }

        this.active = false;
        this.deactivateReason = reason;
        this.destroyReason = reason;

        // 破壊エフェクト
        if (reason === 'damage' || reason === 'bullet' || reason === 'bomb' || reason === 'nuke' || reason === 'BULLET' || reason === 'BARRIER_DAMAGE' || reason === 'LIFETIME' || reason === 'DETONATE' || reason === 'DISCHARGE') {
            const isDischarge = (reason === 'DISCHARGE');
            const splashRadius = (this.isDrone) ? CONSTANTS.PLASMA_DRONE_STAGE5.dischargeRadius : (this.type === CONSTANTS.ENEMY_TYPES.BOSS ? 200 : 50);

            if (reason === 'DETONATE' || reason === 'DISCHARGE') {
                // 爆発/放電ヒット判定 (プレイヤーのみ)
                if (game && game.player) {
                    const dx = game.player.x - this.x;
                    const dy = game.player.y - this.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < splashRadius) {
                        const dmg = this.isDrone ? CONSTANTS.PLASMA_DRONE_STAGE5.damage : (CONSTANTS.MISSILE_STAGE5.damage || 1);
                        game.player.takeDamage(dmg);
                    }
                }
            }

            // 演出
            if (this.isDrone) {
                // ドローン専用：スパーク円
                // Stage 10 (ownerId === 9) は赤系、Stage 5 は青系 [FIX]
                const isStage10Drone = this.ownerId === 9;
                const droneDestroyColor = isStage10Drone ? '#ff5555' : '#00ffff';

                Effects.createExplosion(this.x, this.y, splashRadius * 0.8, droneDestroyColor);
                for (let i = 0; i < 15; i++) {
                    Effects.createSpark(this.x, this.y, droneDestroyColor);
                }
            } else {
                Effects.createExplosion(this.x, this.y, splashRadius, this.isBoss ? '#ffaa00' : '#ff5500');
                if (this.isBoss) {
                    for (let i = 0; i < 20; i++) {
                        Effects.createSpark(this.x, this.y, '#ffaa00');
                    }
                }
            }
        }

        // 破壊音
        if (this.game && this.game.audio) {
            const deathSound = (this.isBoss || this.type === CONSTANTS.ENEMY_TYPES.ELITE) ? 'SE_BREAK_SPECIAL' : 'SE_BREAK_NORMAL';
            this.game.audio.playSe(deathSound);
        }

        this.active = false;
        this.deactivateReason = reason;
        this.destroyReason = reason;

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
        if (reason !== 'glitch' && reason !== 'GLITCH' && reason !== 'return' && reason !== 'LIFETIME' && reason !== 'OOB' && !this.isDrone && !this.isRimLaser) {
            // GOLD (100% drop)
            // Stage1 = 0, Stage2 = 1 ...
            // Debug Stage (999) -> Level 0 (x1.0)
            const stage = (game.currentStage === CONSTANTS.STAGE_DEBUG) ? 1 : (game.currentStage ?? 1);
            const stageIndex = Math.max(0, stage - 1);
            const mult = Math.pow(CONSTANTS.ECON_GROWTH_BASE || 1.18, stageIndex);

            const baseG = CONSTANTS.ENEMY_GOLD[this.type] || 10;
            const finalG = Math.max(1, Math.round(baseG * mult));

            // Log if logger exists
            if (game.economyLogger) {
                game.economyLogger.recordKill({
                    stage: game.currentStage,
                    enemyType: this.type,
                    baseG: baseG,
                    mult: mult,
                    gainedG: finalG
                });
            }

            const g = game.goldPool.get();
            if (g) {
                g.init(this.renderX, this.renderY, finalG);
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
                const offsetAngle = (Math.PI * 2 / childrenCount) * i + Math.random();
                const dist = 30;
                const cx = this.x + Math.cos(offsetAngle) * dist;
                const cy = this.y + Math.sin(offsetAngle) * dist;

                game.spawnDirector.spawnEnemy({
                    type: CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD,
                    x: cx,
                    y: cy,
                    options: {
                        isMinion: true,
                        lifespan: 10.0,
                        hpMul: stageData.hpMul * 0.5,
                        speedMul: stageData.speedMul,
                        // Splatter effect
                        vx: Math.cos(offsetAngle) * 2.0, // Simplified speed boost
                        vy: Math.sin(offsetAngle) * 2.0
                    }
                });
            }
        }
    }

    updateBarrier(dt) {
        // GUARDIAN (全体バフ型) は従来通りのサイクル
        if (this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
            this.updateGuardianBarrier(dt);
            return;
        }

        // SHIELDER (設置型) ロジック
        const cfg = CONSTANTS.SHIELDER;
        if (this.barrierState === 'idle') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                this.barrierState = 'windup';
                this.barrierTimer = cfg.barrierWindupMs || 800;
            }
        } else if (this.barrierState === 'windup') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                // シールド設置！
                if (this.game && this.game.createShieldZone) {
                    this.game.createShieldZone(this.x, this.y);
                }

                // 自身はクールダウンへ
                this.barrierState = 'idle';
                this.barrierTimer = cfg.barrierCooldownMs || 3000;
            }
        }
    }

    updateGuardianBarrier(dt) {
        if (this.barrierState === 'idle') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                this.barrierState = 'active';
                const config = CONSTANTS.GUARDIAN;
                this.barrierTimer = (config.barrierDurationMs || 3000) * 1.5;
            }
        } else if (this.barrierState === 'active') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                this.barrierState = 'vulnerable';
                const config = CONSTANTS.GUARDIAN;
                this.barrierTimer = config.vulnerableMs || 2000;
            }
        } else if (this.barrierState === 'vulnerable') {
            this.barrierTimer -= dt;
            if (this.barrierTimer <= 0) {
                this.barrierState = 'idle';
                const config = CONSTANTS.GUARDIAN;
                this.barrierTimer = config.barrierCooldownMs || 3000;
            }
        }
    }
}
