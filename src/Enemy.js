import { CONSTANTS } from './constants.js';

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
    }

    init(x, y, targetX, targetY, type = CONSTANTS.ENEMY_TYPES.NORMAL, hpMul = 1.0, speedMul = 1.0) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.spawnTime = Date.now();
        this.isEvading = false;
        this.evasiveStartTime = 0;
        this.lastRetrackTime = Date.now();
        this.stageSpeedMul = speedMul;

        // タイプ別の基本速度倍率
        let typeSpeedMul = 1.0;
        if (type === CONSTANTS.ENEMY_TYPES.ELITE) typeSpeedMul = 0.8;
        else if (type === CONSTANTS.ENEMY_TYPES.ASSAULT) typeSpeedMul = 1.3;

        this.baseSpeed = CONSTANTS.ENEMY_BASE_SPEED * speedMul * typeSpeedMul;
        this.baseAngle = Math.atan2(targetY - y, targetX - x);
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

        this.hp = Math.round(1 * hpMul * eliteHpMul);
        this.maxHp = this.hp;
        this.lastContactTime = 0;
        this.knockVX = 0;
        this.knockVY = 0;
        this.isBoss = false;
        this.lastSummonTime = Date.now();
        this.onSummon = null;
    }

    initBoss(x, y, targetX, targetY, hpMul, onSummon) {
        this.init(x, y, targetX, targetY, CONSTANTS.ENEMY_TYPES.NORMAL, hpMul * CONSTANTS.BOSS_HP_MUL, CONSTANTS.BOSS_SPEED_MUL);
        this.isBoss = true;
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

    update(playerX, playerY, playerAngle, dt = 16.6) {
        const now = Date.now();
        const dtMod = dt / 16.6;

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

        // 2. 共通のリトラッキングロジック：中央を通り過ぎて離れていったら再帰還
        const distSq = dx * dx + dy * dy;
        const currentAngle = Math.atan2(this.vy, this.vx);
        const targetAngle = Math.atan2(dy, dx);

        // 現在の進行方向とターゲットへの方向の差
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        const dot = this.vx * dx + this.vy * dy;

        // 中央から離れていて（50px以上）、かつ遠ざかっている（内積が負）場合
        // 回避中(Type C)でないことを条件に旋回
        if (!this.isEvading && dot < 0 && distSq > 50 * 50) {
            // 徐々にターゲットへ向く（旋回性能: 毎フレーム約3度くらい）
            const turnSpeed = 0.05;
            if (Math.abs(angleDiff) > turnSpeed) {
                const newAngle = currentAngle + (angleDiff > 0 ? turnSpeed : -turnSpeed);
                this.vx = Math.cos(newAngle) * this.currentSpeed;
                this.vy = Math.sin(newAngle) * this.currentSpeed;
            } else {
                this.vx = Math.cos(targetAngle) * this.currentSpeed;
                this.vy = Math.sin(targetAngle) * this.currentSpeed;
            }
            // baseAngle（ジグザグの基準軸）も現在の速度方向に同期させる
            this.baseAngle = Math.atan2(this.vy, this.vx);
        } else {
            // 旋回しない場合も、現在の距離に応じた currentSpeed を現在のベクトルに適用し直す
            // INVADER の場合は radialVel を 80% に抑える
            const speedMul = (this.movementType === CONSTANTS.ENEMY_MOVEMENT_TYPES.INVADER) ? 0.8 : 1.0;
            const targetSpeed = this.currentSpeed * speedMul;

            const vMag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (vMag > 0) {
                this.vx = (this.vx / vMag) * targetSpeed;
                this.vy = (this.vy / vMag) * targetSpeed;
            }
        }

        // 移動の適用（通常移動 + ノックバック）
        this.x += (this.vx + this.knockVX) * dtMod;
        this.y += (this.vy + this.knockVY) * dtMod;

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
            if (!this.isEvading) {
                const angleToEnemy = Math.atan2(this.y - playerY, this.x - playerX);
                let diff = angleToEnemy - playerAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                if (Math.abs(diff) < CONSTANTS.EVASIVE_TRIGGER_ARC) {
                    this.isEvading = true;
                    this.evasiveStartTime = now;
                    const dodgeDir = diff > 0 ? 1 : -1;
                    const newAngle = Math.atan2(this.vy, this.vx) + CONSTANTS.EVASIVE_ANGLE * dodgeDir;
                    this.vx = Math.cos(newAngle) * this.currentSpeed;
                    this.vy = Math.sin(newAngle) * this.currentSpeed;
                }
            } else {
                if (now - this.evasiveStartTime > CONSTANTS.EVASIVE_DURATION_MS) {
                    this.isEvading = false;
                    this.vx = Math.cos(targetAngle) * this.currentSpeed;
                    this.vy = Math.sin(targetAngle) * this.currentSpeed;
                }
            }
            this.renderX = this.x;
            this.renderY = this.y;
        } else {
            // Type A: Normal
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
        ctx.beginPath();
        let size = this.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
        if (this.type === CONSTANTS.ENEMY_TYPES.ELITE) {
            size *= CONSTANTS.ELITE_SIZE_MUL;
        }
        // 矩形の中央が実効座標になるように
        ctx.rect(this.renderX - size, this.renderY - size, size * 2, size * 2);

        // タイプ別に色を変える（デバッグ・確認用）
        if (this.isBoss) ctx.fillStyle = '#ff0000'; // ボスは真紅
        else if (this.type === CONSTANTS.ENEMY_TYPES.ELITE) ctx.fillStyle = '#bb00ff'; // エリートは紫
        else if (this.type === CONSTANTS.ENEMY_TYPES.ZIGZAG) ctx.fillStyle = '#ff00ff'; // 紫（ジグザグ）
        else if (this.type === CONSTANTS.ENEMY_TYPES.EVASIVE) ctx.fillStyle = '#ff8800'; // オレンジ
        else ctx.fillStyle = '#ff4444'; // 赤

        ctx.fill();
        ctx.strokeStyle = '#fff';
        if (this.isBoss) {
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.lineWidth = 1;
        } else {
            ctx.stroke();
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
    }
}
