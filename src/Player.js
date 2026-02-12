import { CONSTANTS } from './constants.js';

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.hp = CONSTANTS.PLAYER_MAX_HP;
        this.angle = 0;
        this.rotationDir = 1; // 1: clockwise, -1: counter-clockwise
        this.isStopped = false;
        this.lastDamageTime = 0;
        this.shootTimer = 0;

        // 武器システム
        this.currentWeapon = CONSTANTS.WEAPON_TYPES.STANDARD;
        this.weapons = {
            standard: { unlocked: true, level: 1, atkSpeedLv: 1 },
            shot: { unlocked: false, level: 1, atkSpeedLv: 1 },
            pierce: { unlocked: false, level: 1, atkSpeedLv: 1 }
        };

        // 半追随照準用のターゲット
        this.targetX = x;
        this.targetY = y;
    }

    getWeaponConfig() {
        return CONSTANTS.WEAPON_CONFIG[this.currentWeapon];
    }

    getWeaponLevel() {
        return this.weapons[this.currentWeapon].level;
    }

    getAtkSpeedLevel() {
        return this.weapons[this.currentWeapon].atkSpeedLv;
    }

    getRotationSpeed() {
        // 旋回速度（固定に変更）
        return CONSTANTS.PLAYER_BASE_ROTATION_SPEED;
    }

    // 弾速・ダメージ計算用の補正値を返す
    getWeaponStats() {
        const config = this.getWeaponConfig();
        const weaponData = this.weapons[this.currentWeapon];
        const level = weaponData.level;
        const atkSpeedLv = weaponData.atkSpeedLv;
        const growth = CONSTANTS.WEAPON_GROWTH[this.currentWeapon];

        // 攻撃力: base * (scale ^ (lv-1))
        const damage = config.baseDamage * Math.pow(config.damageScale, level - 1);
        const speed = CONSTANTS.BULLET_SPEED * config.speedScale;

        // 貫通数
        let pierce = config.pierceBase;
        if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.PIERCE) {
            pierce = 2 + Math.floor((level - 1) * 4 / 9); // Lv1=2, Lv10=6相当
            // LASER Lv11-30 でさらに微増
            if (level > 10) pierce += Math.floor((level - 10) / 5);
        } else if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.STANDARD) {
            pierce = config.pierceBase + Math.floor(level / 3);
            // RIFLE (STANDARD) Lv11-15 で貫通 +1
            if (level >= 15) pierce += growth.PIERCE_EXTRA;
        } else {
            pierce = config.pierceBase + Math.floor(level / 3);
        }

        // 連射速度（クールタイム）
        const baseCooldown = config.baseCooldown || CONSTANTS.BULLET_COOLDOWN_MS;
        const cooldown = baseCooldown * Math.pow(0.85, atkSpeedLv - 1);

        // 寿命: base * scale
        let lifeScale = config.lifeScale || 1.0;
        if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.PIERCE && level > 10) {
            const t = (level - 10) / 20;
            lifeScale *= (1 + (growth.LIFE_MUL_MAX - 1) * t);
        }
        const lifetime = CONSTANTS.BULLET_LIFETIME_MS * lifeScale;

        // 特殊ステータス (Lv11-30)
        let bulletWidth = 1.0;
        let bulletHeight = 1.0;
        let hitWidth = 1.0;
        let shotAngle = 0.2;
        let knockMul = config.knockMul || 1.0;

        if (level > 10) {
            const t = (level - 10) / 20; // 0 to 1

            if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.SHOT) {
                shotAngle = 0.2 + (growth.ANGLE_MAX - 0.2) * t;
                bulletWidth = bulletHeight = 1 + (growth.SIZE_MUL_MAX - 1) * t;
                hitWidth = 1 + (growth.HIT_MUL_MAX - 1) * t;
                knockMul *= (1 + (growth.KNOCK_MUL_EXTRA - 1) * t);
            } else if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.STANDARD) {
                bulletWidth = 1 + (growth.WIDTH_MUL_MAX - 1) * t;
                hitWidth = 1 + (growth.HIT_WIDTH_MAX - 1) * t;
                // 見た目を細長くする
                bulletHeight = 1.5;
            } else if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.PIERCE) {
                bulletWidth = 1 + (growth.WIDTH_MUL_MAX - 1) * t;
                hitWidth = bulletWidth; // LASERは基本同一
            }
        }

        return {
            damage, speed, pierce, cooldown, lifetime,
            bulletWidth, bulletHeight, hitWidth, shotAngle, knockMul
        };
    }

    reverse() {
        this.rotationDir *= -1;
    }

    toggleStop() {
        this.isStopped = !this.isStopped;
    }

    takeDamage(ratio) {
        const damage = CONSTANTS.PLAYER_MAX_HP * ratio;
        this.hp = Math.max(0, this.hp - damage);
        this.lastDamageTime = Date.now();
    }

    update(dt) {
        // ターゲット角度の取得 (Math.atan2 は -PI..PI)
        const targetAngle = Math.atan2(this.targetY - this.y, this.targetX - this.x);

        // 角度差を -PI..PI の範囲で求める
        let diff = targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        // 1. 基本の回転
        if (!this.isStopped) {
            const rotationSpeed = this.getRotationSpeed();
            // ズレが小さいときは基本の回転を二乗減衰（ピッタリ合わせるため）
            const dampeningThreshold = 1.0;
            const ratio = Math.min(1, Math.abs(diff) / dampeningThreshold);
            const rotationFactor = ratio * ratio;
            this.angle += rotationSpeed * this.rotationDir * rotationFactor * (dt / 16.6);
        }

        // 2. マウス/ポインタ位置への半追随補正
        // 180度反対付近で振動（ハンチング）しないよう、1フレームの最大回転量を制限する
        const pullAmount = diff * CONSTANTS.PLAYER_FOLLOW_STRENGTH * (dt / 1000);
        const maxPullPerFrame = 0.15; // 1フレームあたり約8.5度を上限に (60fps想定)
        const clampedPull = Math.max(-maxPullPerFrame, Math.min(maxPullPerFrame, pullAmount));

        this.angle += clampedPull;

        // 角度の正規化
        this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        // 自動回復
        const now = Date.now();
        if (now - this.lastDamageTime > CONSTANTS.PLAYER_REGEN_STOP_MS) {
            const regen = CONSTANTS.PLAYER_MAX_HP * CONSTANTS.PLAYER_REGEN_PER_SEC * (dt / 1000);
            this.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.hp + regen);
        }
    }

    draw(ctx) {
        this.drawBarrier(ctx);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // 自機 (円と向きを示す線)
        ctx.beginPath();
        ctx.arc(0, 0, CONSTANTS.PLAYER_SIZE, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff88';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 正面インジケータ（▲マーク）
        ctx.beginPath();
        const offset = CONSTANTS.PLAYER_SIZE + 2;
        ctx.moveTo(offset + 10, 0);   // 先端
        ctx.lineTo(offset, -7);      // 後端左
        ctx.lineTo(offset, 7);       // 後端右
        ctx.closePath();

        ctx.fillStyle = '#00ffff';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    drawBarrier(ctx) {
        const hpRatio = Math.max(0, this.hp / CONSTANTS.PLAYER_MAX_HP);
        const time = Date.now() / 1000;

        // HP連動カラー (1.0: Cyan, 0.5: Purple, 0.25: Red)
        let r, g, b;
        if (hpRatio > 0.5) {
            // Cyan (0, 255, 255) to Purple (180, 0, 255)
            const t = (hpRatio - 0.5) * 2; // 0 to 1
            r = Math.floor(180 * (1 - t) + 0 * t);
            g = Math.floor(0 * (1 - t) + 255 * t);
            b = 255;
        } else if (hpRatio > 0.25) {
            // Purple (180, 0, 255) to Dark Red (255, 0, 100)
            const t = (hpRatio - 0.25) * 4; // 0 to 1
            r = Math.floor(255 * (1 - t) + 180 * t);
            g = 0;
            b = Math.floor(100 * (1 - t) + 255 * t);
        } else {
            // Red (255, 0, 0) - Low HP instability
            r = 255; g = 0; b = 0;
        }

        const baseAlpha = 0.3 + 0.5 * hpRatio;
        const color = `rgba(${r}, ${g}, ${b}, ${baseAlpha})`;
        const beamColor = `rgba(${r}, ${g}, ${b}, ${baseAlpha + 0.2})`;

        // 低HP時の点滅処理
        if (hpRatio < 0.3 && Math.sin(time * 20) > 0.5) return;

        const segments = 72; // 解像度
        const baseRadius = CONSTANTS.PLAYER_SIZE + 12;

        // HPが低いほど振幅を大きく、不安定にする
        const instability = (1 - hpRatio);
        const mainAmp = 4 + instability * 12;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.lineJoin = 'round';

        // 3〜4層のレイヤーを描画
        const layers = 4;
        for (let l = 0; l < layers; l++) {
            const layerOffset = l * 0.5;
            const radius = baseRadius + l * 2.5;
            const lAlpha = (1 - (l / layers)) * baseAlpha;

            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;

                // 複数周波数の合成波形
                const s1 = Math.sin(angle * 7 + time * (3 + l) + layerOffset);
                const s2 = Math.sin(angle * 13 - time * 2 + layerOffset * 2) * 0.5;
                const s3 = Math.sin(angle * 3 + time * 1.5) * 0.8;

                // 簡易ノイズ (高周波サインで代用)
                const noiseVal = Math.sin(angle * 25 + time * 15) * instability * 0.6;

                const combined = (s1 + s2 + s3 + noiseVal) / 2.5;
                const r_dyn = radius + combined * mainAmp;

                const px = Math.cos(angle) * r_dyn;
                const py = Math.sin(angle) * r_dyn;

                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();

            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lAlpha})`;
            ctx.lineWidth = 0.8 + (1 - l / layers) * 1.2;
            ctx.stroke();
        }

        // 低HP時の火花演出
        if (hpRatio < 0.4) {
            const sparkCount = Math.floor((1 - hpRatio) * 5);
            for (let i = 0; i < sparkCount; i++) {
                const sAngle = Math.random() * Math.PI * 2;
                const sDist = baseRadius + Math.random() * 20;
                const sx = Math.cos(sAngle) * sDist;
                const sy = Math.sin(sAngle) * sDist;
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx, sy, 2, 2);
            }
        }

        ctx.restore();
    }
}
