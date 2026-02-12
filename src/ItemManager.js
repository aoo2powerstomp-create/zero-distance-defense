/**
 * ItemManager.js
 * ドロップアイテム（HEAL, FREEZE, BOMB）の管理
 */
import { CONSTANTS } from './constants.js';
import { Effects } from './Effects.js';

export class ItemManager {
    constructor() {
        this.items = []; // {type, x, y, life, active}
    }

    /**
     * アイテムをスポーンさせる
     */
    spawnDrop(x, y, enemyType, game) { // game引数追加
        if (this.items.filter(i => i.active).length >= CONSTANTS.ITEM_CONFIG.maxCount) return;

        // ドロップ判定
        let chance = CONSTANTS.ITEM_CONFIG.dropChanceNormal;
        if (enemyType === CONSTANTS.ENEMY_TYPES.ELITE) {
            chance = CONSTANTS.ITEM_CONFIG.dropChanceElite;
        } else if (enemyType === CONSTANTS.ENEMY_TYPES.BOSS) {
            return; // ボスはドロップなし
        }

        if (Math.random() > chance) return;

        // 種類をランダム決定
        const types = Object.values(CONSTANTS.ITEM_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];

        // 空きスロットまたは新規
        let item = this.items.find(i => !i.active);
        if (!item) {
            item = { active: true };
            this.items.push(item);
        }

        item.active = true;
        item.type = type;
        item.x = x;
        item.y = y;
        item.life = CONSTANTS.ITEM_CONFIG.lifetimeMs;

        // 演出用ステート初期化
        item.state = 'spawn'; // spawn -> idle -> pickup
        item.animTimer = 0;
        item.visualScale = 0.5;
        item.visualY = -6;
        item.visualAlpha = 1.0;
        item.pickupTarget = null;
    }

