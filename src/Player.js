import { CONSTANTS } from './constants.js';

export class Player {
    constructor(x, y, game) {
        this.game = game;
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
            shot: { unlocked: true, level: 1, atkSpeedLv: 1 },
            pierce: { unlocked: true, level: 1, atkSpeedLv: 1 }
        };

        // 半追随照準用のターゲット
        this.targetX = x;
        this.targetY = y;

        // バリア即死システム
        this.barrierCharges = CONSTANTS.BARRIER_MAX_CHARGES;
        this.lastBarrierRegenTime = Date.now();
        this.barrierKillConsumedThisFrame = false;

        // レアアイテム効果用ステート
        this.overdriveUntilMs = 0;
        this.invincibleUntilMs = 0;

        // 演出用
        this.damageFlashTimer = 0;
        this.invincibleFrames = 0;
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
        let speed = CONSTANTS.PLAYER_BASE_ROTATION_SPEED;

        // デバッグ倍速時は操作性を確保するために旋回速度を上げる
        if (this.game && this.game.debugEnabled && this.game.timeScale > 1.0) {
            speed *= 5.0;
        }

        return speed;
    }

    // 弾速・ダメージ計算用の補正値を返す
    getWeaponStats() {
        const config = this.getWeaponConfig();
        const weaponData = this.weapons[this.currentWeapon];
        const level = weaponData.level;
        const atkSpeedLv = weaponData.atkSpeedLv;
        const growth = CONSTANTS.WEAPON_GROWTH[this.currentWeapon];

        // 攻撃力: base * (scale ^ (lv-1))
        let damage = config.baseDamage * Math.pow(config.damageScale, level - 1);

        // OVERDRIVE補正
        if (Date.now() < this.overdriveUntilMs) {
            const def = CONSTANTS.ITEM_DEFS[CONSTANTS.ITEM_TYPES.OVERDRIVE];
            if (def) damage *= def.damageMul;
        }

        const speed = CONSTANTS.BULLET_SPEED * config.speedScale;

        // 貫通数
        let pierce = config.pierceBase;
        if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.PIERCE) {
            pierce = 2 + Math.floor((level - 1) * 4 / 9); // Lv1=2, Lv10=6相当
            // LASER Lv11-30 でさらに微増
            if (level > 10) pierce += Math.floor((level - 10) / 5);
        } else if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.STANDARD) {
            pierce = 0; // 跳弾実装に伴い、貫通性能を廃止
        } else if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.SHOT) {
            // SHOTGUN は貫通を抑える (Lv30で3回程度)
            pierce = config.pierceBase + Math.floor(level / 10);
        } else {
            pierce = config.pierceBase + Math.floor(level / 3);
        }

        // 連射速度（クールタイム）
        const baseCooldown = config.baseCooldown || CONSTANTS.BULLET_COOLDOWN_MS;
        const speedGrowth = CONSTANTS.ATK_SPEED_GROWTH_RATE || 0.85;
        let cooldown = baseCooldown * Math.pow(speedGrowth, atkSpeedLv - 1);

        // 寿命: base * scale
        let lifeScale = config.lifeScale || 1.0;

        // SHOTGUN はレベルに応じて射程が伸びる
        if (this.currentWeapon === CONSTANTS.WEAPON_TYPES.SHOT) {
            lifeScale += (level - 1) * 0.01; // Lv30で +0.29。初期 0.2 -> 最大 0.49
        }

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
                // レーザーのみ Lv11-30 で連射速度が最大2倍まで加速
                if (growth.ATK_SPEED_MUL_MAX) {
                    cooldown /= (1 + (growth.ATK_SPEED_MUL_MAX - 1) * t);
                }
            }
        }

        // 連射の下限ガード（物理的な連射上限）
        const minInterval = config.minInterval || 50;
        if (cooldown < minInterval) cooldown = minInterval;

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
        // INVINCIBLE中は無敵 (アイテム効果 or 被弾後無敵 or デバッグ無敵)
        if (Date.now() < this.invincibleUntilMs || this.invincibleFrames > 0 || (this.game && this.game.debugInvincible)) return;

        const damage = CONSTANTS.PLAYER_MAX_HP * ratio * 2;

        // デバッグステージでは体力を一時的に減らす（視覚的演出用。実際の死亡は避ける）
        if (this.game && this.game.isDebugStage) {
            this.damageFlashTimer = 300;
            const finalDamage = Math.min(this.hp - 1, damage); // 1残す
            this.hp = Math.max(0, this.hp - finalDamage);

            if (this.game.spawnDamageText) {
                this.game.spawnDamageText(this.x, this.y - 30, `-${Math.round(damage)}`, "#ff4444");
            }
            return;
        }

        this.hp = Math.max(0, this.hp - damage);
        this.lastDamageTime = Date.now();

        // 被弾カウント (Result用)
        if (this.game) {
            this.game.recordDamage();
        }

        // 被弾フラッシュ (300ms)
        this.damageFlashTimer = 300;
    }

    update(dt) {
        this.barrierKillConsumedThisFrame = false;

        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
        }

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
        const pullAmount = diff * CONSTANTS.PLAYER_FOLLOW_STRENGTH * (dt / 1000);
        const maxPullPerFrame = 0.15;
        const clampedPull = Math.max(-maxPullPerFrame, Math.min(maxPullPerFrame, pullAmount));

        this.angle += clampedPull;

        // 角度の正規化
        this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        // 描画用の角度計算: マウス方向を基準に、画像の下向き(+Y)が正面なので -90度
        this.renderAngle = this.angle - Math.PI / 2;

        // 自動回復
        const now = Date.now();
        // デバッグステージでは即座に超高速回復
        if (this.game && this.game.isDebugStage) {
            if (this.hp < CONSTANTS.PLAYER_MAX_HP) {
                const debugRegen = CONSTANTS.PLAYER_MAX_HP * 2.0 * (dt / 1000); // 0.5秒で全快する速度
                this.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.hp + debugRegen);
            }
        } else if (now - this.lastDamageTime > CONSTANTS.PLAYER_REGEN_STOP_MS) {
            const regen = CONSTANTS.PLAYER_MAX_HP * CONSTANTS.PLAYER_REGEN_PER_SEC * (dt / 1000);
            this.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.hp + regen);
        }

        if (this.invincibleFrames > 0) {
            this.invincibleFrames--;
        }
    }

    draw(ctx) {
        this.drawBarrier(ctx);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.renderAngle || (this.angle - Math.PI / 2));

        const asset = this.game.assetLoader ? this.game.assetLoader.get('PLAYER') : null;

        if (asset) {
            // アセットがある場合：スプライト描画
            // 縦横比を維持しながらサイズを調整 (ベースサイズ 1.2倍: 2.5 -> 3.0)
            const baseSize = CONSTANTS.PLAYER_SIZE * 3.0;
            const aspectRatio = asset.width / asset.height;
            let drawW, drawH;

            if (aspectRatio >= 1) {
                drawW = baseSize;
                drawH = baseSize / aspectRatio;
            } else {
                drawW = baseSize * aspectRatio;
                drawH = baseSize;
            }

            // 中心（コア）の位置が回転軸になるように微調整
            // 画像内の〇の位置が少し上にあるため、描画位置を「下」にずらすことで
            // 相対的に回転軸が「上」に来るように調整します。
            const yOffset = drawH * 0.15; // 8% -> 15% に増やして軸をさらに上に。

            // 中心を回転軸にして描画
            ctx.drawImage(asset, -drawW / 2, -drawH / 2 + yOffset, drawW, drawH);

            // 被弾フラッシュ演出
            if (this.damageFlashTimer > 0) {
                // オフスクリーンキャンバスを使用して透過部分に影響を与えないように着色する
                if (!this.tintCanvas) {
                    this.tintCanvas = document.createElement('canvas');
                    this.tintCtx = this.tintCanvas.getContext('2d');
                }

                // サイズが変更された場合や初回
                if (this.tintCanvas.width !== asset.width || this.tintCanvas.height !== asset.height) {
                    this.tintCanvas.width = asset.width;
                    this.tintCanvas.height = asset.height;
                }

                // オフスクリーンに着色済みのイメージを作成
                const tCtx = this.tintCtx;
                tCtx.clearRect(0, 0, this.tintCanvas.width, this.tintCanvas.height);
                tCtx.drawImage(asset, 0, 0);

                tCtx.globalCompositeOperation = 'source-atop';
                const alpha = Math.min(0.8, (this.damageFlashTimer / 300) * 1.0);
                tCtx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
                tCtx.fillRect(0, 0, this.tintCanvas.width, this.tintCanvas.height);
                tCtx.globalCompositeOperation = 'source-over';

                // メインキャンバスに重ねる
                ctx.drawImage(this.tintCanvas, -drawW / 2, -drawH / 2 + yOffset, drawW, drawH);
            }
        }

        ctx.restore();
        this.drawBuffHUD(ctx);
    }

    drawBuffHUD(ctx) {
        const buffs = [];
        const now = Date.now();

        // 1. OVERDRIVE
        if (this.overdriveUntilMs > now) {
            const total = CONSTANTS.ITEM_DEFS.overdrive.durationMs;
            const remaining = this.overdriveUntilMs - now;
            buffs.push({
                label: '攻撃力UP',
                color: '#ff0055',
                ratio: Math.min(1.0, remaining / total)
            });
        }

        // 2. INVINCIBLE
        if (this.invincibleUntilMs > now) {
            const total = CONSTANTS.ITEM_DEFS.invincible.durationMs;
            const remaining = this.invincibleUntilMs - now;
            buffs.push({
                label: '無敵',
                color: '#ffd700',
                ratio: Math.min(1.0, remaining / total)
            });
        }

        // 3. FREEZE
        if (this.game && this.game.freezeTimer > 0) {
            const total = CONSTANTS.ITEM_CONFIG.freezeDurationMs;
            const remaining = this.game.freezeTimer;
            buffs.push({
                label: '速度低下',
                color: '#00ccff',
                ratio: Math.min(1.0, remaining / total)
            });
        }

        if (buffs.length === 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        const barW = 60;
        const barH = 4;
        const spacing = 14;
        let yOffset = -CONSTANTS.PLAYER_SIZE * 3.5;

        buffs.forEach(buff => {
            // Text
            ctx.font = 'bold 10px Orbitron, sans-serif';
            ctx.fillStyle = buff.color;
            ctx.textAlign = 'center';
            ctx.fillText(buff.label, 0, yOffset);

            // Bar
            const bx = -barW / 2;
            const by = yOffset + 4;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = buff.color;
            ctx.fillRect(bx, by, barW * buff.ratio, barH);

            yOffset -= spacing;
        });

        ctx.restore();
    }

    drawBarrier(ctx) {
        const hpRatio = Math.max(0, this.hp / CONSTANTS.PLAYER_MAX_HP);
        const time = Date.now() / 1000;

        // HP連動カラー (1.0: Cyan, 0.5: Purple, 0.25: Red)
        let r, g, b;
        const isDamageBlink = this.damageFlashTimer > 0 && Math.floor(Date.now() / 60) % 2 === 0;

        if (isDamageBlink) {
            // 被弾点滅中：明るい赤
            r = 255; g = 50; b = 50;
        } else if (hpRatio > 0.5) {
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
