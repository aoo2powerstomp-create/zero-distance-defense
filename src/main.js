import { CONSTANTS } from './constants.js';
import { Player } from './Player.js';
import { Bullet } from './Bullet.js';
import { Enemy } from './Enemy.js';
import { Gold } from './Gold.js';
import { DamageText } from './DamageText.js';
import { Pool } from './Pool.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // キャンバスサイズ設定
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.player = new Player(CONSTANTS.TARGET_WIDTH / 2, CONSTANTS.TARGET_HEIGHT / 2);

        // オブジェクトプール
        this.bulletPool = new Pool(() => new Bullet(), 100);
        this.enemyPool = new Pool(() => new Enemy(), 100);
        this.goldPool = new Pool(() => new Gold(), 100);
        this.damageTextPool = new Pool(() => new DamageText(), 50);

        // アクティブなエンティティ
        this.bullets = [];
        this.enemies = [];
        this.golds = [];
        this.damageTexts = [];

        this.goldCount = 10000;

        // 統計データ
        this.totalKills = 0;
        this.totalGoldEarned = 0;
        this.currentStage = 0;
        this.killCount = 0;

        // 進行管理
        this.gameState = CONSTANTS.STATE.TITLE;
        this.spawnTimer = 0;
        this.enemiesRemaining = 0; // そのウェーブでスポーンすべき残り数

        this.initUI();
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));

        const upgradePanel = document.getElementById('upgrade-panel');
        if (upgradePanel) upgradePanel.classList.add('hidden');
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    initUI() {
        // タイトル画面：STARTボタン
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                const titleScreen = document.getElementById('title-screen');
                if (titleScreen) titleScreen.classList.add('hidden');
                this.startCountdown();
            });
        }

        // 武器選択ボタン
        document.querySelectorAll('.weapon-up-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-up-weapon');
                const data = this.player.weapons[type];
                const config = CONSTANTS.WEAPON_CONFIG[type];

                if (!data.unlocked) {
                    if (this.goldCount >= config.unlockCost) {
                        this.goldCount -= config.unlockCost;
                        data.unlocked = true;
                        this.player.currentWeapon = type;
                        this.spawnDamageText(this.player.x, this.player.y - 20, "UNLOCKED!", "#ffffff");
                    }
                } else {
                    if (this.player.currentWeapon === type) {
                        const cost = this.calculateCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level);
                        if (this.goldCount >= cost && data.level < CONSTANTS.UPGRADE_LV_MAX) {
                            this.goldCount -= cost;
                            data.level++;
                            this.spawnDamageText(this.player.x, this.player.y - 20, "POWER UP!", "#ffff00");
                        }
                    } else {
                        this.player.currentWeapon = type;
                    }
                }
                this.updateUI();
            });
        });

        // SPEED強化ボタン
        document.getElementById('btn-up-speed').addEventListener('click', () => {
            const type = this.player.currentWeapon;
            const data = this.player.weapons[type];
            const cost = this.calculateCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, data.atkSpeedLv);

            if (this.goldCount >= cost && data.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX) {
                this.goldCount -= cost;
                data.atkSpeedLv++;
                this.spawnDamageText(this.player.x, this.player.y - 20, "SPEED UP!", "#00ff88");
                this.updateUI();
            }
        });

        // 回転操作リスナーの強化：windowリスナーにして枠外も追従、アスペクト比歪みにも対応
        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 仮想空間上の座標へ逆写像（以前の「縦幅合わせ・横中央寄せ」を正確に再現）
            const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
            const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;

            this.player.targetX = (mouseX - offsetX) / scale;
            this.player.targetY = mouseY / scale;
        });

        // リザルト等ボタン
        const btnNext = document.getElementById('btn-next');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (this.gameState === CONSTANTS.STATE.RESULT || this.gameState === CONSTANTS.STATE.GAME_OVER) {
                    location.reload();
                }
            });
        }
    }

    calculateCost(base, lv) {
        return Math.round(base * Math.pow(CONSTANTS.UPGRADE_COST_MUL, lv - 1));
    }

    startWave() {
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];

        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.bullets.forEach(b => this.bulletPool.release(b));
        this.bullets = [];
        this.golds.forEach(g => this.goldPool.release(g));
        this.golds = [];

        this.enemiesRemaining = Math.round(stageData.enemyCount * stageData.spawnMul);
        this.spawnTimer = 0;
        this.killCount = 0;

        if ((this.currentStage + 1) % 5 === 0) {
            this.spawnBoss();
        }

        this.gameState = CONSTANTS.STATE.PLAYING;
        this.updateUI();
    }

    startNextWave() {
        this.currentStage++;
        if (this.currentStage < CONSTANTS.STAGE_DATA.length) {
            this.startCountdown();
        } else {
            this.showOverlay('ALL STAGE CLEAR!', '地球の平和は守られました', 'result');
        }
    }

    startCountdown() {
        this.gameState = CONSTANTS.STATE.COUNTDOWN;
        const overlay = document.getElementById('countdown');
        const text = document.getElementById('countdown-text');
        const sub = document.getElementById('countdown-sub');

        sub.textContent = `STAGE ${this.currentStage + 1}`;
        overlay.classList.remove('hidden');

        let count = 3;
        const process = () => {
            if (count > 0) {
                text.textContent = count;
                count--;
                setTimeout(process, 1000);
            } else if (count === 0) {
                text.textContent = "START!";
                count--;
                setTimeout(process, 1000);
            } else {
                overlay.classList.add('hidden');
                this.startWave();
            }
        };
        process();
    }

    stageClear() {
        this.gameState = CONSTANTS.STATE.WAVE_CLEAR_CUTIN;
        this.enemies.forEach(e => this.enemyPool.release(e));
        this.enemies = [];
        this.showCutIn('STAGE CLEAR!', () => {
            this.startNextWave();
        });
    }

    showCutIn(msg, callback) {
        const overlay = document.getElementById('cut-in');
        const text = document.getElementById('cut-in-text');
        text.textContent = msg;
        overlay.classList.remove('hidden');

        setTimeout(() => {
            overlay.classList.add('hidden');
            if (callback) callback();
        }, 2000);
    }

    showOverlay(title, msg, type = 'wave') {
        const overlay = document.getElementById('overlay');
        const statsArea = document.getElementById('result-stats');

        overlay.classList.remove('hidden');
        document.getElementById('overlay-title').textContent = title;
        document.getElementById('overlay-msg').textContent = msg;

        if (type === 'result') {
            this.gameState = CONSTANTS.STATE.RESULT;
            statsArea.classList.remove('hidden');
            document.getElementById('stat-kills').textContent = this.totalKills;
            document.getElementById('stat-gold').textContent = this.totalGoldEarned;
            document.getElementById('stat-stage').textContent = `STAGE ${this.currentStage + 1}`;
        }
    }

    spawnEnemy() {
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT) return;
        const side = Math.floor(Math.random() * 4);
        let x, y;
        const margin = 50;

        if (side === 0) { x = Math.random() * CONSTANTS.TARGET_WIDTH; y = -margin; }
        else if (side === 1) { x = CONSTANTS.TARGET_WIDTH + margin; y = Math.random() * CONSTANTS.TARGET_HEIGHT; }
        else if (side === 2) { x = Math.random() * CONSTANTS.TARGET_WIDTH; y = CONSTANTS.TARGET_HEIGHT + margin; }
        else { x = -margin; y = Math.random() * CONSTANTS.TARGET_HEIGHT; }

        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const enemy = this.enemyPool.get();
        if (enemy) {
            let type = CONSTANTS.ENEMY_TYPES.NORMAL;
            const rand = Math.random();
            if (rand < 0.15) type = CONSTANTS.ENEMY_TYPES.ZIGZAG;
            else if (rand < 0.3) type = CONSTANTS.ENEMY_TYPES.EVASIVE;

            enemy.init(x, y, this.player.x, this.player.y, type, stageData.hpMul, stageData.speedMul);
            this.enemies.push(enemy);
        }
    }

    spawnBoss() {
        const x = CONSTANTS.TARGET_WIDTH / 2;
        const y = -150;
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
        const boss = this.enemyPool.get();
        if (boss) {
            boss.initBoss(x, y, this.player.x, this.player.y, stageData.hpMul, (bx, by) => {
                this.handleBossSummon(bx, by);
            });
            this.enemies.push(boss);
        }
    }

    handleBossSummon(bx, by) {
        if (this.enemies.length >= CONSTANTS.ENEMY_LIMIT - CONSTANTS.BOSS_SUMMON_COUNT) return;
        const stageData = CONSTANTS.STAGE_DATA[this.currentStage];

        for (let i = 0; i < CONSTANTS.BOSS_SUMMON_COUNT; i++) {
            const enemy = this.enemyPool.get();
            if (enemy) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 120 + Math.random() * 60;
                const sx = bx + Math.cos(angle) * dist;
                const sy = by + Math.sin(angle) * dist;
                enemy.init(sx, sy, this.player.x, this.player.y, CONSTANTS.ENEMY_TYPES.NORMAL, stageData.hpMul * 0.5, stageData.speedMul);
                this.enemies.push(enemy);
            }
        }
    }

    shoot() {
        if (this.bullets.length >= CONSTANTS.BULLET_LIMIT) return;
        const weaponType = this.player.currentWeapon;
        const stats = this.player.getWeaponStats();

        if (weaponType === CONSTANTS.WEAPON_TYPES.SHOT) {
            const angles = [this.player.angle, this.player.angle - 0.2, this.player.angle + 0.2];
            angles.forEach(angle => {
                if (this.bullets.length < CONSTANTS.BULLET_LIMIT) {
                    const b = this.bulletPool.get();
                    b.init(this.player.x, this.player.y, angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType);
                    this.bullets.push(b);
                }
            });
        } else {
            const b = this.bulletPool.get();
            b.init(this.player.x, this.player.y, this.player.angle, stats.speed, stats.damage, stats.pierce, stats.lifetime, weaponType);
            this.bullets.push(b);
        }
    }

    spawnDamageText(x, y, text, color) {
        if (!CONSTANTS.SHOW_DAMAGE_NUMBERS) return;
        if (this.damageTexts.length < CONSTANTS.DAMAGE_TEXT_LIMIT) {
            const dt = this.damageTextPool.get();
            dt.init(x, y, text, color);
            this.damageTexts.push(dt);
        }
    }

    update(dt) {
        if (this.gameState === CONSTANTS.STATE.TITLE || this.gameState === CONSTANTS.STATE.COUNTDOWN || this.gameState === CONSTANTS.STATE.RESULT) return;

        if (this.gameState === CONSTANTS.STATE.WAVE_CLEAR_CUTIN) {
            this.player.update(dt);
            this.bullets.forEach(b => b.update());
            this.golds.forEach(g => g.update(this.player.x, this.player.y));
            this.damageTexts.forEach(d => d.update());
            this.cleanupEntities();
            return;
        }

        if (this.gameState !== CONSTANTS.STATE.PLAYING) return;

        this.player.update(dt);
        this.player.shootTimer += dt;
        const weaponStats = this.player.getWeaponStats();
        if (this.player.shootTimer >= weaponStats.cooldown) {
            this.shoot();
            this.player.shootTimer = 0;
        }

        const isBossStage = (this.currentStage + 1) % 5 === 0;
        const hasBoss = this.enemies.some(e => e.isBoss);

        if (!isBossStage && this.enemiesRemaining > 0) {
            const stageData = CONSTANTS.STAGE_DATA[this.currentStage];
            this.spawnTimer += dt;
            if (this.spawnTimer >= stageData.spawnInterval) {
                this.spawnEnemy();
                this.spawnTimer = 0;
                this.enemiesRemaining--;
            }
        }

        this.bullets.forEach(b => b.update());
        this.enemies.forEach(e => e.update(this.player.x, this.player.y, this.player.angle, dt));
        this.golds.forEach(g => g.update(this.player.x, this.player.y));
        this.damageTexts.forEach(d => d.update());

        this.handleCollisions();
        this.cleanupEntities();

        if (isBossStage) {
            // ボスステージではボスが死んでいれば handleCollisions 内で stageClear が呼ばれる
        } else {
            if (this.enemiesRemaining <= 0 && this.enemies.length === 0) {
                this.stageClear();
            }
        }

        if (this.player.hp <= 0) {
            this.showOverlay('GAME OVER', '基地が破壊されました', 'result');
        }

        this.updateUI();
    }

    handleCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active) continue;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.active) continue;

                const dx = b.x - e.renderX;
                const dy = b.y - e.renderY;
                const distSq = dx * dx + dy * dy;
                const size = e.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
                const minDist = CONSTANTS.BULLET_SIZE + size;

                if (distSq < minDist * minDist) {
                    e.takeDamage(b.damage);
                    this.spawnDamageText(e.renderX, e.renderY, Math.round(b.damage), '#fff');

                    const weaponConfig = CONSTANTS.WEAPON_CONFIG[b.weaponType];
                    const knockPower = CONSTANTS.ENEMY_KNOCKBACK_POWER * weaponConfig.knockMul;
                    e.applyKnockback(b.vx, b.vy, knockPower);

                    if (b.weaponType === CONSTANTS.WEAPON_TYPES.STANDARD) {
                        const recoverAmount = CONSTANTS.PLAYER_MAX_HP * CONSTANTS.STANDARD_RECOVERY_ON_HIT;
                        this.player.hp = Math.min(CONSTANTS.PLAYER_MAX_HP, this.player.hp + recoverAmount);
                    }

                    if (e.hp <= 0) {
                        const gold = this.goldPool.get();
                        gold.init(e.renderX, e.renderY);
                        this.golds.push(gold);
                        this.totalKills++;
                        e.active = false;
                        if (e.isBoss) {
                            this.stageClear();
                            return;
                        }
                    }

                    b.pierceCount--;
                    if (b.pierceCount < 0) {
                        b.active = false;
                        break;
                    }
                }
            }
        }

        const now = Date.now();
        this.enemies.forEach(e => {
            if (!e.active) return;
            const dx = this.player.x - e.renderX;
            const dy = this.player.y - e.renderY;
            const distSq = dx * dx + dy * dy;
            const size = e.isBoss ? CONSTANTS.ENEMY_SIZE * CONSTANTS.BOSS_SIZE_MUL : CONSTANTS.ENEMY_SIZE;
            const minDist = CONSTANTS.PLAYER_SIZE + size;

            if (distSq < minDist * minDist) {
                if (now - e.lastContactTime > CONSTANTS.ENEMY_CONTACT_COOLDOWN_MS) {
                    this.player.takeDamage(CONSTANTS.ENEMY_DAMAGE_RATIO);
                    this.spawnDamageText(this.player.x, this.player.y, '!', '#ff0000');
                    e.lastContactTime = now;
                }
            }
        });

        for (let k = this.golds.length - 1; k >= 0; k--) {
            const g = this.golds[k];
            const dx = this.player.x - g.x;
            const dy = this.player.y - g.y;
            const distSq = dx * dx + dy * dy;
            const minDist = CONSTANTS.PLAYER_SIZE + CONSTANTS.GOLD_SIZE / 2;
            if (distSq < minDist * minDist) {
                this.goldCount += 10;
                this.totalGoldEarned += 10;
                this.goldPool.release(this.golds.splice(k, 1)[0]);
            }
        }
    }

    cleanupEntities() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.active || b.x < -100 || b.x > CONSTANTS.TARGET_WIDTH + 100 || b.y < -100 || b.y > CONSTANTS.TARGET_HEIGHT + 100) {
                this.bulletPool.release(this.bullets.splice(i, 1)[0]);
            }
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.active || e.x < -300 || e.x > CONSTANTS.TARGET_WIDTH + 300 || e.y < -300 || e.y > CONSTANTS.TARGET_HEIGHT + 300) {
                this.enemyPool.release(this.enemies.splice(i, 1)[0]);
            }
        }
        for (let i = this.damageTexts.length - 1; i >= 0; i--) {
            if (!this.damageTexts[i].active) {
                this.damageTextPool.release(this.damageTexts.splice(i, 1)[0]);
            }
        }
    }

    updateUI() {
        const hpPercent = (this.player.hp / CONSTANTS.PLAYER_MAX_HP) * 100;
        document.getElementById('hp-bar-fill').style.width = Math.max(0, hpPercent) + '%';
        document.getElementById('gold-count').textContent = this.goldCount;
        document.getElementById('stage-info').textContent = `STAGE ${this.currentStage + 1}`;

        document.querySelectorAll('.weapon-up-btn').forEach(btn => {
            const type = btn.getAttribute('data-up-weapon');
            const data = this.player.weapons[type];
            const config = CONSTANTS.WEAPON_CONFIG[type];
            const lvSpan = btn.querySelector('.up-slot-lv');
            const costSpan = btn.querySelector('.up-slot-cost');
            btn.classList.toggle('active', this.player.currentWeapon === type);

            if (!data.unlocked) {
                lvSpan.textContent = 'LOCK';
                costSpan.textContent = `${config.unlockCost} G`;
                btn.classList.toggle('disabled', this.goldCount < config.unlockCost);
            } else {
                const cost = this.calculateCost(CONSTANTS.UPGRADE_WEAPON_BASE, data.level);
                lvSpan.textContent = `Lv.${data.level}`;
                costSpan.textContent = data.level < CONSTANTS.UPGRADE_LV_MAX ? `${cost} G` : 'MAX';
                btn.classList.toggle('disabled', this.goldCount < cost && data.level < CONSTANTS.UPGRADE_LV_MAX);
            }
        });

        const cur = this.player.weapons[this.player.currentWeapon];
        const spdCost = this.calculateCost(CONSTANTS.UPGRADE_ATK_SPEED_BASE, cur.atkSpeedLv);
        document.getElementById('speed-up-lv').textContent = cur.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX ? `Lv.${cur.atkSpeedLv}` : 'MAX';
        document.getElementById('cost-speed').textContent = cur.atkSpeedLv < CONSTANTS.UPGRADE_LV_MAX ? `${spdCost} G` : 'MAX';
        document.getElementById('btn-up-speed').classList.toggle('disabled', this.goldCount < spdCost || cur.atkSpeedLv >= CONSTANTS.UPGRADE_LV_MAX);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // 以前の挙動を再現：縦幅を基準にスケールを決め、横方向は中央寄せ（入り切らない分はクリップされる）
        const scale = this.canvas.height / CONSTANTS.TARGET_HEIGHT;
        const offsetX = (this.canvas.width - CONSTANTS.TARGET_WIDTH * scale) / 2;

        this.ctx.translate(offsetX, 0);
        this.ctx.scale(scale, scale);

        // 背景矩形（描画可能エリアの境界）
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, CONSTANTS.TARGET_WIDTH, CONSTANTS.TARGET_HEIGHT);

        this.bullets.forEach(b => b.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        this.golds.forEach(g => g.draw(this.ctx));
        this.damageTexts.forEach(d => d.draw(this.ctx));
        this.player.draw(this.ctx);

        this.ctx.restore();
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        let dt = time - this.lastTime;
        this.lastTime = time;
        if (dt > 100 || isNaN(dt)) dt = 16.6;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

new Game();
