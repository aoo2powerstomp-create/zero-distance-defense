export class AssetLoader {
    constructor() {
        this.assets = new Map();
        this.loadedCount = 0;
        this.totalCount = 0;
        this.scale = 1.0; // 必要に応じてスプライトのスケール調整
    }

    /**
     * ASSET_MAP に定義された全画像へのロードを開始する
     * ロード完了を待たずに即時リターンする（ゲーム開始をブロックしない）
     * @param {Object} assetMap Key: Path のオブジェクト
     */
    loadAll(assetMap) {
        const keys = Object.keys(assetMap);
        this.totalCount = keys.length;
        if (this.totalCount === 0) return;

        console.log(`[AssetLoader] Start loading ${this.totalCount} assets...`);

        keys.forEach(key => {
            const img = new Image();
            img.src = assetMap[key];

            // ロード成功時
            img.onload = () => {
                this.assets.set(key, img);
                this.loadedCount++;
                console.log(`[AssetLoader] Loaded: ${key} (${this.loadedCount}/${this.totalCount})`);
            };

            // ロード失敗時
            img.onerror = () => {
                console.warn(`[AssetLoader] Failed to load: ${key} (${assetMap[key]})`);
                // 失敗した場合は Map に登録しない -> get() で null が返り、フォールバック描画になる
            };
        });
    }

    /**
     * 読み込み済みの画像を取得する
     * @param {string} key ASSET_MAP のキー
     * @returns {HTMLImageElement|null} 画像オブジェクト、未ロード/失敗時は null
     */
    get(key) {
        return this.assets.get(key) || null;
    }

    /**
     * 全てロード完了したか
     */
    isAllLoaded() {
        return this.loadedCount >= this.totalCount;
    }
}
