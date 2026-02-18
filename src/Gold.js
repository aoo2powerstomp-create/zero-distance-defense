import { CONSTANTS } from './constants.js';

export class Gold {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0; // 垂直方向（跳ね）のシミュレーション
        this.z = 0;  // 高さ
        this.active = false;
        this.isAttracting = false;
        this.spawnTime = 0;
        this.value = 10; // デフォルト値を10に設定
    }

    init(x, y, value = 10, options = {}) {
        this.x = x;
        this.y = y;
        this.z = 0;
        // 数値でない、または有限数でない場合はデフォルトの10を使用
        this.value = (typeof value === 'number' && Number.isFinite(value)) ? value : 10;
        this.isBonus = options.isBonus || false;

        // 初速をランダムに設定（弾ける演出）
        const angle = Math.random() * Math.PI * 2;
        const groundSpeed = Math.random() * 4 + 2;
        this.vx = Math.cos(angle) * groundSpeed;
        this.vy = Math.sin(angle) * groundSpeed;

        // 上方向に弾ける
        this.vz = -(Math.random() * 5 + 5);

        this.active = true;
        this.isAttracting = false;
        this.spawnTime = Date.now();
    }

    update(targetX, targetY) {
        // ... (update 処理は既存のまま)
        const now = Date.now();
        const elapsed = now - this.spawnTime;

        if (elapsed < 1000) {
            this.vz += 0.8;
            this.z += this.vz;
            if (this.z > 0) {
                this.z = 0;
                this.vz *= -0.5;
                this.vx *= 0.8;
                this.vy *= 0.8;
            }
            this.x += this.vx;
            this.y += this.vy;
        } else {
            this.isAttracting = true;
            this.z *= 0.9;
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const angle = Math.atan2(dy, dx);
            const speed = CONSTANTS.GOLD_ATTRACT_SPEED + (elapsed - 1000) / 100;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.x += this.vx;
            this.y += this.vy;
        }
    }

    draw(ctx, asset) {
        if (!this.active) return;

        ctx.save();
        if (this.isBonus) {
            // ボーナス時は輝度を上げる (加算合成)
            ctx.globalCompositeOperation = 'lighter';
            // 少し大きく表示
            const bonusScale = 1.2;
            const size = CONSTANTS.GOLD_SIZE * 1.05 * bonusScale;
            if (asset) {
                ctx.drawImage(asset, this.x - size / 2, this.y + this.z - size / 2, size, size);
                // 重ねて描画してさらに光らせる
                ctx.globalAlpha = 0.5;
                ctx.drawImage(asset, this.x - size / 2, this.y + this.z - size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(this.x, this.y + this.z, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffff00';
                ctx.fill();
            }
        } else {
            const size = CONSTANTS.GOLD_SIZE * 1.05;
            if (asset) {
                ctx.drawImage(asset, this.x - size / 2, this.y + this.z - size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(this.x, this.y + this.z, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffd700';
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
