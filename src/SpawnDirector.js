import { CONSTANTS } from './constants.js';
import { DEBUG_ENABLED } from './utils/env.js';
import { Enemy } from './Enemy.js';

export class SpawnDirector {
    constructor(game) {
        this.game = game;
        this.phase = 'A'; // A: Pressure, B: Harass, C: Gimmick
        this.phaseTimer = 0;

        // メインのスポーン間隔タイマー
        this.spawnTimer = 0;

        this.currentPlan = {
            mainRole: 'CORE',
            subRole: 'HARASSER',
            pattern: 'RANDOM',
            mainType: CONSTANTS.ENEMY_TYPES.NORMAL
        };

        // 初期化
        this.resetForStage();
    }

    resetForStage() {
        this.phase = 'A';
        this.phaseTimer = 10000;
        this.spawnTimer = 1000;

        // Roster保証 (Unlock済みの敵をリストアップ)
        this.rosterWanted = this.getUnlockedEnemyTypes();
        // 重複抑制履歴 (直近8件)
        this.recentTypes = [];
        this.stageStartTime = Date.now();

        // Merihari (Burst/Lull)
        this.intensity = 'BURST';
        this.intensityTimer = 15000;

        // Budget (初期値はステージ依存)
        const stageFn = CONSTANTS.STAGE_BUDGET_REFILL[this.game.currentStage + 1] || 1;
        this.specialBudget = stageFn * 2; // 開幕は少し多めに
        this.budgetTimer = 15000; // 15秒ごとに補充

        this.formationQueue = [];
        this.cooldowns = {}; // { type: timeMs }

        this.enterBurst();
        this.buildPlan();
    }

    getUnlockedEnemyTypes() {
        const stage = this.game.currentStage + 1;
        const types = [];

        // CONSTANTSからUnlock情報を走査してリスト化してもいいが、
        // ここでは主要なものを手動またはロジックで拾う
        Object.entries(CONSTANTS).forEach(([key, val]) => {
            if (val && typeof val === 'object' && val.unlockStage) {
                if (stage >= val.unlockStage) {
                    // キー名とENEMY_TYPESの対応が必要だが、
                    // CONSTANTS.ENEMY_TYPES[key] があればそれを使う
                    if (CONSTANTS.ENEMY_TYPES[key]) {
                        types.push(CONSTANTS.ENEMY_TYPES[key]);
                    }
                }
            }
        });

        // 基本タイプは常に入れる
        if (!types.includes(CONSTANTS.ENEMY_TYPES.NORMAL)) types.push(CONSTANTS.ENEMY_TYPES.NORMAL);
        if (stage >= 2 && !types.includes(CONSTANTS.ENEMY_TYPES.ZIGZAG)) types.push(CONSTANTS.ENEMY_TYPES.ZIGZAG);
        if (stage >= 2 && !types.includes(CONSTANTS.ENEMY_TYPES.EVASIVE)) types.push(CONSTANTS.ENEMY_TYPES.EVASIVE);

        // 3つだけ選ぶ (ランダム)
        // 全部出そうとすると無理があるので、「見せたい枠」としてランダムに3つ
        const selected = [];
        const count = 3;
        for (let i = 0; i < count; i++) {
            if (types.length === 0) break;
            const idx = Math.floor(Math.random() * types.length);
            selected.push(types[idx]);
            types.splice(idx, 1);
        }
        return selected;
    }

