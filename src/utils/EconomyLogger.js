import { CONSTANTS } from '../constants.js';

export class EconomyLogger {
    constructor(game) {
        this.game = game;
        this.isActive = this.checkIsLocalhost();

        // Data
        this.stageTotalG = 0;
        this.killsByType = {};
        this.gByType = {};
        this.recentLogs = []; // Ring buffer max 100
        this.maxLogs = 100;

        // Spawn Stats
        this.recentSpawns = []; // Ring buffer max 200
        this.maxSpawns = 200;

        // History
        this.history = [];
        this.activeStageIndex = null;

        // UI
        this.container = null;
        this.lastRenderAt = 0;
        this.renderInterval = 200; // ms

        // Init
        if (this.isActive) {
            this.calculateUpgradeCosts();
            this.createUI();
        }
    }

    calculateUpgradeCosts() {
        const weaponGrowth = CONSTANTS.UPGRADE_COST_GROWTH_WEAPON;
        const speedGrowth = CONSTANTS.UPGRADE_COST_GROWTH_SPEED;
        const weaponBase = CONSTANTS.UPGRADE_WEAPON_BASE;
        const speedBase = CONSTANTS.UPGRADE_ATK_SPEED_BASE;
        const maxLv = CONSTANTS.UPGRADE_LV_MAX;

        let weaponTotal = 0;
        let speedTotal = 0;

        for (let lv = 1; lv < maxLv; lv++) {
            weaponTotal += Math.round(weaponBase * Math.pow(weaponGrowth, lv - 1));
            speedTotal += Math.round(speedBase * Math.pow(speedGrowth, lv - 1));
        }

        this.upgradeCostInfo = {
            wGrowth: weaponGrowth,
            sGrowth: speedGrowth,
            weapon: weaponTotal,
            speed: speedTotal,
            total: weaponTotal + speedTotal
        };
    }

    checkIsLocalhost() {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '::1';
    }

    resetForStage(stage) {
        if (!this.isActive) return;

        // Save history for the previous stage if valid
        if (this.activeStageIndex !== null && this.stageTotalG > 0) {
            this.history.push({
                stageIndex: this.activeStageIndex,
                totalG: this.stageTotalG,
                kills: { ...this.killsByType },
                golds: { ...this.gByType }
            });
        }

        this.activeStageIndex = stage;
        this.stageTotalG = 0;
        this.killsByType = {};
        this.gByType = {};
        this.killsByType = {};
        this.gByType = {};
        this.recentLogs = [];
        this.recentSpawns = [];

        // Clear UI logs immediately to avoid confusion
        // Force update to clear screen
        this.render();
    }

    recordKill({ stage, enemyType, baseG, mult, gainedG }) {
        if (!this.isActive) return;

        // Sync active stage just in case
        if (this.activeStageIndex === null) {
            this.activeStageIndex = stage;
        }

        const type = enemyType;
        const g = gainedG;

        // Aggregation
        this.stageTotalG += g;

        if (!this.killsByType[type]) this.killsByType[type] = 0;
        this.killsByType[type]++;

        if (!this.gByType[type]) this.gByType[type] = 0;
        this.gByType[type] += g;

        // Log
        this.recentLogs.push({ stage, enemyType, baseG, mult, gainedG });
        if (this.recentLogs.length > this.maxLogs) {
            this.recentLogs.shift();
        }
    }

    recordSpawn(type) {
        if (!this.isActive) return;
        this.recentSpawns.push(type);
        if (this.recentSpawns.length > this.maxSpawns) {
            this.recentSpawns.shift();
        }
    }

    update(now) {
        if (!this.isActive) return;

        if (now - this.lastRenderAt >= this.renderInterval) {
            this.render();
            this.lastRenderAt = now;
        }
    }

    createUI() {
        if (document.getElementById('eco-debug-ui')) return;

        const div = document.createElement('div');
        div.id = 'eco-debug-ui';
        div.style.position = 'fixed';
        div.style.left = '0';
        div.style.top = '0';
        div.style.width = '380px';
        div.style.height = '100vh';
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        div.style.color = '#00ff00';
        div.style.fontFamily = 'monospace';
        div.style.fontSize = '12px';
        div.style.overflowY = 'auto'; // Vertical scroll
        div.style.zIndex = '9999';
        div.style.padding = '10px';
        div.style.pointerEvents = 'none'; // Click through (initially)

        // Ensure container allows children pointer events
        // But we want to click through empty space...
        // Approach: Container click-through, children auto.

        document.body.appendChild(div);
        this.container = div;

        // 1. Controls Area (Top)
        this.controlsDiv = document.createElement('div');
        this.controlsDiv.style.pointerEvents = 'auto'; // Enable clicks
        this.controlsDiv.style.marginBottom = '10px';
        this.controlsDiv.style.borderBottom = '1px solid #00ff00';
        this.controlsDiv.style.paddingBottom = '5px';
        this.container.appendChild(this.controlsDiv);

        // Add Sim Button
        const btn = document.createElement('button');
        btn.textContent = "RUN SIM (Full Stage x100)";
        btn.style.background = '#004400';
        btn.style.color = '#00ff00';
        btn.style.border = '1px solid #00ff00';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '10px';
        btn.style.marginRight = '5px';

        btn.onclick = () => {
            if (window.Simulator) {
                this.runSimulation();
            } else {
                this.simResultText = "\n[ERROR] Simulator class not found on window object.\n";
                this.render();
            }
        };
        this.controlsDiv.appendChild(btn);

        // 2. Log Area
        this.logDiv = document.createElement('div');
        this.logDiv.style.whiteSpace = 'pre-wrap';
        this.container.appendChild(this.logDiv);

        this.simResultText = "";
    }

