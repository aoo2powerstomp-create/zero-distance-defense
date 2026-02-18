import { RNG } from './RNG.js';
import { CONSTANTS } from '../constants.js';
import { SpawnDirector } from '../SpawnDirector.js';
import { Enemy } from '../Enemy.js';

export class Simulator {
    constructor() {
        this.gameMock = {
            currentStage: 0,
            gold: 0,
            frameCache: {
                roleCounts: {},
                typeCounts: {}
            },
            economyLogger: {
                // Mock logging to catch ALL spawns, including those by SpawnDirector.js
                update: () => { },
                resetForStage: () => { },
                recordKill: () => { },
                recordSpawn: (type) => {
                    if (this.stats) {
                        this.stats.total++;
                        this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
                    }
                    this.activeEnemies.push({
                        type: type,
                        ttl: this.getTTL(type)
                    });
                }
            },
            // Add minimum required game methods
            addGold: () => { },
            getUnlockedEnemyTypes: (stage) => {
                // Determine unlocked types based on stage (simplified logic or full map)
                // For now, Simulator will likely use SpawnDirector's internal unlock check if available,
                // or we mock a generic set. SpawnDirector uses CONSTANTS internally now.
                return [];
            },
            // Mock Player
            player: {
                x: CONSTANTS.TARGET_WIDTH / 2,
                y: CONSTANTS.TARGET_HEIGHT / 2
            },
            // Mock Enemy Pool for executeSpawn
            enemyPool: {
                get: () => {
                    return {
                        init: () => { },
                        id: 0,
                        age: 0,
                        oobFrames: 0,
                        active: true,
                        returnToPool: () => { } // Mock for SpawnDirector logic [FIX]
                    };
                }
            },
            currentSpawnBudget: 0,
            debugEnabled: false,
            isSimulation: true, // Flag to suppress logs in other classes [NEW]
            getTime: () => this.simTime * 1000
        };

        this.spawnDirector = null;
        this.rng = null;
        this.activeEnemies = []; // { type, ttl }
        this.simTime = 0;
        this.stats = {
            total: 0,
            byType: {},
            rejections: {},
            forceStats: { activations: 0, picks: {} },
            duration: 0
        };
    }

    init(seed, stage) {
        this.rng = new RNG(seed);
        this.simTime = 0;
        this.activeEnemies = [];
        this.resetStats();

        // [NEW] Reset global ID to ensure deterministic IDs across runs
        Enemy.nextId = 0;

        // Initialize Mock Game State for Stage
        this.gameMock.currentStage = stage - 1; // 0-indexed

        const stageData = CONSTANTS.STAGE_DATA[this.gameMock.currentStage];
        if (stageData) {
            // Replicate Main.js logic
            this.gameMock.enemiesRemaining = Math.round(stageData.enemyCount * stageData.spawnMul);
            this.gameMock.enemies = []; // Mock enemies array for SpawnDirector to check alive counts
            this.gameMock.isDebugStage = false;
            this.gameMock.isBossActive = false;
            this.gameMock.currentSpawnBudget = CONSTANTS.SPAWN_BUDGET_PER_SEC || 22;
        } else {
            console.warn("Invalid Stage Data for Sim. Defaulting to 100.");
            this.gameMock.enemiesRemaining = 100;
            this.gameMock.enemies = [];
            this.gameMock.currentSpawnBudget = 22;
        }

        // Initialize SpawnDirector with Mock Game & RNG
        this.spawnDirector = new SpawnDirector(this.gameMock);

        // Inject RNG into SpawnDirector
        // NOTE: SpawnDirector needs modification to accept this.rng
        if (this.spawnDirector.setRNG) {
            this.spawnDirector.setRNG(this.rng);
        } else {
            console.warn("SpawnDirector.setRNG not found. Simulation might not use seeded RNG.");
        }
    }

    resetStats() {
        this.stats = {
            total: 0,
            byType: {},
            rejections: {},
            forceStats: { activations: 0, picks: {} },
            duration: 0
        };
        // Also reset SpawnDirector internal stats if needed
    }

    // Mock Enemy TTLs (seconds)
    getTTL(type) {
        // Base TTL to prevent clogging
        switch (type) {
            case CONSTANTS.ENEMY_TYPES.NORMAL: return 2.0;
            case CONSTANTS.ENEMY_TYPES.ZIGZAG: return 3.0;
            case CONSTANTS.ENEMY_TYPES.EVASIVE: return 3.0;
            case CONSTANTS.ENEMY_TYPES.ASSAULT: return 2.5;
            default: return 4.0; // Stronger enemies live longer
        }
    }

