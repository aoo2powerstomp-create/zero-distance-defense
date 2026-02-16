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
        this.recentLogs = [];

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
        div.style.pointerEvents = 'none'; // Click through
        div.style.whiteSpace = 'pre-wrap';

        document.body.appendChild(div);
        this.container = div;
    }

    render() {
        if (!this.container) return;

        // Debug Stage Exception
        if (this.game.currentStage === CONSTANTS.STAGE_DEBUG) {
            this.container.textContent = "=== DEBUG STAGE (ECON LOG DISABLED) ===";
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

        let tableRows = "";
        for (const t of sortedTypes) {
            const k = this.killsByType[t];
            const g = this.gByType[t] || 0;
            // Simple formatting
            tableRows += ` ${t.padEnd(4)} : ${k.toString().padStart(3)} | ${g.toString().padStart(6)}\n`;
        }
        html += tableRows;
        html += `---------------------\n`;

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

        this.container.textContent = html;
    }
}
