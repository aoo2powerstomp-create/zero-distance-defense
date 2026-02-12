export const CONSTANTS = {
    // 画面設定
    TARGET_WIDTH: 800,
    TARGET_HEIGHT: 800,

    // プレイヤー設定
    PLAYER_MAX_HP: 100,
    PLAYER_REGEN_PER_SEC: 0.005, // 0.5%
    PLAYER_REGEN_STOP_MS: 750,
    PLAYER_BASE_ROTATION_SPEED: 0.05,
    PLAYER_FOLLOW_STRENGTH: 6.0, // 半追随照準の引き寄せ強度 (3.0〜6.0の上限)
    PLAYER_HP: 100,
    PLAYER_SIZE: 20,

    // 弾設定
    BULLET_SPEED: 7,
    BULLET_LIFETIME_MS: 1500,
    BULLET_COOLDOWN_MS: 500, // 初期連射速度（遅め）
    BULLET_SIZE: 2.5,
    BULLET_LIMIT: 60,

    // 敵設定
    ENEMY_SIZE: 15,
    ENEMY_BASE_SPEED: 1.5,
    ENEMY_DAMAGE_RATIO: 0.03, // 3%
    ENEMY_CONTACT_COOLDOWN_MS: 250,
    ENEMY_LIMIT: 300,
    ENEMY_KNOCKBACK_POWER: 4.0,
    ENEMY_KNOCKBACK_DAMP: 0.9,
    ENEMY_KNOCKBACK_MAX: 15,

    // エリート設定
    ELITE_HP_MUL: 3,
    ELITE_SIZE_MUL: 1.5,
    ELITE_KB_RESIST: 0.8, // 80%軽減

    // ボス設定
    BOSS_HP_MUL: 12,
    BOSS_SIZE_MUL: 3,
    BOSS_KB_RESIST: 0.7, // 70%軽減
    BOSS_SPEED_MUL: 0.6,
    BOSS_SUMMON_INTERVAL_NORMAL_MS: 4000,
    BOSS_SUMMON_INTERVAL_ENRAGED_MS: 2000,
    BOSS_SUMMON_COUNT: 3,

    // 武器タイプ
    WEAPON_TYPES: {
        STANDARD: 'standard',
        SHOT: 'shot',
        PIERCE: 'pierce'
    },
    WEAPON_CONFIG: {
        standard: {
            name: 'RIFLE',
            unlockCost: 0,
            baseDamage: 1.0,
            damageScale: 1.2,
            pierceBase: 0,
            speedScale: 1.0,
            baseCooldown: 350, // 最速
            lifeScale: 1.0,
            knockMul: 1.0,
            desc: '基本の単発射撃。命中時に微量回復。'
        },
        shot: {
            name: 'SHOTGUN',
            unlockCost: 500,
            baseDamage: 0.65, // 0.65x
            damageScale: 1.15,
            pierceBase: 0,
            speedScale: 0.9,
            baseCooldown: 500,
            lifeScale: 0.85,  // -15%
            knockMul: 0.6,
            desc: '3方向拡散射撃。密集処理に特化。'
        },
        pierce: {
            name: 'LASER',
            unlockCost: 1000,
            baseDamage: 1.3,  // 1.3x
            damageScale: 1.1,
            pierceBase: 2,
            speedScale: 1.2,  // 1.2x
            baseCooldown: 600,
            lifeScale: 1.0,
            knockMul: 1.2,
            desc: '超高速の貫通弾。高HPの敵に特化。'
        }
    },
    STANDARD_RECOVERY_ON_HIT: 0.002, // 0.2%

    // 敵タイプ
    ENEMY_TYPES: {
        NORMAL: 'A',
        ZIGZAG: 'B',
        EVASIVE: 'C',
        ELITE: 'D',
        ASSAULT: 'E' // 突撃型
    },
    ENEMY_FORMATION_TYPES: {
        SINGLE: 'single',
        LINEAR: 'linear',     // 直列
        PARALLEL: 'parallel', // 並列
        V_SHAPE: 'v_shape'    // V字
    },
    ENEMY_MOVEMENT_TYPES: {
        STRAIGHT: 'straight',
        INVADER: 'invader'
    },
    ENEMY_SPEED_ADJUST_RADIUS: 260, // 減速開始距離
    ENEMY_MIN_SPEED_RATIO: 0.6,     // 最至近での速度比率 (40%減)

    // インベーダー(Type Invader)設定
    INVADER_STRAFE_AMP: 60,      // 横揺れの振幅(px)
    INVADER_STRAFE_FREQ: 0.002,  // 横揺れの周波数

    // ジグザグ設定
    ZIGZAG_AMP: 60,   // 振幅
    ZIGZAG_FREQ: 0.003, // 周波数 (0.005から軽減)
    // 回避設定
    EVASIVE_ANGLE: 20 * (Math.PI / 180), // 回避時にずらす角度 (20度)
    EVASIVE_TRIGGER_ARC: 15 * (Math.PI / 180), // 射線付近とみなす角度 (15度)
    EVASIVE_DURATION_MS: 1200, // 回避行動を続ける時間

    // ステージ定義 (speedMulを公式 1 + (stage^0.9) * 0.06 に基づき緩和)
    STAGE_DATA: [
        { hpMul: 1.0, speedMul: 1.00, spawnMul: 1.0, enemyCount: 40, spawnInterval: 800 }, // Stage 1
        { hpMul: 1.2, speedMul: 1.06, spawnMul: 1.2, enemyCount: 70, spawnInterval: 600 }, // Stage 2
        { hpMul: 1.5, speedMul: 1.11, spawnMul: 1.4, enemyCount: 120, spawnInterval: 400 }, // Stage 3
        { hpMul: 1.8, speedMul: 1.16, spawnMul: 1.6, enemyCount: 200, spawnInterval: 200 }, // Stage 4
        { hpMul: 2.2, speedMul: 1.21, spawnMul: 1.8, enemyCount: 400, spawnInterval: 150 }, // Stage 5
        { hpMul: 2.8, speedMul: 1.26, spawnMul: 2.1, enemyCount: 500, spawnInterval: 80 },  // Stage 6
        { hpMul: 3.5, speedMul: 1.30, spawnMul: 2.4, enemyCount: 700, spawnInterval: 70 },  // Stage 7
        { hpMul: 4.5, speedMul: 1.35, spawnMul: 2.7, enemyCount: 900, spawnInterval: 60 },  // Stage 8
        { hpMul: 5.8, speedMul: 1.39, spawnMul: 3.0, enemyCount: 1200, spawnInterval: 50 }, // Stage 9
        { hpMul: 7.5, speedMul: 1.43, spawnMul: 3.5, enemyCount: 1800, spawnInterval: 40 }  // Stage 10
    ],

    // アップグレード設定
    UPGRADE_LV_MAX: 30,
    UPGRADE_COST_BASE: 1.25, // コスト上昇率 ( 1.25^(lv-1) )
    UPGRADE_WEAPON_BASE: 40,
    UPGRADE_ATK_SPEED_BASE: 80,

    // 武器別追加成長パラメータ (Lv11-30用)
    WEAPON_GROWTH: {
        standard: { // 初期武器 (RIFLE)
            ANGLE_MAX: 0,
            PIERCE_EXTRA: 1,      // 追加貫通数 (Lv11-15)
            WIDTH_MUL_MAX: 1.2,   // 最大横幅
            HIT_WIDTH_MAX: 1.1,   // 最大判定幅
            DECAY_REDUCTION: 0.5, // 貫通時ダメージ減衰の緩和率
            SIZE_MUL_MAX: 1.0,
            HIT_MUL_MAX: 1.0,
            KNOCK_MUL_EXTRA: 1.0
        },
        shot: {
            ANGLE_MAX: 0.28,      // 最大拡散角 (約±16度)
            SIZE_MUL_MAX: 1.15,   // 最大弾サイズ (見た目)
            HIT_MUL_MAX: 1.05,    // 最大判定サイズ
            KNOCK_MUL_EXTRA: 1.15 // 追加ノックバック係数
        },
        pierce: { // LASER
            WIDTH_MUL_MAX: 1.3,   // 最大ビーム幅
            LIFE_MUL_MAX: 1.2,    // 最大射程（寿命）
            ROTATION_PENALTY: 0.4,// 発射中の旋回速度倍率 (60%低下)
            KNOCK_POWER: 0.5      // 追加ノックバック
        }
    },

    // ゴールド設定
    GOLD_SIZE: 10,
    GOLD_BOUNCE_STRENGTH: 5,
    GOLD_ATTRACT_SPEED: 8,
    GOLD_ATTRACT_DIST: 150,
    GOLD_LIMIT: 50,

    // ゲーム状態
    STATE: {
        TITLE: 0,
        PLAYING: 1,
        WAVE_CLEAR: 2,
        WAVE_CLEAR_CUTIN: 3,
        RESULT: 4,
        STAGE_CLEAR: 5,
        GAME_OVER: 6,
        COUNTDOWN: 7,
    },

    // 演出設定
    SHOW_DAMAGE_NUMBERS: true,
    DAMAGE_TEXT_LIMIT: 50,

    // スポーン緩急設定
    SPAWN_RHYTHM_CYCLE_MS: 12000, // 以前の互換性のため維持

    // 新・スポーン制御アルゴリズム
    SPAWN_SECTOR_ANGLE: 120,          // 出現扇形の角度
    SPAWN_SECTOR_DURATION_MS: 4000,    // セクタ切り替え間隔
    SPAWN_BURST_TIME_MS: 2500,         // バースト（高頻度スポーン）時間
    SPAWN_COOL_TIME_MS: 1000,          // クールダウン時間
    SPAWN_SAFE_RADIUS: 120,            // 至近スポーン禁止距離
    SPAWN_DANGER_RADIUS: 180,          // 密集判定距離
    STAGE_2SECTOR_START: 6,            // 2セクタ開始ステージ
    SPAWN_MAX_SECTORS: 2,
    SPAWN_SECTOR_MIN_SEP_DEG: 90,      // セクタ間の最低角度差
    SPAWN_QUEUE_MAX: 999,
    SPAWN_RELEASE_PER_FRAME_MAX: 2,
    SPAWN_RELEASE_PER_SEC_MAX: 20,
    ACTIVE_ENEMIES_SOFT_CAP_RATIO: 0.9,

    DANGER_CAP: 12,                    // 危険域内の最大敵数
    SPAWN_BUDGET_PER_SEC: 22,          // 1秒あたりのスポーン予算
    PULSE_RADIUS: 200,                 // パルス範囲
    PULSE_COOLDOWN_MS: 20000,          // パルスCD
    PULSE_KNOCKBACK: 15,               // パルス強度

    BARRIER_RADIUS: 28,                // バリアの当たり判定半径（ダメージ判定 33 より小さく設定）
    BARRIER_DPS: 0.1,                  // バリアの毎秒ダメージ（微弱化）
    BARRIER_KNOCKBACK: 4.0,            // バリアの押し出し強度（強化）
};
