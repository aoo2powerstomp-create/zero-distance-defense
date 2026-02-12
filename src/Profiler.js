/**
 * Profiler.js
 * パフォーマンス計測用ユーティリティ
 */
export class Profiler {
    static times = {};
    static counts = {};
    static fps = 0;
    static avgDt = 0;
    static maxDt = 0;
    static frameHistory = [];
    static lastFrameTime = performance.now();
    static gcSpikes = [];

    static start(label) {
        this.times[label] = performance.now();
    }

    static end(label) {
        const start = this.times[label];
        if (start) {
            this.times[label] = performance.now() - start;
        }
    }

    static resetCounts() {
        this.counts = {
            bulletEnemyChecks: 0,
            enemyBarrierChecks: 0,
            enemyEnemyChecks: 0,
            renderedEntities: 0
        };
    }

    static updateFrame() {
        const now = performance.now();
        const dt = now - this.lastFrameTime;
        this.lastFrameTime = now;

        this.frameHistory.push(dt);
        if (this.frameHistory.length > 60) this.frameHistory.shift();

        this.avgDt = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;
        this.fps = 1000 / this.avgDt;

        // Max DT records (reset every sec approx)
        if (dt > this.maxDt) this.maxDt = dt;
        if (now % 1000 < 20) this.maxDt = dt;

        // GC Spike Check
        if (dt > this.avgDt * 3 && dt > 32) {
            this.gcSpikes.push({
                time: now,
                dt: dt,
                enemies: this.counts.enemies || 0,
                bullets: this.counts.bullets || 0
            });
            if (this.gcSpikes.length > 5) this.gcSpikes.shift();
        }
    }

    static getReport() {
        return {
            fps: this.fps,
            avgDt: this.avgDt,
            maxDt: this.maxDt,
            times: this.times,
            counts: this.counts,
            spikes: this.gcSpikes
        };
    }
}
