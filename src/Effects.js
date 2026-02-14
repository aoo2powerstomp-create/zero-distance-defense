/**
 * Effects.js
 * ダメージ段階別ヒットエフェクトの管理クラス
 */
export class Effects {
    static list = [];
    static frameCount = 0;
    static lastFrameTime = 0;

    /**
     * エフェクトの生成
     */
    static spawnHitEffect(x, y, damage) {
        // パフォーマンス制限: 1フレーム最大10個
        const now = Date.now();
        if (now !== this.lastFrameTime) {
            this.frameCount = 0;
            this.lastFrameTime = now;
        }

        let type = 'SMALL';
        if (this.frameCount >= 10) {
            type = 'SMALL'; // 強制変換
        } else {
            if (damage < 3) type = 'SMALL';
            else if (damage < 8) type = 'MEDIUM';
            else type = 'LARGE';
        }

        this.frameCount++;

        if (type === 'SMALL') {
            this.createSmall(x, y);
        } else if (type === 'MEDIUM') {
            this.createMedium(x, y);
        } else {
            this.createLarge(x, y);
        }
    }

    static createSmall(x, y) {
        this.list.push({
            type: 'circle',
            x, y,
            radius: 8,
            life: 0.15,
            maxLife: 0.15,
            color: 'rgba(255, 255, 255, 0.8)',
            scale: 1.0,
            grow: 0.5
        });
    }

    static createMedium(x, y) {
        // 軽い揺らし
        const ox = (Math.random() - 0.5) * 4;
        const oy = (Math.random() - 0.5) * 4;

        this.list.push({
            type: 'spark',
            x: x + ox, y: y + oy,
            radius: 15,
            life: 0.2,
            maxLife: 0.2,
            color: '#fff',
            lines: 4,
            angle: Math.random() * Math.PI
        });
    }

    static createLarge(x, y) {
        // リング
        this.list.push({
            type: 'ring',
            x, y,
            radius: 5,
            targetRadius: 20,
            life: 0.25,
            maxLife: 0.25,
            color: '#fff'
        });

        // 破片パーティクル 6個
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
            const speed = 2 + Math.random() * 3;
            this.list.push({
                type: 'particle',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 3 + Math.random() * 2,
                life: 0.25,
                maxLife: 0.25,
                color: '#fff'
            });
        }
    }

    static createExplosion(x, y, radius) {
        // 巨大リング
        this.list.push({
            type: 'ring',
            x, y,
            radius: 10,
            targetRadius: radius,
            life: 0.4,
            maxLife: 0.4,
            color: '#ff4400'
        });

        // 追加の白リング（衝撃波）
        this.list.push({
            type: 'ring',
            x, y,
            radius: 5,
            targetRadius: radius * 0.8,
            life: 0.2,
            maxLife: 0.2,
            color: '#ffffff'
        });

        // 大量の火花
        for (let i = 0; i < 16; i++) {
            const angle = (Math.PI * 2 / 16) * i + Math.random();
            const speed = 4 + Math.random() * 6;
            this.list.push({
                type: 'particle',
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 5 + Math.random() * 4,
                life: 0.5,
                maxLife: 0.5,
                color: '#ffaa00'
            });
        }
    }

    static createRing(x, y, color) {
        this.list.push({
            type: 'ring',
            x, y,
            radius: 5,
            targetRadius: 25,
            life: 0.22,
            maxLife: 0.22,
            color: color
        });
    }

    static createSpark(x, y, color) {
        this.list.push({
            type: 'spark',
            x, y,
            radius: 12,
            life: 0.15,
            maxLife: 0.15,
            color: color || '#fff',
            lines: 4,
            angle: Math.random() * Math.PI
        });
    }

    /**
     * ショットガン用の軽量爆発エフェクト
     */
    static createShotgunExplosion(x, y, radius, isLv30 = false) {
        // メインの衝撃波リング (不透明度を下げて目に優しく調整)
        this.list.push({
            type: 'ring',
            x, y,
            radius: 5,
            targetRadius: radius,
            life: 0.2,
            maxLife: 0.2,
            color: isLv30 ? 'rgba(0, 255, 255, 0.4)' : 'rgba(180, 240, 255, 0.3)',
            composite: 'lighter'
        });

        // LV30用の追加閃光 (不透明度を下げて目に優しく調整)
        if (isLv30) {
            this.list.push({
                type: 'circle',
                x, y,
                radius: radius * 0.5,
                life: 0.1,
                maxLife: 0.1,
                color: 'rgba(255, 255, 255, 0.25)',
                scale: 1.0,
                grow: 2.0,
                composite: 'lighter'
            });
        }
    }

    static update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            e.life -= dt / 1000;
            if (e.life <= 0) {
                this.list.splice(i, 1);
                continue;
            }

            if (e.type === 'circle') {
                e.scale += e.grow * (dt / 16.6);
            } else if (e.type === 'ring') {
                const t = 1 - e.life / e.maxLife;
                e.radius = 5 + (e.targetRadius - 5) * t;
            } else if (e.type === 'particle') {
                e.x += e.vx * (dt / 16.6);
                e.y += e.vy * (dt / 16.6);
                e.vx *= 0.9;
                e.vy *= 0.9;
            }
        }
    }

    static draw(ctx) {
        ctx.save();
        for (const e of this.list) {
            const alpha = e.life / e.maxLife;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = e.color;
            ctx.fillStyle = e.color;
            ctx.lineWidth = 2;

            if (e.composite) {
                ctx.globalCompositeOperation = e.composite;
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }

            if (e.type === 'circle') {
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius * e.scale, 0, Math.PI * 2);
                ctx.fill();
            } else if (e.type === 'spark') {
                for (let i = 0; i < e.lines; i++) {
                    const angle = e.angle + (Math.PI * 2 / e.lines) * i;
                    const rInner = e.radius * 0.3;
                    const rOuter = e.radius;
                    ctx.beginPath();
                    ctx.moveTo(e.x + Math.cos(angle) * rInner, e.y + Math.sin(angle) * rInner);
                    ctx.lineTo(e.x + Math.cos(angle) * rOuter, e.y + Math.sin(angle) * rOuter);
                    ctx.stroke();
                }
            } else if (e.type === 'ring') {
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (e.type === 'particle') {
                ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
            } else if (e.type === 'line') {
                ctx.lineWidth = e.width || 2;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.tx, e.ty);
                ctx.stroke();
            }
        }
        ctx.globalCompositeOperation = 'source-over'; // 念のため戻す
        ctx.restore();
    }
}
