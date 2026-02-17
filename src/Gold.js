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

    init(x, y, value = 10) {
        this.x = x;
        this.y = y;
        this.z = 0;
        // 数値でない、または有限数でない場合はデフォルトの10を使用
        this.value = (typeof value === 'number' && Number.isFinite(value)) ? value : 10;

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
        const now = Date.now();
        const elapsed = now - this.spawnTime;

        // 跳ねる物理シミュレーション (1秒間は強制的に跳ねるフェーズ)
        if (elapsed < 1000) {
            this.vz += 0.8; // 重力
            this.z += this.vz;

            if (this.z > 0) {
                this.z = 0;
                this.vz *= -0.5; // 跳ね返り減衰
                // 地面との摩擦
                this.vx *= 0.8;
                this.vy *= 0.8;
            }

            this.x += this.vx;
            this.y += this.vy;
        } else {
            // 吸引フェーズ
            this.isAttracting = true;
            this.z *= 0.9; // 高さを戻す

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const angle = Math.atan2(dy, dx);

            // 徐々に加速して吸い込まれる
            const speed = CONSTANTS.GOLD_ATTRACT_SPEED + (elapsed - 1000) / 100;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;

            this.x += this.vx;
            this.y += this.vy;
        }
    }

    draw(ctx, asset) {
        if (asset) {
            const size = CONSTANTS.GOLD_SIZE * 1.05; // 1.5 * 0.7 = 1.05
            ctx.drawImage(asset, this.x - size / 2, this.y + this.z - size / 2, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y + this.z, CONSTANTS.GOLD_SIZE / 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd700';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}
