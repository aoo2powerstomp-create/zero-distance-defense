import { CONSTANTS } from '../constants.js';

export class FrameCache {
    constructor() {
        this.enemiesAlive = [];
        this.activeBosses = [];
        this.barrierPairs = [];
        this.buffFlags = {
            hasGuardian: false,
            hasObserver: false,
            hasMark: false
        };
        this.roleCounts = {
            CORE: 0,
            HARASSER: 0,
            CONTROLLER: 0,
            DIRECTOR: 0,
            ELITE: 0
        };
        this.typeCounts = {}; // ID -> count
    }

    update(enemies, globalMarkTimer) {
        this.enemiesAlive = [];
        this.activeBosses = [];
        this.barrierPairs = [];
        this.buffFlags.hasMark = globalMarkTimer > 0;
        this.buffFlags.hasGuardian = false;
        this.buffFlags.hasObserver = false;

        // Reset Role Counts
        this.roleCounts.CORE = 0;
        this.roleCounts.HARASSER = 0;
        this.roleCounts.CONTROLLER = 0;
        this.roleCounts.DIRECTOR = 0;
        this.roleCounts.ELITE = 0;
        this.typeCounts = {};

        const barrierPairMap = new Map();

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e.active) continue;

            this.enemiesAlive.push(e);
            if (e.isBoss) this.activeBosses.push(e);

            // Count Roles
            const role = CONSTANTS.ENEMY_ROLES[e.type] || 'CORE';
            if (this.roleCounts[role] !== undefined) {
                this.roleCounts[role]++;
            }

            // Count Types
            if (!this.typeCounts[e.type]) this.typeCounts[e.type] = 0;
            this.typeCounts[e.type]++;

            if (e.type === CONSTANTS.ENEMY_TYPES.BARRIER_PAIR && e.partner && e.partner.active) {
                // Ensure reciprocal link
                if (e.partner.partner === e) {
                    const id1 = Math.min(e.id, e.partner.id);
                    const id2 = Math.max(e.id, e.partner.id);
                    const key = `${id1}_${id2}`;

                    if (!barrierPairMap.has(key)) {
                        const minX = Math.min(e.x, e.partner.x) - 10;
                        const maxX = Math.max(e.x, e.partner.x) + 10;
                        const minY = Math.min(e.y, e.partner.y) - 10;
                        const maxY = Math.max(e.y, e.partner.y) + 10;

                        const pair = {
                            ax: e.x, ay: e.y,
                            bx: e.partner.x, by: e.partner.y,
                            minX, maxX, minY, maxY,
                            id1, id2
                        };
                        this.barrierPairs.push(pair);
                        barrierPairMap.set(key, pair);
                    }
                }
            }

            if (e.type === CONSTANTS.ENEMY_TYPES.GUARDIAN && e.barrierState === 'active') {
                this.buffFlags.hasGuardian = true;
            }
            // If we add other global buffs, check them here
        }
    }
}
