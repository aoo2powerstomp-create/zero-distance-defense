import { CONSTANTS } from './constants.js';

export class DamageText {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.text = '';
        this.color = '#fff';
        this.active = false;
        this.alpha = 1.0;
        this.vy = -1.5; // 上方向に移動
        this.spawnTime = 0;
        this.duration = 800; // 表示時間 (ms)
    }

    init(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.active = true;
        this.alpha = 1.0;
        this.spawnTime = Date.now();
    }

    update() {
        const elapsed = Date.now() - this.spawnTime;
        if (elapsed > this.duration) {
            this.active = false;
            return;
        }

        // 上昇
        this.y += this.vy;

        // フェードアウト
        this.alpha = 1.0 - (elapsed / this.duration);
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 20px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}
