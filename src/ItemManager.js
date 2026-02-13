/**
 * ItemManager.js
 * ドロップアイテム（HEAL, FREEZE, BOMB）の管理
 */
import { CONSTANTS } from './constants.js';
import { Effects } from './Effects.js';

export class ItemManager {
    constructor(game) {
        this.items = []; // {type, x, y, life, active}
        this.game = game;
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

        // レアリティ判定
        const isRare = Math.random() < (CONSTANTS.ITEM_CONFIG.RARE_RATE || 0);
        const table = isRare ? CONSTANTS.ITEM_TABLE.RARE : CONSTANTS.ITEM_TABLE.COMMON;

        // 重み付け抽選
        const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
        let r = Math.random() * totalWeight;
        let type = table[0].key; // default

        for (const entry of table) {
            r -= entry.weight;
            if (r <= 0) {
                type = entry.key; // 'heal', 'overdrive', etc.
                break;
            }
        }

        // 値の厳密なマッピング (定数定義の値を採用)
        // CONSTANTS.ITEM_TYPES 内の値を検索して割り当てる (keyとvalueが一致している前提だが念のため)
        // ここでは table.key がそのまま type になる

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
                    if (this.game) this.applyEffect(item, this.game.player, this.game);
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

            // レアリティ確認
            const def = CONSTANTS.ITEM_DEFS[item.type];
            const isRare = def && def.rarity === 'RARE';

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

            // レアエフェクト（背面グロー）
            if (isRare) {
                const pulse = (Math.sin(Date.now() / 150) + 1) * 0.5; // 高速点滅
                ctx.shadowBlur = 15 + pulse * 10;
                ctx.shadowColor = visual.color; // アイテム色で光らせる
            } else {
                ctx.shadowBlur = 0;
            }

            // アセット描画
            let assetKey = null;
            switch (item.type) {
                case CONSTANTS.ITEM_TYPES.HEAL: assetKey = 'ITEM_HEAL'; break;
                case CONSTANTS.ITEM_TYPES.FREEZE: assetKey = 'ITEM_FREEZE'; break;
                case CONSTANTS.ITEM_TYPES.BOMB: assetKey = 'ITEM_BOMB'; break;
                case CONSTANTS.ITEM_TYPES.OVERDRIVE: assetKey = 'ITEM_OVERDRIVE'; break;
                case CONSTANTS.ITEM_TYPES.INVINCIBLE: assetKey = 'ITEM_INVINCIBLE'; break;
                case CONSTANTS.ITEM_TYPES.NUKE: assetKey = 'ITEM_NUKE'; break;
            }

            const asset = (this.game && this.game.assetLoader) ? this.game.assetLoader.get(assetKey || '') : null;

            if (asset) {
                const size = radius * 1.96; // 2.8 * 0.7 = 1.96
                ctx.drawImage(asset, drawX - size / 2, drawY - size / 2, size, size);
            } else {
                // 本体円 - 不透明度を少し下げて背景となじませつつ色を出す
                ctx.beginPath();
                ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
                ctx.fillStyle = visual.color;
                ctx.globalAlpha = 0.8; // 色を濃く出す
                ctx.fill();
                ctx.globalAlpha = item.visualAlpha; // 戻す

                // 輪郭 - RAREなら金、通常は白
                ctx.beginPath();
                ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
                ctx.strokeStyle = isRare ? '#ffd700' : '#ffffff';
                ctx.lineWidth = isRare ? 3 : 2;
                ctx.stroke();

                // アイコン描画 (画像がない場合のみ)
                ctx.font = `bold ${Math.floor(radius * 1.2)}px Orbitron`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.lineWidth = 3;
                ctx.strokeStyle = '#000000';
                ctx.strokeText(visual.icon, drawX, drawY + radius * 0.1);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(visual.icon, drawX, drawY + radius * 0.1);
            }

            ctx.shadowBlur = 0; // リセット

            // RAREテキスト
            if (isRare && item.state !== 'pickup' && !asset) { // 画像がない場合のみテキスト表示
                ctx.font = 'bold 10px Orbitron';
                ctx.fillStyle = '#ffd700';
                ctx.fillText("RARE", drawX, drawY - radius - 5);
            }
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
                // ただし、BOMB/NUKEは即時発動
                const isInstant = item.type === CONSTANTS.ITEM_TYPES.BOMB || item.type === CONSTANTS.ITEM_TYPES.NUKE;

                if (isInstant) {
                    if (item.state !== 'pickup' && item.active) {
                        item.active = false;
                        const soundKey = (item.type === CONSTANTS.ITEM_TYPES.HEAL) ? 'upgrade' : 'item_pickup';
                        game.audio.play(soundKey, { priority: 'high' });
                        this.applyEffect(item, player, game);
                        return true;
                    }
                }

                if (item.state !== 'pickup') {
                    item.state = 'pickup';
                    item.animTimer = 0;
                    item.pickupTarget = player; // プレイヤーへ吸い込み

                    // 取得SE
                    const soundKey = (item.type === CONSTANTS.ITEM_TYPES.HEAL) ? 'upgrade' : 'item_pickup';
                    game.audio.play(soundKey, { priority: 'high' });

                    // this.update 内で完了時に applyEffect されるように game 参照を保持
                    // (コンストラクタで渡された this.game を既に使用している)

                    return true;
                }
            }
        }
        return false;
    }

    applyEffect(item, player, game) {
        // アイテム使用カウント (Result用)
        if (game.recordItemUse) {
            game.recordItemUse();
        }

        // ポップエフェクト
        const visual = CONSTANTS.ITEM_VISUALS[item.type];
        Effects.createRing(item.x, item.y, visual ? visual.color : '#fff');
        Effects.spawnHitEffect(item.x, item.y, 1); // Smallエフェクト相当

        const config = CONSTANTS.ITEM_CONFIG;
        const def = CONSTANTS.ITEM_DEFS[item.type]; // 定義参照

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

            case CONSTANTS.ITEM_TYPES.OVERDRIVE:
                // スタック（延長）処理
                const now = Date.now();
                const currentEnd = Math.max(now, player.overdriveUntilMs);
                let newEnd = currentEnd + def.durationMs;
                // 上限キャップ
                if (newEnd > now + def.maxDurationMs) {
                    newEnd = now + def.maxDurationMs;
                }
                player.overdriveUntilMs = newEnd;
                game.spawnDamageText(player.x, player.y - 35, "OVERDRIVE!", visual.color);
                break;

            case CONSTANTS.ITEM_TYPES.INVINCIBLE:
                // スタック（延長）処理
                const nowI = Date.now();
                const currentEndI = Math.max(nowI, player.invincibleUntilMs);
                let newEndI = currentEndI + def.durationMs;
                // 上限キャップ
                if (newEndI > nowI + def.maxDurationMs) {
                    newEndI = nowI + def.maxDurationMs;
                }
                player.invincibleUntilMs = newEndI;
                game.spawnDamageText(player.x, player.y - 35, "INVINCIBLE!", visual.color);
                break;

            case CONSTANTS.ITEM_TYPES.NUKE:
                this.triggerNuke(game);
                game.spawnDamageText(player.x, player.y - 35, "NUKE!", visual.color);
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

    triggerNuke(game) {
        // 全画面攻撃
        // 支援タイプ（SHIELDER/GUARDIAN）、ボスは除外
        let count = 0;

        // 画面フラッシュ演出（仮に爆発エフェクトをプレイヤー中心に特大で出す）
        Effects.createExplosion(game.player.x, game.player.y, 800);
        game.audio.play('explosion'); // 重ねて再生

        for (const e of game.enemies) {
            if (!e.active) continue;

            // 対象外チェック
            if (e.isBoss || e.type === CONSTANTS.ENEMY_TYPES.SHIELDER || e.type === CONSTANTS.ENEMY_TYPES.GUARDIAN) {
                continue;
            }

            if (e.type === CONSTANTS.ENEMY_TYPES.ELITE) {
                // エリートはHP半減
                e.hp *= 0.5;
                game.spawnDamageText(e.x, e.y, "NUKE", "#aa00ff");
            } else {
                // 雑魚即死
                e.destroy('nuke', game);
                count++;
            }
        }
        console.log(`NUKE activated: ${count} enemies destroyed.`);
    }
}

