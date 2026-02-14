import { CONSTANTS } from './constants.js';

// 弾のティント画像用キャッシュ
const TINT_CACHE = new Map();

/**
 * 元の画像と色の組み合わせに対応する着色済みキャンバスを返す
 * 一度作成したものはキャッシュして再利用する (軽量化)
 */
function getTintedAsset(img, color) {
    if (!img || !color) return img;
    const key = img.src + ":" + color;
    if (TINT_CACHE.has(key)) return TINT_CACHE.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    // 1. 元の画像を描画して形状（アルファ）を確定させる
    ctx.drawImage(img, 0, 0);

    // 2. 着色 (source-in を使うことで、画像が存在するピクセルのみを「色だけ」で塗りつぶす)
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    TINT_CACHE.set(key, canvas);
    return canvas;
}

export function getStageByLevel(lv) {
    if (lv >= 30) return 30;
    if (lv >= 20) return 3;
    if (lv >= 10) return 2;
    return 1;
}

export function getTintForWeapon(type, lv) {
    const st = getStageByLevel(lv);

    // 視認性最大化：彩度の高いハッキリした色使い
    if (type === CONSTANTS.WEAPON_TYPES.STANDARD) {
        if (st === 30) return "rgba(0, 255, 255, 1.0)";   // 極彩色シアン
        if (st === 3) return "rgba(0, 100, 255, 1.0)";   // 鮮烈な青
        if (st === 2) return "rgba(0, 150, 255, 0.7)";   // 爽やかな青
        return "rgba(180, 230, 255, 0.35)";               // ほぼ白（微かなシアン）
    }

    if (type === CONSTANTS.WEAPON_TYPES.SHOT) {
        if (st === 30) return "rgba(0, 255, 100, 1.0)";   // ネオングリーン
        if (st === 3) return "rgba(0, 255, 200, 0.9)";   // エメラルド
        if (st === 2) return "rgba(100, 255, 255, 0.7)"; // シアン
        return "rgba(220, 255, 240, 0.35)";               // ほぼ白（微かな緑）
    }

    if (type === CONSTANTS.WEAPON_TYPES.PIERCE) {
        if (st === 30) return "rgba(255, 0, 255, 1.0)";   // 極彩色マゼンタ
        if (st === 3) return "rgba(180, 0, 255, 1.0)";   // 鮮烈な紫
        if (st === 2) return "rgba(200, 150, 255, 0.7)"; // 柔らかい紫
        return "rgba(240, 230, 255, 0.35)";               // ほぼ白（微かな紫）
    }

    return null;
}

