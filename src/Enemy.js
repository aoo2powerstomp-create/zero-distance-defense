import { CONSTANTS } from './constants.js';
import { Effects } from './Effects.js';

export class Enemy {
    constructor() {
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

        // ボス用の安全装置（DPSキャップ）
        this.damageInCurrentSecond = 0;
        this.lastDamageResetTime = 0;

        // シールダー用の状態
        this.barrierState = 'idle'; // 'idle', 'windup', 'active', 'vulnerable'
        this.barrierTimer = 0;
        this.orbitAngle = 0;
    }

    init(x, y, targetX, targetY, type = CONSTANTS.ENEMY_TYPES.NORMAL, hpMul = 1.0, speedMul = 1.0, affinity = CONSTANTS.ENEMY_AFFINITIES.SWARM) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.affinity = affinity;
        this.spawnTime = Date.now();
        this.isEvading = false;
        this.evasiveStartTime = 0;
        this.lastRetrackTime = Date.now();
        this.stageSpeedMul = speedMul;

        // タイプ別の基本速度倍率
        let typeSpeedMul = 1.0;
        if (type === CONSTANTS.ENEMY_TYPES.ELITE) typeSpeedMul = 0.8;
        else if (type === CONSTANTS.ENEMY_TYPES.ASSAULT) typeSpeedMul = 1.3;
        else if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) typeSpeedMul = 1.0;
        else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) typeSpeedMul = 1.0;
        else if (type === CONSTANTS.ENEMY_TYPES.DASHER) typeSpeedMul = 1.0;
        else if (type === CONSTANTS.ENEMY_TYPES.ORBITER) typeSpeedMul = 1.0;
        else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER) typeSpeedMul = 1.0;
        else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD) typeSpeedMul = CONSTANTS.SPLITTER_CHILD.speedMultiplier;

        this.baseSpeed = CONSTANTS.ENEMY_BASE_SPEED * speedMul * typeSpeedMul;
        this.baseAngle = Math.atan2(targetY - y, targetX - x);

        // シールダー・ガーディアン・オービターの初期角度設定
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER || type === CONSTANTS.ENEMY_TYPES.GUARDIAN || type === CONSTANTS.ENEMY_TYPES.ORBITER) {
            const config = type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER :
                (type === CONSTANTS.ENEMY_TYPES.ORBITER ? CONSTANTS.ORBITER : CONSTANTS.GUARDIAN);
            this.orbitAngle = Math.atan2(y - targetY, x - targetX);
            this.barrierState = 'idle';
            this.barrierTimer = Math.random() * (config.barrierCooldownMs || 0);
        }

        // DASHERの初期化
        if (type === CONSTANTS.ENEMY_TYPES.DASHER) {
            this.dashState = 'normal';
            this.dashTimer = Math.random() * CONSTANTS.DASHER.dashCooldownMs;
        }
        this.vx = Math.cos(this.baseAngle) * this.baseSpeed;
        this.vy = Math.sin(this.baseAngle) * this.baseSpeed;
        this.currentSpeed = this.baseSpeed;

        this.movementType = CONSTANTS.ENEMY_MOVEMENT_TYPES.STRAIGHT;
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
        this.startY = y;
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
            CONSTANTS.ENEMY_TYPES.ZIGZAG
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
        // ボス・エリート耐性の適用
        let actualPower = power;
        if (this.isBoss) {
            actualPower *= (1.0 - CONSTANTS.BOSS_KB_RESIST);
        } else if (this.type === CONSTANTS.ENEMY_TYPES.ELITE) {
            actualPower *= (1.0 - CONSTANTS.ELITE_KB_RESIST);
        }

        // 属性耐性（ARMOREDはKB耐性あり）
        if (this.affinity === CONSTANTS.ENEMY_AFFINITIES.ARMORED) {
            actualPower *= 0.7; // 30%軽減
        }

        // 弾の進行方向ベクトルを正規化してパワーを掛ける
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > 0) {
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

    update(playerX, playerY, playerAngle, dt = 16.6, options = {}) {
        const now = Date.now();
        const dtMod = dt / 16.6;

        // アイテム効果 (FREEZE) によるスロウ
        const freezeMul = options.isFrozen ? (CONSTANTS.ITEM_CONFIG.freezeSpeedMultiplier || 0.2) : 1.0;
        const effectiveDtMod = dtMod * freezeMul;

        if (this.type === CONSTANTS.ENEMY_TYPES.OBSERVER) {
            this.updateObserver(playerX, playerY, dt); // ここは dt をそのまま渡す（SNAP速度維持）
            this.x += this.knockVX * effectiveDtMod;
            this.y += this.knockVY * effectiveDtMod;
            const damp = Math.pow(CONSTANTS.ENEMY_KNOCKBACK_DAMP, dtMod);
            this.knockVX *= damp;
            this.knockVY *= damp;
            return;
        }

        // 1. 距離依存の速度減衰計算
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let speedRatio = 1.0;
        if (dist < CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS) {
            const t = Math.max(0, dist / CONSTANTS.ENEMY_SPEED_ADJUST_RADIUS);
            // 線形補間: 0.6 + (1.0 - 0.6) * t
            speedRatio = CONSTANTS.ENEMY_MIN_SPEED_RATIO + (1.0 - CONSTANTS.ENEMY_MIN_SPEED_RATIO) * t;
        }
        this.currentSpeed = this.baseSpeed * speedRatio;

        // 全体バフフラグの保持（描画用）
        this.hasGuardBuff = options.globalGuardBuffActive || false;
        this.hasMarkBuff = options.globalMarkActive || false;

        // 全体バフによる速度強化（多重禁止: 強い方を優先）
        if (this.hasGuardBuff) {
            this.currentSpeed *= (CONSTANTS.GUARDIAN.globalBuffSpeedMultiplier || 1.2);
        } else if (this.hasMarkBuff) {
            this.currentSpeed *= (CONSTANTS.OBSERVER.globalBuffSpeedMul || 1.1);
        }

        // 2. 共通のリトラッキングロジック
        const distSq = dx * dx + dy * dy;
        const currentAngle = Math.atan2(this.vy, this.vx);
        const targetAngle = Math.atan2(dy, dx);

        // --- DASHER 状態更新 ---
        if (this.type === CONSTANTS.ENEMY_TYPES.DASHER) {
            const config = CONSTANTS.DASHER;
            this.dashTimer += dt;
            if (this.dashState === 'normal' && this.dashTimer >= config.dashCooldownMs) {
                this.dashState = 'windup';
                this.dashTimer = 0;
                this.vx = 0; this.vy = 0;
            } else if (this.dashState === 'windup' && this.dashTimer >= config.windupMs) {
                this.dashState = 'dash';
                this.dashTimer = 0;
                // 突進方向を決定
                this.vx = Math.cos(targetAngle);
                this.vy = Math.sin(targetAngle);
            } else if (this.dashState === 'dash' && this.dashTimer >= config.dashDurationMs) {
                this.dashState = 'normal';
                this.dashTimer = 0;
            }
        }

        // 現在の進行方向とターゲットへの方向の差
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        const dot = this.vx * dx + this.vy * dy;

        // 旋回・速度計算の分岐
        let targetSpeed = this.currentSpeed;
        let skipCommonLogic = false;

        if (this.type === CONSTANTS.ENEMY_TYPES.DASHER) {
            if (this.dashState === 'windup') {
                targetSpeed = 0;
                skipCommonLogic = true;
            } else if (this.dashState === 'dash') {
                targetSpeed = this.baseSpeed * CONSTANTS.DASHER.dashSpeedMultiplier;
                skipCommonLogic = true;
            }
        } else if (this.isEvading) {
            skipCommonLogic = true;
        }

        if (!skipCommonLogic && dot < 0 && distSq > 50 * 50) {
            // 徐々にターゲットへ向くる旋回ロジック
            const turnSpeed = 0.05;
            if (Math.abs(angleDiff) > turnSpeed) {
                const newAngle = currentAngle + (angleDiff > 0 ? turnSpeed : -turnSpeed);
                this.vx = Math.cos(newAngle) * targetSpeed;
                this.vy = Math.sin(newAngle) * targetSpeed;
            } else {
                this.vx = Math.cos(targetAngle) * targetSpeed;
                this.vy = Math.sin(targetAngle) * targetSpeed;
            }
            this.baseAngle = Math.atan2(this.vy, this.vx);
        } else {
            // 旋回しない場合（または特殊状態）もベクトルを目標速度に合わせる
            const speedMul = (this.movementType === CONSTANTS.ENEMY_MOVEMENT_TYPES.INVADER) ? 0.8 : 1.0;
            const finalTargetSpeed = targetSpeed * speedMul;

            const vMag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (vMag > 0) {
                this.vx = (this.vx / vMag) * finalTargetSpeed;
                this.vy = (this.vy / vMag) * finalTargetSpeed;
            }
        }

        // EVASIVE の回避クールタイム更新
        if (this.evasionTimer > 0) this.evasionTimer -= dt;

        // パルスアウトラインの更新
        if (this.pulseOutlineTimer > 0) {
            this.pulseOutlineTimer = Math.max(0, this.pulseOutlineTimer - dt);
        }

        // 進行方向の角度更新 (hasDirection が有効な場合のみ)
        if (this.hasDirection) {
            // 基本の向きを計算 (リクエスト要件: -Y方向が正面の画像を vx, vy に向ける)
            const rawAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;

            // 8方向量子化 (45度刻み)
            const step = Math.PI / 4;
            this.angle = Math.round(rawAngle / step) * step;
        }

        // 移動の適用（通常移動は freezeMul の影響を受ける）
        this.x += (this.vx * freezeMul + this.knockVX) * dtMod;
        this.y += (this.vy * freezeMul + this.knockVY) * dtMod;

        // ノックバックの減衰
        const damp = Math.pow(CONSTANTS.ENEMY_KNOCKBACK_DAMP, dtMod);
        this.knockVX *= damp;
        this.knockVY *= damp;

        if (Math.abs(this.knockVX) < 0.05) this.knockVX = 0;
        if (Math.abs(this.knockVY) < 0.05) this.knockVY = 0;

        // タイプ別の特殊挙動と描画座標の決定
        if (this.type === CONSTANTS.ENEMY_TYPES.ZIGZAG) {
            // Type B: ジグザグ
            const elapsed = now - this.spawnTime;
            const offset = Math.sin(elapsed * CONSTANTS.ZIGZAG_FREQ) * CONSTANTS.ZIGZAG_AMP;

            // 進行方向に対して常に垂直な方向へオフセットをかける
            const perpAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
            const ox = Math.cos(perpAngle) * offset;
            const oy = Math.sin(perpAngle) * offset;

            this.renderX = this.x + ox;
            this.renderY = this.y + oy;
        } else if (this.movementType === CONSTANTS.ENEMY_MOVEMENT_TYPES.INVADER) {
            // Type Invader: インベーダー（接線スライド）
            const elapsed = now - this.spawnTime;
            const offset = Math.sin(elapsed * CONSTANTS.INVADER_STRAFE_FREQ + this.movementPhase) * CONSTANTS.INVADER_STRAFE_AMP;

            // 進行方向（放射状）に対して垂直な方向へオフセットをかける
            // 接近に伴い減衰させたい場合はここに dist 係数をかけても良いが、まずは固定
            const perpAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
            const ox = Math.cos(perpAngle) * offset;
            const oy = Math.sin(perpAngle) * offset;

            this.renderX = this.x + ox;
            this.renderY = this.y + oy;
        } else if (this.type === CONSTANTS.ENEMY_TYPES.EVASIVE) {
            // Type C: 回避
            if (this.evasionTimer <= 0) {
                const evadeThreshold = 80;
                const playerToEnemyX = this.x - playerX;
                const playerToEnemyY = this.y - playerY;
                const mouseToEnemyX = playerX + Math.cos(playerAngle) * 200 - this.x;
                const mouseToEnemyY = playerY + Math.sin(playerAngle) * 200 - this.y;
                const mouseToEnemyDist = Math.sqrt(mouseToEnemyX * mouseToEnemyX + mouseToEnemyY * mouseToEnemyY);

                if (mouseToEnemyDist < evadeThreshold) {
                    this.isEvading = true;
                    this.evasionTimer = CONSTANTS.EVASIVE_COOLDOWN_MS;
                    const perpX = -Math.sin(playerAngle);
                    const perpY = Math.cos(playerAngle);
                    const side = (playerToEnemyX * perpX + playerToEnemyY * perpY) > 0 ? 1 : -1;
                    const evadeDirX = perpX * side;
                    const evadeDirY = perpY * side;
                    this.vx = evadeDirX * this.currentSpeed * 2.5;
                    this.vy = evadeDirY * this.currentSpeed * 2.5;
                    this.evadeTime = 15;
                }
            }
            if (this.evadeTime > 0) {
                this.evadeTime--;
                if (this.evadeTime <= 0) this.isEvading = false;
            }
            this.renderX = this.x;
            this.renderY = this.y;
        } else if (this.type === CONSTANTS.ENEMY_TYPES.SHIELDER || this.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
            // シールダー/ガーディアンの特殊行動
            const config = this.type === CONSTANTS.ENEMY_TYPES.SHIELDER ? CONSTANTS.SHIELDER : CONSTANTS.GUARDIAN;

            // 1. 状態管理（バリアサイクル）
            this.barrierTimer += dt;
            if (this.barrierState === 'idle' && this.barrierTimer >= config.barrierCooldownMs) {
                this.barrierState = 'windup';
                this.barrierTimer = 0;
            } else if (this.barrierState === 'windup' && this.barrierTimer >= config.barrierWindupMs) {
                this.barrierState = 'active';
                this.barrierTimer = 0;
            } else if (this.barrierState === 'active' && this.barrierTimer >= config.barrierDurationMs) {
                this.barrierState = 'vulnerable';
                this.barrierTimer = 0;
            } else if (this.barrierState === 'vulnerable' && this.barrierTimer >= config.vulnerableMs) {
                this.barrierState = 'idle';
                this.barrierTimer = 0;
            }

            // 2. 移動ロジック（旋回 + 距離維持）
            // 弱点露出中は速度低下
            let moveSpeed = this.baseSpeed;
            if (this.barrierState === 'vulnerable') {
                moveSpeed *= config.speedMultiplierWhileVulnerable;
            }

            // 円運動（orbit）
            this.orbitAngle += config.orbitAngularSpeed * dtMod;

            // 目標座標の計算（ orbitRadius を維持しつつ、現在の orbitAngle の位置へ）
            let targetDist = config.orbitRadius;
            let speedBoost = 1.0;

            if (dist < config.orbitRadiusMin) {
                // 近すぎる -> 離れる
                targetDist = config.orbitRadiusMax;
                speedBoost = config.retreatBoost;
            } else if (dist > config.orbitRadiusMax) {
                // 遠すぎる -> 近づく
                targetDist = config.orbitRadiusMin;
                speedBoost = config.approachBoost;
            }

            const targetOrbitX = playerX + Math.cos(this.orbitAngle) * targetDist;
            const targetOrbitY = playerY + Math.sin(this.orbitAngle) * targetDist;

            // 目標点へ向かうベクトル
            const odx = targetOrbitX - this.x;
            const ody = targetOrbitY - this.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);

            if (oDist > 0) {
                this.vx = (odx / oDist) * moveSpeed * speedBoost;
                this.vy = (ody / oDist) * moveSpeed * speedBoost;
            }

            this.renderX = this.x;
            this.renderY = this.y;
        } else if (this.type === CONSTANTS.ENEMY_TYPES.DASHER) {
            // 行動更新は上流で完了済み
            this.renderX = this.x;
            this.renderY = this.y;
        } else if (this.type === CONSTANTS.ENEMY_TYPES.ORBITER) {
            // Type ORBITER: 旋回（SHIELDERの移動ロジック流用）
            const config = CONSTANTS.ORBITER;
            this.orbitAngle += config.orbitAngularSpeed * dtMod;

            let targetDist = config.orbitRadius;
            if (dist < config.orbitRadiusMin) targetDist = config.orbitRadiusMax;
            else if (dist > config.orbitRadiusMax) targetDist = config.orbitRadiusMin;

            const tx = playerX + Math.cos(this.orbitAngle) * targetDist;
            const ty = playerY + Math.sin(this.orbitAngle) * targetDist;
            const odx = tx - this.x;
            const ody = ty - this.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);

            if (oDist > 0) {
                this.vx = (odx / oDist) * this.currentSpeed;
                this.vy = (ody / oDist) * this.currentSpeed;
            }
            this.renderX = this.x;
            this.renderY = this.y;
        } else {
            // Type A: Normal / SPLITTER等
            this.renderX = this.x;
            this.renderY = this.y;
        }

        // ボスの召喚ロジック
        if (this.isBoss && this.onSummon) {
            const hpPercent = this.hp / this.maxHp;
            const interval = hpPercent <= 0.5 ? CONSTANTS.BOSS_SUMMON_INTERVAL_ENRAGED_MS : CONSTANTS.BOSS_SUMMON_INTERVAL_NORMAL_MS;

            if (now - this.lastSummonTime > interval) {
                this.onSummon(this.x, this.y);
                this.lastSummonTime = now;
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.renderX, this.renderY);

        // 進行方向への回転適用 (本体のみに適用するため save)
        ctx.save();
        if (this.hasDirection) {
            ctx.rotate(this.angle);
        }

        let assetKey = null;
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
        }
        if (this.isBoss) {
            const stageNum = (this.game) ? this.game.currentStage + 1 : 1;
            assetKey = (stageNum <= 5) ? 'ENEMY_BOSS_5' : 'ENEMY_BOSS_10';
        }

        const asset = (this.game && this.game.assetLoader) ? this.game.assetLoader.get(assetKey) : null;

        if (asset) {
            // アセットがある場合：スプライト描画
            const size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL * 2.5 : CONSTANTS.ENEMY_SIZE * 2.5;
            ctx.drawImage(asset, -size / 2, -size / 2, size, size);

            // パルス時のアウトライン (画像の場合は矩形枠を表示)
            if (this.pulseOutlineTimer > 0) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.rect(-size / 2, -size / 2, size, size);
                ctx.stroke();
            }
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
                    this.drawShape(ctx, 6, '#00ffff');
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

    drawShape(ctx, sides, color) {
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

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
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

    destroy(reason, game) {
        if (!this.active) return;

        // ゴールドのドロップ
        const gold = game.goldPool.get();
        if (gold) {
            gold.init(this.renderX, this.renderY);
            game.golds.push(gold);
        }

        game.totalKills++;
        game.killCount++; // パーウェーブのキル数をカウント
        this.active = false;

        if (game.audio) {
            game.audio.play('explosion', { variation: 0.1 });
        }

        // 撃破カウントの減少は行わない（enemiesRemainingは未スポーン数を表すため）
        // if (game.enemiesRemaining > 0) {
        //     game.enemiesRemaining--;
        // }

        if (this.isBoss) {
            // 衝突判定ループ内での急激な状態変化（配列クリア等）を避けるため、次フレームまで遅延させる
            setTimeout(() => {
                game.stageClear();
            }, 0);
            return;
        }

        // SPLITTER の分裂処理 (バリア即死時は分裂しない)
        if (reason !== 'barrier' && this.type === CONSTANTS.ENEMY_TYPES.SPLITTER && this.generation === 0) {
            const stageData = CONSTANTS.STAGE_DATA[game.currentStage];
            for (let k = 0; k < CONSTANTS.SPLITTER.splitCount; k++) {
                const child = game.enemyPool.get();
                if (child) {
                    const ox = (Math.random() - 0.5) * 20;
                    const oy = (Math.random() - 0.5) * 20;
                    child.init(this.x + ox, this.y + oy, game.player.x, game.player.y,
                        CONSTANTS.ENEMY_TYPES.SPLITTER_CHILD,
                        stageData.hpMul, stageData.speedMul, this.affinity);
                    child.generation = 1;
                    game.enemies.push(child);
                }
            }
        }

        // ドロップアイテムの抽選
        if (game.itemManager) {
            game.itemManager.spawnDrop(this.renderX, this.renderY, this.type, game);
        }
    }
}