    update(dt) {
        const vfx = CONSTANTS.ITEM_VFX;

        for (const item of this.items) {
            if (!item.active) continue;

            item.animTimer += dt;

            // 状態別更新
            if (item.state === 'spawn') {
                // 出現演出: ポップ & 着地
                if (item.animTimer >= vfx.spawnPopMs) {
                    item.state = 'idle';
                    item.animTimer = 0;
                    item.visualY = 0;
                    item.visualScale = 1.0;
                    // 着地リング
                    const visual = CONSTANTS.ITEM_VISUALS[item.type];
                    Effects.createRing(item.x, item.y, visual ? visual.color : '#fff');
                    // 効果音 (再生頻度制限はGame側で行うのが理想だが、ここでは簡易的に確率で間引くか、AudioManagerの制限に頼る)
                    // AudioManagerには同音制限があるため、ここでは直接呼ぶ
                    // game参照がないため、drawやtryPickupのようにgameを受け取る設計ではない場合、
                    // ItemManagerにgameを持たせるか、外部から呼ぶ必要がある。
                    // 既存設計ではAudioはGame経由。
                    // ここで音を鳴らすには Game.audio が必要。
                    // update呼び出し元(main.js)で game.audio を渡すように修正が必要だが、
                    // 今回は引数変更を避けるため、後述の main.js 側で渡すか、グローバル参照等は避ける。
                    // 簡易的な解決: this.game参照を保持するか、引数で渡す。
                    // main.js を見ると `this.itemManager.update(dt)` となっている。
                    // update(dt, game) に変更する。
                } else {
                    // バウンド (parabolic)
                    const t = item.animTimer / vfx.spawnPopMs;
                    item.visualY = -6 * 4 * t * (1 - t); // 簡易放物線
                    item.visualScale = 0.7 + 0.3 * t;
                }
            } else if (item.state === 'idle') {
                // 待機中: 寿命減少、浮遊、脈動
                item.life -= dt;
                if (item.life <= 0) {
                    item.active = false;
                    continue;
                }

                // 浮遊
                const floatPhase = (item.animTimer % vfx.floatPeriodMs) / vfx.floatPeriodMs;
                item.visualY = Math.sin(floatPhase * Math.PI * 2) * vfx.floatAmpPx;

                // 脈動
                const pulsePhase = (item.animTimer % vfx.pulsePeriodMs) / vfx.pulsePeriodMs;
                const scaleOff = Math.sin(pulsePhase * Math.PI * 2) * vfx.pulseScaleAmp;
                item.visualScale = 1.0 + scaleOff;

                // 点滅（寿命間近）
                if (item.life < vfx.blinkStartMs) {
                    const period = item.life < vfx.blinkFastMs ? 100 : 300;
                    item.visualAlpha = (Math.floor(Date.now() / period) % 2 === 0) ? 0.5 : 1.0;
                } else {
                    item.visualAlpha = 1.0;
                }

            } else if (item.state === 'pickup') {
                // 吸い込み演出
                if (item.animTimer >= vfx.pickupSuctionMs) {
                    // 吸い込み完了 -> 効果発動 & 消去
                    item.active = false;
                    if (this.gameRef) this.applyEffect(item, this.gameRef.player, this.gameRef);
                } else {
                    const t = item.animTimer / vfx.pickupSuctionMs;
                    // Easy-In (加速)
                    const easeT = t * t;

                    if (item.pickupTarget) {
                        // プレイヤーまたはHUDへの補間
                        // シンプルにプレイヤー中心へ
                        const tx = item.pickupTarget.x;
                        const ty = item.pickupTarget.y;

                        // startX, startY を保持していないため、現在位置から補間するとずれる
                        // pickup開始時に startX, startY を保存すべきだが、
                        // 既存構造への追加を最小限にするため、線形補間で吸い寄せる
                        // 毎フレーム target に向かって移動させる方式
                        const dx = tx - item.x;
                        const dy = ty - item.y;
                        item.x += dx * 0.2; // 簡易ホーミング
                        item.y += dy * 0.2;
                    }

                    item.visualScale = 1.0 * (1 - t) + 0.2 * t; // 縮小
                    item.visualAlpha = 1.0 - t * 0.5;
                }
            }
        }
    }

