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
        this.oobFrames = 0; // Screen-space OOB counter
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

        // タイプ別の基本速度倍率
        let typeSpeedMul = 1.0;
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
            this.dashState = 'normal';
            this.dashTimer = Math.random() * (CONSTANTS.DASHER.dashCooldownMs || 2000);
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
        // デフォルト設定
        this.movementMode = 'DIRECT';
        this.turnRate = 0; // 0 = 無制限 (Instant Turn)
        this.orbitRadius = 0;

        switch (type) {
            case CONSTANTS.ENEMY_TYPES.NORMAL:
                this.movementMode = 'DIRECT';
                break;
            case CONSTANTS.ENEMY_TYPES.ZIGZAG:
            case 'ZIGZAG':
            case 'SPLITTER':
            case 'SPLITTER_CHILD':
                this.movementMode = 'ZIGZAG';
                this.zigzagFreq = (type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) ? 0.006 : 0.003;
                this.zigzagAmp = (type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) ? 30 : (type === CONSTANTS.ENEMY_TYPES.SPLITTER ? 40 : 50);
                break;
            case CONSTANTS.ENEMY_TYPES.EVASIVE: // User: ASSAULT
            case CONSTANTS.ENEMY_TYPES.ASSAULT:
                this.movementMode = 'ASSAULT';
                this.turnRate = 0.08;
                break;
            case CONSTANTS.ENEMY_TYPES.SHIELDER:
            case CONSTANTS.ENEMY_TYPES.GUARDIAN:
            case CONSTANTS.ENEMY_TYPES.ELITE:
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
                break;
            case CONSTANTS.ENEMY_TYPES.FLANKER:
                this.movementMode = 'FLANK';
                this.turnRate = 0.06;
                this.orbitRadius = 220;
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

        // 1. 速度計算 (距離減衰 & バフ)
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSq = dx * dx + dy * dy;

        this.updateSpeed(dist, options);

        // 2. 移動ロジック (Movement Mode Switch)
        this.updateMovement(dtMod, playerX, playerY, dist, now, playerAngle);

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

        // ボス召喚
        if (this.isBoss && this.onSummon) {
            const hpPercent = this.hp / this.maxHp;
            const interval = hpPercent <= 0.5 ? CONSTANTS.BOSS_SUMMON_INTERVAL_ENRAGED_MS : CONSTANTS.BOSS_SUMMON_INTERVAL_NORMAL_MS;
            if (now - this.lastSummonTime > interval) {
                this.onSummon(this.x, this.y);
                this.lastSummonTime = now;
            }
        }

        // 画面外チェック (main.js 側で統一管理するため不要)
        // this.checkBounds();
    }

    updateSpeed(dist, options) {
        let speedRatio = 1.0;
        // 至近距離での減速
        if (dist < CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS) {
            const t = Math.max(0, dist / CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS);
            speedRatio = CONSTANTS.ENEMY_MIN_SPEED_RATIO + (1.0 - CONSTANTS.ENEMY_MIN_SPEED_RATIO) * t;
        }
        this.currentSpeed = this.baseSpeed * speedRatio;

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

    updateMovement(dtMod, px, py, dist, now, playerAngle) {
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

            case 'ZIGZAG':
                // 物理的な揺動 (SSOT: 描画と当たり判定の一致)
                this.angle = targetAngle;

                const elapsedZ = now - this.spawnTime;
                const freqZ = this.zigzagFreq || 0.005;
                const ampZ = this.zigzagAmp || 80;

                // 揺動速度 (v = A * omega * cos(omega * t))
                // pixels per frame (16.6ms) ベース
                const oscVelZ = ampZ * freqZ * Math.cos(elapsedZ * freqZ) * 16.6;

                const perpZ = this.angle + Math.PI / 2;
                this.vx = Math.cos(this.angle) * this.currentSpeed + Math.cos(perpZ) * oscVelZ;
                this.vy = Math.sin(this.angle) * this.currentSpeed + Math.sin(perpZ) * oscVelZ;
                break;

            case 'HOVER':
            case 'ORBIT':
                // 周回・維持挙動
                this.orbitAngle += (this.type === CONSTANTS.ENEMY_TYPES.ORBITER ? 0.02 : 0.01) * dtMod;

                let targetDist = this.orbitRadius || 200;
                // 距離維持補正
                if (dist < targetDist - 50) targetDist += 50; // 近すぎたら離れる目標
                if (dist > targetDist + 50) targetDist -= 50; // 遠すぎたら近づく目標

                const tx = px + Math.cos(this.orbitAngle) * targetDist;
                const ty = py + Math.sin(this.orbitAngle) * targetDist;

                const hoverAngle = Math.atan2(ty - this.y, tx - this.x);
                this.turnTowards(hoverAngle, (this.turnRate || 0.03) * dtMod);

                this.vx = Math.cos(this.angle) * this.currentSpeed;
                this.vy = Math.sin(this.angle) * this.currentSpeed;
                break;

            case 'FLANK':
                // 背後に回り込む (Spiral Inward logic)
                // ターゲット：プレイヤーの背後 (backDist離れた位置)
                const flankConfig = CONSTANTS.FLANKER || {};
                const backDist = flankConfig.backDist || 180;

                // プレイヤーの向きを取得 (Player classがないため、Playerの移動情報が必要だが、
                // ここでは簡易的に「プレイヤーから見て現在位置の反対側」ではなく、
                // 「プレイヤーの現在進行方向の逆」や「ランダムな背後」などが理想。
                // 引数の playerAngle (マウス方向) を利用する。
                const pRotation = playerAngle; // Mouse direction
                const targetsBackAngle = pRotation + Math.PI;

                // 目標地点
                const txFlank = px + Math.cos(targetsBackAngle) * backDist;
                const tyFlank = py + Math.sin(targetsBackAngle) * backDist;

                const angleToFlank = Math.atan2(tyFlank - this.y, txFlank - this.x);

                // 旋回制限付きで目標へ
                this.turnTowards(angleToFlank, (this.turnRate || 0.06) * dtMod);

                // 速度適用
                let flankSpeed = this.currentSpeed;
                // 目標に近づきすぎたら減速
                const dFlank = Math.sqrt(Math.pow(txFlank - this.x, 2) + Math.pow(tyFlank - this.y, 2));
                if (dFlank < 50) flankSpeed *= 0.5;

                this.vx = Math.cos(this.angle) * flankSpeed;
                this.vy = Math.sin(this.angle) * flankSpeed;
                break;

            case 'DASH':
                // DASHER Logic
                if (this.dashState === 'dash') {
                    // 直進
                    // 突進中は angle 更新しない
                    this.vx = Math.cos(this.angle) * this.currentSpeed * (CONSTANTS.DASHER.dashSpeedMultiplier || 3.0);
                    this.vy = Math.sin(this.angle) * this.currentSpeed * (CONSTANTS.DASHER.dashSpeedMultiplier || 3.0);
                } else {
                    // 回避/様子見 (-PI/2 or +PI/2 slide)
                    // 常に横滑り
                    const slideTarget = targetAngle + Math.PI / 2;
                    this.turnTowards(slideTarget, 0.1 * dtMod);
                    this.vx = Math.cos(this.angle) * this.currentSpeed * 0.5;
                    this.vy = Math.sin(this.angle) * this.currentSpeed * 0.5;
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
                // 正面を向きつつ横移動 (Strafe)
                // 常にPlayerを向く
                this.angle = targetAngle;

                // 横移動
                const strafePhase = now * 0.002;
                const strafeDir = Math.sin(strafePhase) > 0 ? 1 : -1;
                const strafeAngle = targetAngle + (Math.PI / 2) * strafeDir;

                this.vx = Math.cos(strafeAngle) * this.currentSpeed * 0.5; // 少し遅く
                this.vy = Math.sin(strafeAngle) * this.currentSpeed * 0.5;

                // 距離が遠ければ近づく成分も足す
                if (dist > (this.orbitRadius || 200)) {
                    this.vx += Math.cos(targetAngle) * this.currentSpeed * 0.5;
                    this.vy += Math.sin(targetAngle) * this.currentSpeed * 0.5;
                }
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

            // REFLECTOR の金縁風エフェクト
            if (this.type === CONSTANTS.ENEMY_TYPES.REFLECTOR) {
                ctx.strokeStyle = "#ffd700";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, size / 2.2, 0, Math.PI * 2);
                ctx.stroke();
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

        // シールダー・ガーディアンのバリア/弱点演出
        if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER || this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
            const size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
            if (this.barrierState === 'windup') {
                // 予兆: 点滅
                if (Math.floor(Date.now() / 50) % 2 === 0) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2); // 簡易的な点滅枠
                    ctx.stroke();
                }
            } else if (this.barrierState === 'active') {
                // バリア中
                if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER) {
                    // オーラ型: 円形防壁
                    ctx.beginPath();
                    ctx.arc(0, 0, CONSTANTS.SHIELDER.auraRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
                    ctx.fill();

                    // 足元のコア
                    ctx.beginPath();
                    ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
                    // ボスは少し大きく脈動
                    const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;
                    if (this.isBoss) ctx.scale(pulseScale, pulseScale);
                }
            }
        }

        // バリア状態の描画 (Shielder/Guardian)
        if (this.barrierState === 'active') {
            this.drawBarrier(ctx);
        }

        // パルスヒット時のアウトライン
        if (this.pulseOutlineTimer > 0) {
            ctx.strokeStyle = `rgba(255, 128, 0, ${this.pulseOutlineTimer / 200})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            const r = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
            ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 全体バフのエフェクト (Guardian/Observer)
        if (this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && this.barrierState === 'active') {
            ctx.strokeStyle = `rgba(0, 255, 100, 0.3)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, CONSTANTS.GUARDIAN.buffRadius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 本体描画終了 (回転を解除)
        ctx.restore();

        // BARRIER_PAIR のバリア線描画 (非回転コンテキストで実行: ワールド座標同期)
        if (this.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && this.partner && this.partner.active &&
            this.partner.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && this.partner.partner === this) {
            if (this.id < this.partner.id) {
                ctx.save();
                ctx.strokeStyle = "rgba(0, 255, 255, 0.6)"; // 透明度アップ
                ctx.lineWidth = CONSTANTS.BARRIER_PAIR.barrierWidth || 6;
                ctx.setLineDash([12, 6]); // よりはっきりした破線
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00ffff";
                ctx.beginPath();
                ctx.moveTo(0, 0); // translating to (this.renderX, this.renderY)
                ctx.lineTo(this.partner.x - this.x, this.partner.y - this.y);
                ctx.stroke();
                ctx.restore();
            }
        }

        // HPバー
        // ボスは画面上部に別枠表示するので頭上には出さない
        if (!this.isBoss && this.hp < this.maxHp) {
            const barW = 40;
            const barH = 4;
            const yOff = -CONSTANTS.ENEMY_SIZE - 10;
            ctx.fillStyle = '#444';
            ctx.fillRect(-barW / 2, yOff, barW, barH);
            ctx.fillStyle = '#f00';
            ctx.fillRect(-barW / 2, yOff, barW * (this.hp / this.maxHp), barH);
        }

        ctx.restore();
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
            if (game.debugEnabled) {
                // console.log(`[ENEMY KILLED] id:${this.id} type:${this.type} totalKills:${game.totalKills}`);
            }
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
    }
}
