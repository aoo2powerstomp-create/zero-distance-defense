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
    }

    init(x, y, angle, speed, damage, pierce, lifetime, weaponType) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.spawnTime = Date.now();
        this.active = true;
        this.damage = damage;
        this.pierceCount = pierce;
        this.lifetime = lifetime;
        this.weaponType = weaponType;
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
        ctx.beginPath();
        ctx.arc(this.x, this.y, CONSTANTS.BULLET_SIZE, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}