function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function getLaserTurnRate(lv) {
    if (lv >= 30) return 0.08;
    if (lv >= 20) return 0.05;
    if (lv >= 10) return 0.03;
    return 0.0;
}

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
        this.tintColor = null;
        this.visualScale = 1.0;
        this.flashFrames = 0;
        this.hitEnemies = new Set(); // 衝突済みの敵を記録 (多段ヒット防止)
        this.ricochetCount = 0;      // 残り跳弾回数
        this.ricochetExcludes = new Set(); // 跳弾ターゲットから除外する敵
        this.isRicochet = false;     // 跳弾門の弾かどうか
        this.isRicochetInitiated = false; // 跳弾情報の初期化済みフラグ
        this.burstFrames = 0;        // Lv30バースト残りフレーム
        this.burstDamageMul = 1.0;   // バースト時のダメージ倍率
        this.level = 1;
        this.speed = 0;
        this.homingFrames = 0;
        this.homingTarget = null;
        this.homingLocked = false;
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

        // 見た目の進化用
        this.tintColor = extra.tintColor || null;
        this.visualScale = extra.visualScale || 1.0;
        this.flashFrames = extra.flashFrames || 0;

        this.ricochetCount = extra.ricochetCount || 0;
        this.ricochetExcludes = extra.ricochetExcludes || new Set();
        this.isRicochet = extra.isRicochet || false;
        this.isRicochetInitiated = extra.isRicochetInitiated || false;

        this.burstFrames = extra.burstFrames || 0;
        this.burstDamageMul = extra.burstDamageMul || 1.0;

        this.level = extra.level || 1;
        this.speed = speed;

        if (this.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE && this.level >= 10) {
            this.homingFrames = 9;
        } else {
            this.homingFrames = 0;
        }
        this.homingTarget = null;
        this.homingLocked = false;

        this.hitEnemies.clear(); // 初期化時にクリア
    }

    update(enemies, grid, targetX, targetY) {
        if (this.homingFrames > 0 && enemies) {
            const turnRate = getLaserTurnRate(this.level);

            if (turnRate > 0) {
                // 1. 未ロックならターゲット選定（一度だけ）
                if (!this.homingLocked) {
                    let nearest = null;
                    const radius = 350; // 索敵範囲を少し拡大 (260 -> 350)

                    // 比較用の距離: カーソル座標が渡されていればカーソルとの距離、なければ弾との距離
                    let bestD2 = Number.MAX_VALUE;
                    const useCursor = (targetX !== undefined && targetY !== undefined);

                    if (grid) {
                        // SpatialGrid を利用した高速探索
                        const candidates = grid.queryCircle(this.x, this.y, radius);
                        for (let i = 0; i < candidates.length; i++) {
                            const e = candidates[i];
                            if (!e.active || e.hp <= 0) continue;

                            // ターゲット選定基準
                            let d2;
                            if (useCursor) {
                                // カーソルとの距離で判定
                                const dx = e.x - targetX;
                                const dy = e.y - targetY;
                                d2 = dx * dx + dy * dy;
                            } else {
                                // 従来通り弾との距離
                                const dx = e.x - this.x;
                                const dy = e.y - this.y;
                                d2 = dx * dx + dy * dy;
                            }

                            if (d2 < bestD2) {
                                bestD2 = d2;
                                nearest = e;
                            }
                        }
                    } else {
                        // フォールバック：全件探索
                        for (let i = 0; i < enemies.length; i++) {
                            const e = enemies[i];
                            if (!e || !e.active || e.hp <= 0) continue;

                            // 弾からの距離チェック（全件探索時はまず範囲内か見る）
                            const distToBulletSq = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
                            if (distToBulletSq > radius * radius) continue;

                            let d2;
                            if (useCursor) {
                                const dx = e.x - targetX;
                                const dy = e.y - targetY;
                                d2 = dx * dx + dy * dy;
                            } else {
                                d2 = distToBulletSq;
                            }

                            if (d2 < bestD2) {
                                bestD2 = d2;
                                nearest = e;
                            }
                        }
                    }
                    this.homingTarget = nearest;
                    this.homingLocked = true;
                }

                // 2. 誘導実行
                const t = this.homingTarget;
                if (t && t.active && t.hp > 0) {
                    const targetAngle = Math.atan2(t.y - this.y, t.x - this.x);
                    let diff = normalizeAngle(targetAngle - this.angle);

                    if (diff > turnRate) diff = turnRate;
                    if (diff < -turnRate) diff = -turnRate;

                    this.angle += diff;
                    this.vx = Math.cos(this.angle) * this.speed;
                    this.vy = Math.sin(this.angle) * this.speed;
                } else {
                    // ターゲット消失で誘導停止
                    this.homingFrames = 0;
                }
            }
            this.homingFrames--;
        }

        this.x += this.vx;
        this.y += this.vy;

        // 寿命チェック
        if (Date.now() - this.spawnTime > this.lifetime) {
            this.active = false;
        }

        if (this.burstFrames > 0) {
            this.burstFrames--;
        }
        // 画面外チェック
        if (this.x < 0 || this.x > CONSTANTS.TARGET_WIDTH || this.y < 0 || this.y > CONSTANTS.TARGET_HEIGHT) {
            this.active = false;
        }
    }

    draw(ctx, asset) {
        if (!asset) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle); // 画像は右向き基準（angle=0で右向き）

        // サイズ設計 (Rifle: 32, Shotgun: 36, Laser: 40)
        let size = 32;
        if (this.weaponType === CONSTANTS.WEAPON_TYPES.SHOT) size = 36;
        else if (this.weaponType === CONSTANTS.WEAPON_TYPES.PIERCE) size = 40;

        // レベル強化等によるサイズ・幅の補正を適用
        let drawW = size * this.widthMul * this.visualScale;
        let drawH = size * this.heightMul * this.visualScale;

        // 1. レイヤー分けされた強力なオーラ描画 (背景側に光を漏らす)
        if (this.tintColor) {
            const tintedAsset = getTintedAsset(asset, this.tintColor);
            ctx.save();
            ctx.globalCompositeOperation = "lighter";

            // 外周グロー (少し大きく、ぼかしたような表現を重ね描きで代用)
            const glowScale = 1.0 + (getStageByLevel(Math.floor(this.visualScale * 10)) * 0.05);
            ctx.globalAlpha = 0.35;
            ctx.drawImage(tintedAsset, -drawW * 1.3 / 2, -drawH * 1.3 / 2, drawW * 1.3, drawH * 1.3);
            ctx.globalAlpha = 0.15;
            ctx.drawImage(tintedAsset, -drawW * 1.6 / 2, -drawH * 1.6 / 2, drawW * 1.6, drawH * 1.6);
            ctx.restore();
        }

        // 2. 弾本体の通常描画
        ctx.drawImage(asset, -drawW / 2, -drawH / 2, drawW, drawH);

        // 3. カラーティント & フラッシュ演出
        if (this.tintColor) {
            const tintedAsset = getTintedAsset(asset, this.tintColor);
            ctx.save();

            // A. ボディに色を強く乗せる (source-over 0.6)
            ctx.globalAlpha = 0.6;
            ctx.drawImage(tintedAsset, -drawW / 2, -drawH / 2, drawW, drawH);

            // B. 加算合成で芯を光らせる (lighter 0.9)
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.9;
            ctx.drawImage(tintedAsset, -drawW / 2, -drawH / 2, drawW, drawH);

            // C. Lv30フラッシュ & バースト演出：サイズ拡大＋ホワイトアウト
            if (this.flashFrames > 0 || this.burstFrames > 0) {
                const isBurst = this.burstFrames > 0;
                const ratio = isBurst ? 1.0 : (this.flashFrames / 5);

                const flashW = drawW * (isBurst ? 1.15 : (1.1 + ratio * 1.2));
                const flashH = drawH * (isBurst ? 1.15 : (1.1 + ratio * 1.2));

                ctx.globalAlpha = ratio * (isBurst ? 0.8 : 1.0);
                const whiteAsset = getTintedAsset(asset, "white");

                // 巨大な光の輪 / 高出力の芯
                ctx.drawImage(whiteAsset, -flashW / 2, -flashH / 2, flashW, flashH);
                if (isBurst) {
                    ctx.globalAlpha = 0.4;
                    ctx.drawImage(whiteAsset, -flashW * 1.3 / 2, -flashH * 1.3 / 2, flashW * 1.3, flashH * 1.3);
                } else {
                    ctx.drawImage(whiteAsset, -flashW / 2, -flashH / 2, flashW, flashH);
                }

                if (!isBurst && this.flashFrames > 0) this.flashFrames--;
            }
            ctx.restore();
        }

        ctx.restore();
        ctx.globalCompositeOperation = "source-over"; // 念のため確実に戻す
    }
}