    runSimulation() {
        const stage = this.game.currentStage + 1;
        const runs = 100;
        // duration arg is safety timeout (9999s) in updated Simulator
        const seed = Date.now();

        this.simResultText = `[Running Sim: Stg${stage} x${runs} (Full)...]`;
        this.render(); // force update

        // Async to let UI update
        setTimeout(() => {
            try {
                const sim = new window.Simulator();
                const res = sim.simulateMany(runs, stage, 9999, seed); // 9999s timeout

                let out = `\n=== SIM RESULTS (Stg${stage}, ${runs}runs) ===\n`;
                out += `Avg Total: ${res.total} (Duration: ${(res.avgDuration || 0).toFixed(1)}s)\n`;
                out += `Avg Force Acts: ${res.forceActs}\n`;
                out += `Ratios:\n`;
                Object.keys(res.ratios).sort().forEach(k => {
                    out += ` ${k}: ${res.ratios[k]}\n`;
                });
                out += `============================\n`;

                this.simResultText = out;
            } catch (e) {
                this.simResultText = `\n[SIM ERROR]: ${e.message}\n`;
                console.error(e);
            }
        }, 50);
    }

    render() {
        if (!this.logDiv) return;

        // Debug Stage Exception
        if (this.game.currentStage === CONSTANTS.STAGE_DEBUG) {
            this.logDiv.textContent = "=== DEBUG STAGE (ECON LOG DISABLED) ===";
            return;
        }

        const stage = (this.game.currentStage !== undefined) ? (this.game.currentStage + 1) : 1;
        // Logic from plan: Stage 1 -> Index 0
        const stageIndex = Math.max(0, stage - 1);
        const mult = Math.pow(CONSTANTS.ECON_GROWTH_BASE || 1.18, stageIndex);

        let html = `=== 経済デバッグ ===\n`;

        // Cost Info
        if (this.upgradeCostInfo) {
            const inf = this.upgradeCostInfo;
            html += `武係数: ${inf.wGrowth}, 速係数: ${inf.sGrowth}\n`;
            html += `武Max : ${inf.weapon} G\n`;
            html += `速Max : ${inf.speed} G\n`;
            html += `1武器 : ${inf.total} G\n`;
            html += `---------------------\n`;
        }

        html += `Stg  : ${stage} (Index ${stageIndex})\n`;
        html += `倍率 : x${mult.toFixed(2)}\n`;
        html += `獲得 : ${this.stageTotalG} G\n`;

        // Current Gold (if available)
        if (this.game.gold !== undefined) {
            html += `所持 : ${this.game.gold} G\n`;
        }
        html += `---------------------\n`;

        // Aggregation table
        html += `[種別] 撃破 | 獲得G\n`;
        const sortedTypes = Object.keys(this.killsByType).sort();

        // Spawn Stats (Burst Info)
        if (this.game.spawnDirector) {
            const sd = this.game.spawnDirector;
            const burstState = sd.isABurstOn ? "ON" : "OFF";
            const timer = (sd.burstCycle - sd.burstTimer) / 1000;
            html += `A-Burst: ${burstState} (${timer.toFixed(1)}s)\n`;

            // A-Ratio Info
            const history = sd.historyTypes || [];
            const aCount = history.filter(t => t === CONSTANTS.ENEMY_TYPES.NORMAL).length;
            const aRatio = history.length > 0 ? (aCount / history.length * 100).toFixed(1) : "0.0";
            const targetA = (this.game.currentStage + 1 >= 6) ? (sd.isABurstOn ? "70" : "50") : "-";
            html += `A-Ratio: ${aRatio}% (Tgt: ${targetA}%)\n`;

            // Late Weights (Stage 6+)
            if (this.game.currentStage + 1 >= 6) {
                html += `[Late Weights]\n`;
                html += `A:0.30 B:0.60 C:1.20\n`;
                html += `E:1.00 O:1.20 M:1.10\n`;
            }

            // Recent Spawn Ratios
            if (this.recentSpawns.length > 0) {
                const total = this.recentSpawns.length;
                const counts = {};
                this.recentSpawns.forEach(t => counts[t] = (counts[t] || 0) + 1);

                html += `Spawn(Latest ${total}):\n`;
                Object.keys(counts).sort().forEach(t => {
                    const pct = ((counts[t] / total) * 100).toFixed(1);
                    html += ` ${t}: ${pct}%\n`;
                });
            }
            html += `---------------------\n`;

            // Cumulative Spawn Stats (Stage Total)
            const stTotal = sd.stageSpawnTotalCount || 0;
            if (stTotal > 0) {
                html += `Spawn(Total This Stage): total=${stTotal}\n`;
                const stCounts = sd.stageSpawnByType || {};
                Object.keys(stCounts).sort().forEach(t => {
                    const c = stCounts[t];
                    const pct = ((c / stTotal) * 100).toFixed(1);
                    html += ` ${t}: ${c.toString().padEnd(3)} (${pct}%)\n`;
                });
            }
            html += `---------------------\n`;

            // Active/Max Counts (Stage 6+ Verification)
            const stage = this.game.currentStage + 1;
            const isLate = stage >= 6;

            // Define limits for display (Manual sync with SpawnDirector)
            const limits = {
                [CONSTANTS.ENEMY_TYPES.ZIGZAG]: 999, // B
                [CONSTANTS.ENEMY_TYPES.EVASIVE]: isLate ? 6 : 3, // C
                [CONSTANTS.ENEMY_TYPES.ASSAULT]: 999, // E
                [CONSTANTS.ENEMY_TYPES.TRICKSTER]: isLate ? 6 : 3, // O
                [CONSTANTS.ENEMY_TYPES.FLANKER]: isLate ? 6 : 3, // M

                [CONSTANTS.ENEMY_TYPES.ORBITER]: isLate ? 3 : 2, // I
                [CONSTANTS.ENEMY_TYPES.DASHER]: isLate ? 3 : 2, // H

                [CONSTANTS.ENEMY_TYPES.ELITE]: isLate ? 3 : 2, // D
                [CONSTANTS.ENEMY_TYPES.REFLECTOR]: isLate ? 3 : 2, // Q
                [CONSTANTS.ENEMY_TYPES.SPLITTER]: isLate ? 3 : 2, // J

                [CONSTANTS.ENEMY_TYPES.SHIELDER]: isLate ? 2 : 1, // F
                [CONSTANTS.ENEMY_TYPES.OBSERVER]: isLate ? 2 : 1, // L
                [CONSTANTS.ENEMY_TYPES.BARRIER_PAIR]: isLate ? 2 : 1, // N
            };

            const typesToShow = [
                CONSTANTS.ENEMY_TYPES.SHIELDER, CONSTANTS.ENEMY_TYPES.GUARDIAN,
                CONSTANTS.ENEMY_TYPES.ELITE, CONSTANTS.ENEMY_TYPES.SPLITTER,
                CONSTANTS.ENEMY_TYPES.DASHER, CONSTANTS.ENEMY_TYPES.ORBITER,
                CONSTANTS.ENEMY_TYPES.BARRIER_PAIR, CONSTANTS.ENEMY_TYPES.OBSERVER,
                CONSTANTS.ENEMY_TYPES.REFLECTOR
            ];
            // Add Basic types if Late
            if (isLate) {
                typesToShow.push(CONSTANTS.ENEMY_TYPES.EVASIVE);
                typesToShow.push(CONSTANTS.ENEMY_TYPES.TRICKSTER);
                typesToShow.push(CONSTANTS.ENEMY_TYPES.FLANKER);
            }

            /*
            html += `[Limit] Active/Max\n`;
            const counts = this.game.frameCache.typeCounts;
            typesToShow.forEach(t => {
                const now = counts[t] || 0;
                const max = limits[t] || 999;
                if (max < 999) {
                    html += `${t}: ${now} / ${max}\n`;
                }
            });
            html += `---------------------\n`;
            */

            html += `---------------------\n`;

            // Force Non-A Status
            if (sd.debugForceStatus) {
                const fs = sd.debugForceStatus;
                const state = fs.active ? "ACTIVE" : "OFF";
                const picked = fs.picked ? fs.picked : (fs.active ? "FAILED" : "-");
                const counter = (fs.decision !== undefined) ? `${fs.decision % fs.period}/${fs.period}` : "-";

                // Active Stats (Activations & Picks)
                let statsStr = "";
                if (sd.debugForceStats && sd.debugForceStats.activations > 0) {
                    const fStats = sd.debugForceStats;
                    statsStr = `\n Act:${fStats.activations}`;
                    const pTypes = Object.keys(fStats.picksByType).sort();
                    if (pTypes.length > 0) {
                        statsStr += " Pick:";
                        statsStr += pTypes.map(pt => `${pt}=${fStats.picksByType[pt]}`).join(',');
                    }
                }

                html += `ForceNonA: ${state} [${counter}] Pick:${picked}${statsStr}\n`;
            }
            html += `---------------------\n`;

            // Cumulative Spawn Stats
            if (sd.cumulativeSpawnStats) {
                html += `[Cumulative Spawn Stats]\n`;
                const css = sd.cumulativeSpawnStats;
                const total = css.total;
                if (total > 0) {
                    const sortedCumulativeTypes = Object.keys(css.counts).sort();
                    sortedCumulativeTypes.forEach(t => {
                        const count = css.counts[t];
                        const pct = ((count / total) * 100).toFixed(1);
                        html += ` ${t}: ${count} (${pct}%)\n`;
                    });
                } else {
                    html += ` (No spawns yet)\n`;
                }
                html += ` Total: ${total}\n`;
                html += `---------------------\n`;
            }

            // Rejection Stats
            if (sd.debugRejections) {
                html += `[Rejections] (Blocking Factor)\n`;
                const rej = sd.debugRejections;
                const rTypes = Object.keys(rej).sort();
                rTypes.forEach(t => {
                    const r = rej[t];
                    let line = `${t}: `;
                    const reasons = Object.keys(r).map(rs => `${rs}:${r[rs]}`).join(', ');
                    html += line + reasons + '\n';
                });
                html += `---------------------\n`;
            }
        }

        let tableRows = "";
        for (const t of sortedTypes) {
            const k = this.killsByType[t];
            const g = this.gByType[t] || 0;
            // Simple formatting
            tableRows += ` ${t.padEnd(4)} : ${k.toString().padStart(3)} | ${g.toString().padStart(6)}\n`;
        }
        html += tableRows;
        html += `---------------------\n`;

        // Stage 9 Quota Debug
        const sd = this.game.spawnDirector;
        if (stage === 9 && sd && sd.quotaByType) {
            html += `[Quota Stats (Stage 9)]\n`;
            html += `QuotaHits: ${sd.debugQuotaStats.hits}\n`;

            const unmet = [];
            let quotaSummary = "";
            for (const [t, target] of Object.entries(sd.quotaByType)) {
                const cur = sd.stageSpawnByType[t] || 0;
                quotaSummary += ` ${t}:${cur}/${target}`;
                if (cur < target) {
                    unmet.push(`${t}(rem:${target - cur})`);
                }
            }
            html += `Progress:${quotaSummary}\n`;
            html += `Unmet: ${unmet.length > 0 ? unmet.join(', ') : 'NONE'}\n`;

            const failures = sd.debugQuotaStats.failures;
            if (Object.keys(failures).length > 0) {
                const failStr = Object.entries(failures).map(([t, c]) => `${t}:${c}`).join(', ');
                html += `QuotaFailures: ${failStr}\n`;
            }
            html += `---------------------\n`;
        }

        /*
        // Recent Logs (Reverse order traverse)
        html += `直近ログ (現在):\n`;

        // Loop from end to start
        const logs = this.recentLogs;
        const logDisplayLimit = 15;
        const startIdx = Math.max(0, logs.length - logDisplayLimit);

        for (let i = logs.length - 1; i >= startIdx; i--) {
            const log = logs[i];
            const type = log.enemyType || '?';
            const base = log.baseG;
            const m = log.mult.toFixed(2);
            const val = log.gainedG;
            // Format: [A] 10 x1.00 -> 10
            html += `[${type}] ${base} x${m} -> ${val}\n`;
        }
        if (logs.length > logDisplayLimit) {
            html += `... (${logs.length - logDisplayLimit} more)\n`;
        }
        */

        // HISTORY SECTION
        if (this.history.length > 0) {
            html += `\n=== ステージ履歴 ===\n`;
            // Show latest first
            for (let i = this.history.length - 1; i >= 0; i--) {
                const h = this.history[i];
                html += `Stg ${h.stageIndex + 1} | 合計: ${h.totalG} G\n`;

                // Summarized breakdown
                // Compact format: [A:12, B:5, D:1]
                const types = Object.keys(h.kills).sort();
                let summaryLine = "";
                types.forEach((t, idx) => {
                    const k = h.kills[t];
                    // const g = h.golds[t];
                    summaryLine += `${t}:${k}`;
                    if (idx < types.length - 1) summaryLine += ", ";
                });
                html += ` > Kills: [${summaryLine}]\n`;
                html += `---------------------\n`;
            }
        }

        // Append Sim Results at the bottom
        if (this.simResultText) {
            html += this.simResultText;
        }

        this.logDiv.textContent = html;
    }
}