    run(stage, durationSeconds = 9999, seed = 12345) {
        // durationSeconds is now a safety timeout, not the main stop condition
        this.init(seed, stage);

        // Reset SD for stage
        this.spawnDirector.resetForStage(this.gameMock.currentStage);

        const dt = 1 / 10; // Optimized: 10fps simulation (100ms step)
        const maxFrames = durationSeconds * 10; // Adjusted cap

        // console.log(`[SIM] Starting Stage ${stage} (Seed: ${seed}) Candidates: ${this.gameMock.enemiesRemaining}`);

        let isClear = false;

        for (let f = 0; f < maxFrames; f++) {
            this.simTime += dt;

            // 1. Update Active Enemies (TTL)
            for (let i = this.activeEnemies.length - 1; i >= 0; i--) {
                this.activeEnemies[i].ttl -= dt;

                if (this.activeEnemies[i].ttl <= 0) {
                    // Enemy "Died" or "Extinguished"
                    const e = this.activeEnemies[i];

                    // In real game, enemiesRemaining decreases when killed.
                    // Here we assume they are killed/removed at end of TTL.
                    // (SpawnDirector.forceCullEnemies also decrements remaining if it runs, but we simulate standard flow)
                    if (this.gameMock.enemiesRemaining > 0) {
                        // Note: In real game, remaining is spawn budget?
                        // check main.js: enemiesRemaining = stageData.enemyCount.
                        // When enemy dies: killCount++, enemiesRemaining doesn't change?
                        // Wait, check Main.js update loop for clear condition.
                        // "enemiesRemaining <= 0 && activeNonMinions === 0"
                        // SpawnDirector: "enemiesRemaining--" in forceCull.
                        // Actually SpawnDirector logic:
                        // "if (this.game.enemiesRemaining <= 0) ... wait for clear"
                        // "if (count > this.game.enemiesRemaining) count = this.game.enemiesRemaining"
                        // So enemiesRemaining is the *Spawn Reserve*. It decreases when we *Queue/Spawn*.
                    }

                    this.activeEnemies.splice(i, 1);
                }
            }

            // Mock Game.enemies for SpawnDirector checks (alive count)
            // Optimize: Update array only when needed or every few steps
            this.gameMock.enemies = this.activeEnemies.map(e => ({ active: true, type: e.type, isMinion: false }));

            // 2. Update FrameCache Counts
            this.updateMockFrameCache();

            // 3. Update SpawnDirector
            this.spawnDirector.update(dt * 1000); // Step is now 100ms

            // 4. Process Spawns (Mock Execution via SpawnDirector)
            // Note: SD.update already processes the queue if in SPAWNING state.
            // We just let it do its job. economyLogger.recordSpawn will catch the results.
            // If there's a race, it doesn't matter because the budget and logger are shared.
            if (this.spawnDirector.spawnQueue.length > 0) {
                // If the simulator wants to accelerate or force spawn, it could do it here,
                // but let's just let SD manage the interval to match real gameplay timing.
            }

            // Check Clear Condition
            if (this.gameMock.enemiesRemaining <= 0 && this.activeEnemies.length === 0 && this.spawnDirector.spawnQueue.length === 0) {
                isClear = true;
                break;
            }
        }

        this.stats.duration = this.simTime;
        this.collectResults();
        return this.stats;
    }

    updateMockFrameCache() {
        const typeCounts = {};
        const roleCounts = {};

        for (const e of this.activeEnemies) {
            typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
            const role = CONSTANTS.ENEMY_ROLES[e.type] || 'CORE';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        }

        this.gameMock.frameCache.typeCounts = typeCounts;
        this.gameMock.frameCache.roleCounts = roleCounts;
    }

    recordSimSpawn(type) {
        // Record Stats
        this.stats.total++;
        this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;

        // Add to active enemies metadata used for TTL
        this.activeEnemies.push({
            type: type,
            ttl: this.getTTL(type)
        });
    }

    collectResults() {
        // Extract internal stats from SD if useful
        if (this.spawnDirector.debugForceStats) {
            this.stats.forceStats = this.spawnDirector.debugForceStats;
        }
        if (this.spawnDirector.debugRejections) {
            this.stats.rejections = this.spawnDirector.debugRejections;
        }

        // console.log("[SIM] Results:", this.stats);
    }

    // Multi-run for statistical analysis
    simulateMany(runs, stage, durationSeconds, baseSeed, silent = false) {
        if (!silent) console.log(`[SIM] Running ${runs} simulations for Stage ${stage}...`);

        const aggregate = {
            totalSpawns: 0,
            byType: {},
            forceActivations: 0,
            totalDuration: 0,
            runs: runs
        };

        for (let i = 0; i < runs; i++) {
            const seed = baseSeed + i;
            const res = this.run(stage, durationSeconds, seed);

            aggregate.totalSpawns += res.total;
            aggregate.totalDuration += res.duration;
            aggregate.forceActivations += (res.forceStats ? res.forceStats.activations : 0);

            for (const t in res.byType) {
                aggregate.byType[t] = (aggregate.byType[t] || 0) + res.byType[t];
            }
        }

        // Average
        const avg = {
            total: (aggregate.totalSpawns / runs).toFixed(1),
            forceActs: (aggregate.forceActivations / runs).toFixed(1),
            avgDuration: (aggregate.totalDuration / runs),
            ratios: {}
        };

        for (const t in aggregate.byType) {
            const avgCount = aggregate.byType[t] / runs;
            const pct = (aggregate.byType[t] / aggregate.totalSpawns * 100);
            avg.ratios[t] = { count: avgCount.toFixed(1), pct: pct.toFixed(2) };
        }

        if (!silent) {
            console.table(avg.ratios);
            console.log(`[SIM] Avg Total: ${avg.total}, Avg Force Acts: ${avg.forceActs}`);
        }
        return avg;
    }

    /**
     * 全ステージをシミュレーションし、比較用データを返す [NEW]
     */
    simulateAllStages(runs = 100) {
        const totalStages = CONSTANTS.STAGE_DATA.length;
        const allResults = [];
        const baseSeed = 12345;

        for (let s = 1; s <= totalStages; s++) {
            const res = this.simulateMany(runs, s, 9999, baseSeed, true);
            allResults.push({
                stage: s,
                total: res.total,
                forceActs: res.forceActs,
                duration: res.avgDuration.toFixed(1),
                ratios: res.ratios // [NEW] include individual counts/ratios
            });
        }
        return allResults;
    }
}
