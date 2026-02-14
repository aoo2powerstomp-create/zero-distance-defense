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
        // renderX/Y が未定義の場合は x/y を使用
        const x = enemy.renderX ?? enemy.x;
        const y = enemy.renderY ?? enemy.y;

        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
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
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.active) {
                this.insertEnemy(e);
            }
        }
    }

    /**
     * 指定座標の周囲（円範囲）にいる敵を取得
     */
    queryCircle(x, y, radius) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const range = Math.ceil(radius / this.cellSize);
        const rSq = radius * radius;
        const results = [];

        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        const e = cell[i];
                        const edx = e.x - x;
                        const edy = e.y - y;
                        if (edx * edx + edy * edy < rSq) {
                            results.push(e);
                        }
                    }
                }
            }
        }
        return results;
    }

    /**
     * 指定座標の周囲（9セル）にいる敵を取得 (後方互換用)
     */
    queryEnemiesNear(x, y) {
        return this.queryCircle(x, y, this.cellSize * 1.5);
    }
}
