/**
 * SpatialGrid.js
 * 空間分割（固定グリッド）による近傍探索の最適化
 */
export class SpatialGrid {
    constructor(cellSize, width, height) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    /**
     * 敵をグリッドに登録
     */
    insertEnemy(enemy) {
        if (!enemy.active) return;
        const cx = Math.floor(enemy.renderX / this.cellSize);
        const cy = Math.floor(enemy.renderY / this.cellSize);
        const key = `${cx},${cy}`;

        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push(enemy);
    }

    /**
     * 全アクティブ敵でグリッドを再構築
     */
    build(enemies) {
        this.clear();
        for (const e of enemies) {
            if (e.active) {
                this.insertEnemy(e);
            }
        }
    }

    /**
     * 指定座標の周囲（9セル）にいる敵を取得
     */
    queryEnemiesNear(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const results = [];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const e of cell) {
                        results.push(e);
                    }
                }
            }
        }
        return results;
    }
}