    draw(ctx) {
        ctx.save();
        const visuals = CONSTANTS.ITEM_VISUALS;

        for (const item of this.items) {
            if (!item.active) continue;

            // 視覚設定の取得
            const visual = visuals[item.type] || { color: '#fff', icon: '?' };

            // 位置計算
            const drawX = item.x;
            const drawY = item.y + item.visualY;
            const radius = 16 * item.visualScale;

            ctx.globalAlpha = item.visualAlpha;

            // 影（接地感）
            if (item.state !== 'pickup') {
                ctx.beginPath();
                ctx.ellipse(item.x, item.y + 10, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fill();
            }

            // 本体グロー（外周発光） - 視認性優先で削除
            // ctx.shadowBlur = 8;
            // ctx.shadowColor = visual.color;

            // 本体円 - 不透明度を少し下げて背景となじませつつ色を出す
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
            ctx.fillStyle = visual.color;
            ctx.globalAlpha = 0.8; // 色を濃く出す
            ctx.fill();
            ctx.globalAlpha = item.visualAlpha; // 戻す

            ctx.shadowBlur = 0;

            // 輪郭 - 白抜きでくっきりと
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // アイコン描画 - 白背景（発光）で見にくい可能性があるので、黒または濃い色で縁取りなどを検討
            // ここではシンプルに白文字 + 黒縁取り
            ctx.font = `bold ${Math.floor(radius * 1.2)}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(visual.icon, drawX, drawY + radius * 0.1);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(visual.icon, drawX, drawY + radius * 0.1);
        }
        ctx.restore();
    }

    /**
     * クリック位置でアイテム取得を試みる
     */
    tryPickup(screenX, screenY, rect, scale, offsetX, player, game) {
        // 画面座標（ビューポート相対）をゲーム内座標に正確に変換
        const gameX = (screenX - rect.left - offsetX) / scale;
        const gameY = (screenY - rect.top) / scale;

        for (const item of this.items) {
            if (!item.active) continue;

            const dx = item.x - gameX;
            const dy = item.y - gameY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < CONSTANTS.ITEM_CONFIG.pickupRadius) {
                // 即時発動ではなく、吸い込み演出へ移行
                // ただし、BOMBは「取得したその場所で爆発」という要望のため、即時発動する
                if (item.type === CONSTANTS.ITEM_TYPES.BOMB) {
                    if (item.state !== 'pickup' && item.active) {
                        item.active = false;
                        game.audio.play('item_pickup', { priority: 'high' });
                        this.applyEffect(item, player, game);
                        return true;
                    }
                }

                if (item.state !== 'pickup') {
                    item.state = 'pickup';
                    item.animTimer = 0;
                    item.pickupTarget = player; // プレイヤーへ吸い込み

                    // 取得SE
                    game.audio.play('item_pickup', { priority: 'high' });

                    // this.update 内で完了時に applyEffect されるように game 参照を保持
                    // (一時的なハックだが、ItemManagerはGameのサブコンポーネントとして動作するため許容)
                    this.gameRef = game;

                    return true;
                }
            }
        }
        return false;
    }

    applyEffect(item, player, game) {
        // ポップエフェクト (Effects.js不要な簡易ポップをここで出すか、Effects使うか)
        // ここではEffects.jsのcreateRingを流用しつつ、色を合わせる
        const visual = CONSTANTS.ITEM_VISUALS[item.type];
        Effects.createRing(item.x, item.y, visual ? visual.color : '#fff');
        // 追加スパークも欲しいなら Effects.createSmall(item.x, item.y) など
        Effects.spawnHitEffect(item.x, item.y, 1); // Smallエフェクト相当
        const config = CONSTANTS.ITEM_CONFIG;
        switch (item.type) {
            case CONSTANTS.ITEM_TYPES.HEAL:
                const heal = CONSTANTS.PLAYER_MAX_HP * config.healAmountRatio;
                player.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, player.hp + heal);
                game.spawnDamageText(player.x, player.y - 20, "HEAL!", "#00ff88");
                break;

            case CONSTANTS.ITEM_TYPES.FREEZE:
                game.freezeTimer = (game.freezeTimer || 0) + config.freezeDurationMs;
                game.spawnDamageText(player.x, player.y - 20, "FREEZE!", "#00ccff");
                break;

            case CONSTANTS.ITEM_TYPES.BOMB:
                this.triggerBomb(item.x, item.y, game);
                game.spawnDamageText(item.x, item.y - 20, "BOOM!", "#ff4400");
                break;
        }
    }

    triggerBomb(x, y, game) {
        const radiusSq = Math.pow(CONSTANTS.ITEM_CONFIG.bombRadius, 2);

        // 範囲内の敵を走査
        for (const e of game.enemies) {
            if (!e.active) continue;
            const dx = e.renderX - x;
            const dy = e.renderY - y;
            const distSq = dx * dx + dy * dy;

            if (distSq < radiusSq) {
                if (e.isBoss) {
                    // ボスは少しだけ削る
                    e.takeDamage(10, { globalBuffActive: false, isAuraProtected: false });
                } else if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) {
                    // エリートは50%削る
                    e.hp *= (1 - CONSTANTS.ITEM_CONFIG.bombEliteDamageRatio);
                    if (e.hp < 1) e.destroy('bomb', game);
                } else {
                    // 雑魚は即死
                    e.destroy('bomb', game);
                }
            }
        }
        // 爆発エフェクト（大）
        Effects.createExplosion(x, y, CONSTANTS.ITEM_CONFIG.bombRadius);
        game.audio.play('explosion');
    }
}