    update(dt) {
        if (this.game.gameState !== CONSTANTS.STATE.PLAYING) return;
        if (dt <= 0.001) return; // Prevent updates when paused or extremely slow

        // 1. クールダウン更新
        for (const type in this.cooldowns) {
            if (this.cooldowns[type] > 0) {
                this.cooldowns[type] -= dt;
                if (this.cooldowns[type] < 0) this.cooldowns[type] = 0;
            }
        }

        // 2. 予算補充
        this.budgetTimer -= dt;
        if (this.budgetTimer <= 0) {
            this.budgetTimer = 15000;
            const refill = CONSTANTS.STAGE_BUDGET_REFILL[this.game.currentStage + 1] || 1;
            this.specialBudget = Math.min(this.specialBudget + refill, 10); // キャップ10
            this.log('BUDGET', `Refill +${refill}`, `Current: ${this.specialBudget}`);
        }

        // 3. フェーズ更新
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.nextPhase();

        // 4. Intensity更新
        this.intensityTimer -= dt;
        if (this.intensityTimer <= 0) {
            if (this.intensity === 'BURST') this.enterLull();
            else this.enterBurst();
        }

        // 5. スポーン処理
        // 完了条件チェック
        if (this.game.enemiesRemaining <= 0 && this.formationQueue.length === 0) return;

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            // 隊列優先
            if (this.formationQueue.length > 0) {
                this.processFormationQueue();
            } else {
                this.trySpawn();
            }
        }
    }

    processFormationQueue() {
        const task = this.formationQueue[0];
        // 隊列はリズムよく出したいので、spawnTimerを固定値で上書き
        // taskにdelayがあるならそれを使うが、queue構造をシンプルにしたので固定リズム推奨

        // 座標指定などがQueueに入っている前提
        this.executeSpawn(task.type, task.pattern, task.x, task.y);

        this.formationQueue.shift();

        // 次の間隔 (Burst中は速く)
        this.spawnTimer = (task.nextDelay !== undefined) ? task.nextDelay : 220;
    }

    trySpawn() {
        const stage = this.game.currentStage + 1;

        // 次のスポーン間隔を設定
        this.setNextSpawnInterval();

        // --- ステージ別出現数キャップ ---

        // --- ステージ別出現数キャップ ---
        // --- ステージ別出現数キャップ ---
        let cap = CONSTANTS.ENEMY_LIMIT;
        const elapsed = (Date.now() - this.stageStartTime) / 1000;

        if (stage === 1) {
            // Stage 1: 1 -> 2 -> 3 -> 4 -> 5 (User Request)
            if (elapsed < 10) cap = 1;
            else if (elapsed < 20) cap = 2;
            else if (elapsed < 30) cap = 3;
            else if (elapsed < 45) cap = 4;
            else cap = 5;
        } else if (stage === 2) {
            // Stage 2: 3 -> 5 -> 8
            if (elapsed < 15) cap = 3;
            else if (elapsed < 30) cap = 5;
            else cap = 8;
        } else if (stage === 3) {
            // Stage 3: 5 -> 10 -> 16
            if (elapsed < 15) cap = 5;
            else if (elapsed < 40) cap = 10;
            else cap = 16;
        } else if (stage === 4) {
            // Stage 4: 10 -> 20 -> 32
            if (elapsed < 20) cap = 10;
            else if (elapsed < 50) cap = 20;
            else cap = 32;
        } else if (stage === 5) {
            // Stage 5: 20 -> 40 -> 60
            if (elapsed < 20) cap = 20;
            else if (elapsed < 50) cap = 40;
            else cap = 60;
        } else {
            // Stage 6+: Linear ramp up to Max
            const progress = Math.min(1.0, elapsed / 60);
            cap = Math.floor(CONSTANTS.ENEMY_LIMIT * (0.3 + 0.7 * progress));
        }

        if (this.game.enemies.length >= cap) {
            return;
        }

        // 候補選定
        // 現在のプラン + Roster + Budget を考慮
        const candidates = this.buildCandidateList();

        // 決定
        const type = this.pickTypeWeighted(candidates);

        if (type) {
            // コスト計算
            const role = CONSTANTS.ENEMY_ROLES[type] || 'CORE';
            const cost = CONSTANTS.SPAWN_COSTS[role] || 0;
            // 予算のみでフィルタしているので、ここでは消費するだけ
            if (cost > 0) {
                this.specialBudget = Math.max(0, this.specialBudget - cost);
            }

            this.executeSpawn(type, this.currentPlan.pattern);
            this.log('SPAWN', type, `Role:${role} Budget:${this.specialBudget}`);
        } else {
            // 候補なし (全員Cooldown or Limit)
            // COREなら出せるはずだが、それすらダメならスキップ
        }
    }

    buildCandidateList() {
        const candidates = [];
        const stage = this.game.currentStage + 1;
        const counts = this.game.frameCache.roleCounts;
        const typeCounts = this.game.frameCache.typeCounts;

        // すべてのアンロック済み敵タイプを走査して、出せるものをリストアップ
        // (効率化のため、主要なものだけチェックするか、CONSTANTSを見る)

        // ここではPlanにある Main/Sub を優先しつつ、
        // Budgetがあれば Special も混ぜる

        // 簡易実装: Planに関係なく「出せる敵」を全部リストアップし、pickTypeで重み付けする
        // (PlanのMainRoleには高ボーナスを与える)

        const allTypes = Object.values(CONSTANTS.ENEMY_TYPES);

        for (const type of allTypes) {
            // Unlock check (CONSTANTS.XXX.unlockStage looking is hard here because type is 'A','B' string)
            // We need reverse mapping or define basic set.
            // Let's use getEnemyInfo or simple hardcoded range checks for safety or helper
            if (!this.isUnlocked(type)) continue;

            const role = CONSTANTS.ENEMY_ROLES[type] || 'CORE';
            const cost = CONSTANTS.SPAWN_COSTS[role] || 0;

            // 1. Budget Check
            if (cost > 0 && this.specialBudget < cost) continue; // 予算不足なら除外

            // 2. Cooldown Check
            if (this.cooldowns[type] && this.cooldowns[type] > 0) continue;

            // 3. Role Limit Check
            const roleLimit = CONSTANTS.ROLE_LIMITS[role] || 999;
            if ((counts[role] || 0) >= roleLimit) continue;

            // 4. Type Limit Check
            const typeLimit = CONSTANTS.TYPE_LIMITS[Object.keys(CONSTANTS.ENEMY_TYPES).find(k => CONSTANTS.ENEMY_TYPES[k] === type)];
            // ↑これは逆引きが重いので、定数定義を工夫すべきだが、
            // ここでは CONSTANTS.TYPE_LIMITS は 'SHIELDER' キーなどで定義されている。
            // type string ('F') から 'SHIELDER' を引く必要がある。
            // 面倒なので TYPE_LIMITS のキーを ID ('F') に変換して持っておくのがベスト。
            // しかし今は CONSTANTS.SHIELDER 等から情報を取れる。

            // 修正: TYPE_LIMITS は ID ベースで再定義するか、ここで変換する。
            // 今回は TYPE_LIMITS を使わず、個別にチェックするロジックにするか、
            // ヘルパーメソッドでチェックする。
            if (!this.checkTypeLimit(type, typeCounts)) continue;

            candidates.push(type);
        }

        // もし候補が空（Budget不足など）なら、CORE (Cost 0) だけは再チェックして入れる
        if (candidates.length === 0) {
            if (counts['CORE'] < CONSTANTS.ROLE_LIMITS['CORE']) {
                candidates.push(CONSTANTS.ENEMY_TYPES.NORMAL);
            }
        }

        return candidates;
    }

    isUnlocked(type) {
        // 簡易判定
        const stage = this.game.currentStage + 1;

        // マッピング (本来はCONSTANTSから自動生成すべき)
        const unlockMap = {
            [CONSTANTS.ENEMY_TYPES.ZIGZAG]: 2,
            [CONSTANTS.ENEMY_TYPES.EVASIVE]: 2,
            [CONSTANTS.ENEMY_TYPES.TRICKSTER]: 2,
            [CONSTANTS.ENEMY_TYPES.ELITE]: 2,
            [CONSTANTS.ENEMY_TYPES.ASSAULT]: 3,
            [CONSTANTS.ENEMY_TYPES.SPLITTER]: 4,
            [CONSTANTS.ENEMY_TYPES.FLANKER]: 4,
            [CONSTANTS.ENEMY_TYPES.SHIELDER]: 5,
            [CONSTANTS.ENEMY_TYPES.DASHER]: 5,
            [CONSTANTS.ENEMY_TYPES.ORBITER]: 5,
            [CONSTANTS.ENEMY_TYPES.ATTRACTOR]: 5,
            [CONSTANTS.ENEMY_TYPES.BARRIER_PAIR]: 6,
            [CONSTANTS.ENEMY_TYPES.OBSERVER]: 6,
            [CONSTANTS.ENEMY_TYPES.REFLECTOR]: 7,
            [CONSTANTS.ENEMY_TYPES.GUARDIAN]: 8
        };

        const req = unlockMap[type] || 1;
        return stage >= req;
    }

    checkTypeLimit(type, currentCounts) {
        // CONSTANTS.TYPE_LIMITS はキー名(SHIELDER等)で定義されている。
        // type (ID) -> Key Name の変換が必要。
        // 負荷軽減のため、switchで書く
        let limit = 999;

        // 下記は記述量削減のため一部省略、主要なもののみ
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) limit = CONSTANTS.TYPE_LIMITS.SHIELDER;
        else if (type === CONSTANTS.ENEMY_TYPES.ORBITER) limit = CONSTANTS.TYPE_LIMITS.ORBITER;
        else if (type === CONSTANTS.ENEMY_TYPES.DASHER) limit = CONSTANTS.TYPE_LIMITS.DASHER;
        else if (type === CONSTANTS.ENEMY_TYPES.SPLITTER) limit = CONSTANTS.TYPE_LIMITS.SPLITTER;
        else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) limit = CONSTANTS.TYPE_LIMITS.GUARDIAN;
        else if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) limit = CONSTANTS.TYPE_LIMITS.BARRIER_PAIR;
        else if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) limit = CONSTANTS.TYPE_LIMITS.OBSERVER;

        return (currentCounts[type] || 0) < limit;
    }

    pickTypeWeighted(candidates) {
        if (!candidates || candidates.length === 0) return null;

        // 1. Roster保証 (最優先)
        const elapsed = (Date.now() - this.stageStartTime) / 1000;
        if (elapsed < 60 && this.rosterWanted.length > 0) {
            const rosterMatch = candidates.find(c => this.rosterWanted.includes(c));
            if (rosterMatch) {
                // Rosterからは削除
                this.rosterWanted = this.rosterWanted.filter(r => r !== rosterMatch);
                return rosterMatch;
            }
        }

        // 2. 重み付け抽選
        let totalWeight = 0;
        const weights = candidates.map(type => {
            let w = 1.0;

            // User Request: NORMAL spawn rate 40-50%
            if (type === CONSTANTS.ENEMY_TYPES.NORMAL) w = 0.5;

            // Plan Bonus
            if (type === this.currentPlan.mainType) w *= 3.0;

            // Anti-Streak (Recent History)
            const streakCount = this.recentTypes.filter(t => t === type).length;
            if (streakCount === 1) w *= 0.25;
            else if (streakCount >= 2) w *= 0.10;

            // 3連続禁止 (実際にはcandidatesに残っていても選ばれないように極小にするか、0にする)
            // ただしここでは 0.10 で残す（完全に詰むのを防ぐため）

            totalWeight += w;
            return { type, weight: w };
        });

        const r = Math.random() * totalWeight;
        let s = 0;
        for (const item of weights) {
            s += item.weight;
            if (r < s) return item.type;
        }

        return candidates[0]; // Fallback
    }

    executeSpawn(type, pattern, overrideX = null, overrideY = null) {
        // Cooldown設定 (ID -> Key変換がここでも必要だが、Switchで)
        this.setCooldown(type);

        // 履歴更新
        this.recentTypes.push(type);
        if (this.recentTypes.length > 8) this.recentTypes.shift();

        // SpawnDirector側での座標計算 (簡易版)
        let x = overrideX || 0;
        let y = overrideY || 0;

        if (overrideX === null) {
            // 通常ランダム座標 (簡易)
            const margin = 50;
            const w = CONSTANTS.TARGET_WIDTH;
            const h = CONSTANTS.TARGET_HEIGHT;
            if (Math.random() < 0.5) {
                x = Math.random() * w;
                y = Math.random() < 0.5 ? -margin : h + margin;
            } else {
                x = Math.random() < 0.5 ? -margin : w + margin;
                y = Math.random() * h;
            }
        }

        // Game側へ委譲
        const stageData = CONSTANTS.STAGE_DATA[this.game.currentStage];
        const enemy = this.game.enemyPool.get();
        if (!enemy) return;

        enemy.init(x, y, this.game.player.x, this.game.player.y, type, stageData.hpMul, stageData.speedMul);
        enemy.id = Enemy.nextId++;
        enemy.age = 0;
        enemy.oobFrames = 0;

        this.game.enemies.push(enemy);
        this.game.enemiesRemaining--;
        this.game.currentSpawnBudget--;

        if (this.game.debugEnabled) {
            // console.log(`[SPAWN OK] id:${enemy.id} stage:${this.game.currentStage + 1} rem:${this.game.enemiesRemaining + 1}->${this.game.enemiesRemaining} type:${type} total:${this.game.enemies.length}`);
        }

        // 特殊: Barrier Pair
        if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) {
            const partner = this.game.enemyPool.get();
            if (partner) {
                partner.init(x + 40, y + 40, this.game.player.x, this.game.player.y, type, stageData.hpMul, stageData.speedMul);
                partner.id = Enemy.nextId++;
                partner.age = 0;
                partner.oobFrames = 0;

                this.game.enemies.push(partner);
                enemy.partner = partner;
                partner.partner = enemy;
                this.game.enemiesRemaining--;
                this.game.currentSpawnBudget--;
                if (this.game.debugEnabled) {
                    // console.log(`[SPAWN OK] (PARTNER) id:${partner.id} stage:${this.game.currentStage + 1} rem:${this.game.enemiesRemaining + 1}->${this.game.enemiesRemaining} type:${type} total:${this.game.enemies.length}`);
                }
            }
        }
    }

    setCooldown(type) {
        let cd = 0;
        if (type === CONSTANTS.ENEMY_TYPES.SHIELDER) cd = CONSTANTS.SPAWN_COOLDOWNS.SHIELDER;
        else if (type === CONSTANTS.ENEMY_TYPES.GUARDIAN) cd = CONSTANTS.SPAWN_COOLDOWNS.GUARDIAN;
        else if (type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR) cd = CONSTANTS.SPAWN_COOLDOWNS.BARRIER_PAIR;
        else if (type === CONSTANTS.ENEMY_TYPES.OBSERVER) cd = CONSTANTS.SPAWN_COOLDOWNS.OBSERVER;
        else if (type === CONSTANTS.ENEMY_TYPES.DASHER) cd = CONSTANTS.SPAWN_COOLDOWNS.DASHER;
        else if (type === CONSTANTS.ENEMY_TYPES.ATTRACTOR) cd = CONSTANTS.SPAWN_COOLDOWNS.ATTRACTOR;

        if (cd > 0) {
            this.cooldowns[type] = cd * 1000; // ms変換
        }
    }

    setNextSpawnInterval() {
        const stage = this.game.currentStage + 1;
        let base = 200; // default

        // Burst/Lull
        if (this.intensity === 'BURST') {
            base = 140 + Math.random() * 80;
        } else {
            base = 280 + Math.random() * 120;
        }

        // Stage補正 (Stage 2-4は遅く)
        if (stage === 2) base *= 1.8;
        else if (stage === 3) base *= 1.5;
        else if (stage === 4) base *= 1.2;

        this.spawnTimer = base;
    }

    enterBurst() {
        this.intensity = 'BURST';
        this.intensityTimer = 10000 + Math.random() * 8000;

        // 隊列イベントチャンス (30%)
        if (this.game.currentStage >= 1 && Math.random() < 0.3) {
            this.queueFormation();
        }
    }

    enterLull() {
        this.intensity = 'LULL';
        this.intensityTimer = 6000 + Math.random() * 4000;
    }

    nextPhase() {
        // A -> B -> C rotation
        if (this.phase === 'A') this.phase = 'B';
        else if (this.phase === 'B') this.phase = 'C';
        else this.phase = 'A';
        this.phaseTimer = 10000;
        this.buildPlan();
    }

    buildPlan() {
        // フェーズごとのPlan構築 (簡易)
        const stage = this.game.currentStage + 1;

        if (this.phase === 'A') {
            this.currentPlan.mainRole = 'CORE';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.NORMAL;
            if (stage >= 2 && Math.random() < 0.5) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.ZIGZAG;
        } else if (this.phase === 'B') {
            this.currentPlan.mainRole = 'HARASSER';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.EVASIVE;
            if (stage >= 5) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.DASHER;
        } else {
            this.currentPlan.mainRole = 'CONTROLLER';
            this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.SHIELDER; // デフォルト
            if (stage >= 6) this.currentPlan.mainType = CONSTANTS.ENEMY_TYPES.BARRIER_PAIR;
        }
    }

    queueFormation() {
        if (this.formationQueue.length > 0) return;

        const stage = this.game.currentStage + 1;

        // 1. Choose Formation Type based on Stage
        const allowed = ['LINE', 'PINCER'];
        if (stage >= 2) {
            allowed.push('V_SHAPE');
            allowed.push('STREAM');
        }
        if (stage >= 3) {
            allowed.push('CIRCLE');
            allowed.push('CROSS');
        }
        if (stage >= 4) {
            allowed.push('GRID');
            allowed.push('RANDOM_BURST');
        }

        const pattern = allowed[Math.floor(Math.random() * allowed.length)];

        // 2. Choose Enemy Type
        // 基本はNORMAL/ZIGZAGだが、高難易度編隊用にあえて弱い敵を選ぶことも、強い敵を選ぶこともある
        let type = CONSTANTS.ENEMY_TYPES.NORMAL;
        if (Math.random() < 0.4) type = CONSTANTS.ENEMY_TYPES.ZIGZAG;
        if (stage >= 3 && Math.random() < 0.2) type = CONSTANTS.ENEMY_TYPES.EVASIVE;

        // 3. Queue Logic
        switch (pattern) {
            case 'LINE': this.queueLine(type); break;
            case 'PINCER': this.queuePincer(type); break;
            case 'V_SHAPE': this.queueVShape(type); break;
            case 'CIRCLE': this.queueCircle(type); break;
            case 'GRID': this.queueGrid(type); break;
            case 'STREAM': this.queueStream(type); break;
            case 'CROSS': this.queueCross(type); break;
            case 'RANDOM_BURST': this.queueRandomBurst(type); break;
            default: this.queueLine(type); break;
        }

        this.log('FORMATION', pattern, `Count: ${this.formationQueue.length}`);
    }

    // --- Formation Helpers ---

    queueLine(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const margin = 50;
        const startX = Math.random() * (w - 100) + 50;
        const count = 5;
        for (let i = 0; i < count; i++) {
            this.formationQueue.push({
                type, pattern: 'LINEAR',
                x: startX, y: -margin - (i * 60),
                nextDelay: 150
            });
        }
    }

    queuePincer(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const margin = 50;
        const count = 3; // 3 pairs
        for (let i = 0; i < count; i++) {
            const y = h * (0.2 + 0.2 * i); // 20%, 40%, 60% height
            // Left
            this.formationQueue.push({
                type, pattern: 'PARALLEL',
                x: -margin, y: y,
                nextDelay: 0 // Simultaneous with Right
            });
            // Right
            this.formationQueue.push({
                type, pattern: 'PARALLEL',
                x: w + margin, y: y,
                nextDelay: 400 // Wait before next pair
            });
        }
    }

    queueVShape(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const margin = 50;
        const centerX = Math.random() * (w - 200) + 100;
        const startY = -margin;

        // Lead
        this.formationQueue.push({ type, pattern: 'V_SHAPE', x: centerX, y: startY, nextDelay: 100 });

        // Wings (2 pairs)
        for (let i = 1; i <= 2; i++) {
            const offsetX = i * 60;
            const offsetY = i * 50;
            // Left Wing
            this.formationQueue.push({ type, pattern: 'V_SHAPE', x: centerX - offsetX, y: startY - offsetY, nextDelay: 0 });
            // Right Wing
            this.formationQueue.push({ type, pattern: 'V_SHAPE', x: centerX + offsetX, y: startY - offsetY, nextDelay: 100 });
        }
    }

    queueCircle(type) {
        // Player surround
        const cx = this.game.player.x;
        const cy = this.game.player.y;
        const radius = 350;
        const count = 8;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;

            this.formationQueue.push({
                type, pattern: 'CIRCLE',
                x: x, y: y,
                nextDelay: 50 // Almost simultaneous but slightly rippled
            });
        }
    }

    queueGrid(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const startX = Math.random() > 0.5 ? 100 : w - 300;
        const startY = -100;
        const cols = 3;
        const rows = 3;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.formationQueue.push({
                    type, pattern: 'GRID',
                    x: startX + c * 60,
                    y: startY - r * 60,
                    nextDelay: (c === cols - 1) ? 300 : 0 // Row by row
                });
            }
        }
    }

    queueStream(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const startX = Math.random() * w;
        const margin = 50;
        const count = 10;

        for (let i = 0; i < count; i++) {
            this.formationQueue.push({
                type, pattern: 'STREAM',
                x: startX + (Math.random() * 40 - 20), // Slight jitter
                y: -margin,
                nextDelay: 80 // Very fast stream
            });
        }
    }

    queueCross(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const margin = 50;

        // Top, Bottom, Left, Right
        const positions = [
            { x: w / 2, y: -margin },
            { x: w / 2, y: h + margin },
            { x: -margin, y: h / 2 },
            { x: w + margin, y: h / 2 }
        ];

        positions.forEach(pos => {
            this.formationQueue.push({
                type, pattern: 'CROSS',
                x: pos.x, y: pos.y,
                nextDelay: 0
            });
        });
        // 最後のdelayをセット
        if (this.formationQueue.length > 0) {
            this.formationQueue[this.formationQueue.length - 1].nextDelay = 500;
        }
    }

    queueRandomBurst(type) {
        const w = CONSTANTS.TARGET_WIDTH;
        const h = CONSTANTS.TARGET_HEIGHT;
        const centerX = Math.random() * (w - 200) + 100;
        const centerY = Math.random() * (h * 0.5); // 上半分

        const count = 5 + Math.floor(Math.random() * 3);

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 100;
            this.formationQueue.push({
                type, pattern: 'RANDOM_BURST',
                x: centerX + Math.cos(angle) * dist,
                y: centerY + Math.sin(angle) * dist,
                nextDelay: 20
            });
        }
    }

    log(action, type, detail) {
        // Log system disabled
    }
}
