import { CONSTANTS } from './constants.js';

export class Bullet {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.active = false;
        this.spawnTime = 0;
        this.damage = 0;
        this.pierceCount = 0;
        this.angle = 0;
        this.widthMul = 1.0;
        this.heightMul = 1.0;
        this.hitWidthMul = 1.0;
    }

    init(x, y, angle, speed, damage, pierce, lifetime, weaponType, extra = {}) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.spawnTime = Date.now();
        this.active = true;
        this.damage = damage;
        this.pierceCount = pierce;
        this.lifetime = lifetime;
        this.weaponType = weaponType;

        // Lv11-30用の追加パラメータ
        this.widthMul = extra.bulletWidth || 1.0;
        this.heightMul = extra.bulletHeight || 1.0;
        this.hitWidthMul = extra.hitWidth || 1.0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // 寿命チェック
        if (Date.now() - this.spawnTime > this.lifetime) {
            this.active = false;
        }

        // 画面外チェック
        if (this.x < 0 || this.x > CONSTANTS.TARGET_WIDTH || this.y < 0 || this.y > CONSTANTS.TARGET_HEIGHT) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const baseSize = CONSTANTS.BULLET_SIZE;
        const w = baseSize * 2 * this.widthMul;
        const h = baseSize * 2 * this.heightMul;

        if (this.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) {
            // LASER
            ctx.fillStyle = '#00ffff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ffff';
            ctx.fillRect(-w / 2, -h / 2, w, h);
        } else if (this.weaponType === CONSTANTS.WEAPON_TYPES.RIFLE) {
            // RIFLE (細長い弾)
            ctx.fillStyle = '#ff8800';
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(-w / 2, -h / 2, w, h);
        } else {
            // STANDARD / SHOT (円形ベース)
            ctx.beginPath();
            ctx.ellipse(0, 0, baseSize * this.widthMul, baseSize * this.heightMul, 0, 0, Math.PI * 2);
            ctx.fillStyle = this.weaponType === CONSTANTS.WEAPON_TYPES.SHOT ? '#ff4444' : '#ffffff';
            ctx.fill();
        }

        ctx.restore();
    }
}
