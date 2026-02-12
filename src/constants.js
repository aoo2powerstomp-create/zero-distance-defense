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
    BULLET_SIZE: 5,
    BULLET_LIMIT: 60,

    // 敵設定
    ENEMY_SIZE: 15,
    ENEMY_BASE_SPEED: 1.5,
    ENEMY_DAMAGE_RATIO: 0.03, // 3%
    ENEMY_CONTACT_COOLDOWN_MS: 250,
    ENEMY_LIMIT: 100,
    ENEMY_KNOCKBACK_POWER: 4.0,
    ENEMY_KNOCKBACK_DAMP: 0.9,
    ENEMY_KNOCKBACK_MAX: 15,

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
        EVASIVE: 'C'
    },
    // ジグザグ設定
    ZIGZAG_AMP: 60,   // 振幅
    ZIGZAG_FREQ: 0.003, // 周波数 (0.005から軽減)
    // 回避設定
    EVASIVE_ANGLE: 20 * (Math.PI / 180), // 回避時にずらす角度 (20度)
    EVASIVE_TRIGGER_ARC: 15 * (Math.PI / 180), // 射線付近とみなす角度 (15度)
    EVASIVE_DURATION_MS: 1200, // 回避行動を続ける時間

    // ステージ定義
    STAGE_DATA: [
        { hpMul: 1.0, speedMul: 1.0, spawnMul: 1.0, enemyCount: 20, spawnInterval: 1000 },
        { hpMul: 1.25, speedMul: 1.1, spawnMul: 1.25, enemyCount: 30, spawnInterval: 800 },
        { hpMul: 1.6, speedMul: 1.2, spawnMul: 1.55, enemyCount: 45, spawnInterval: 700 },
        { hpMul: 2.05, speedMul: 1.33, spawnMul: 1.9, enemyCount: 60, spawnInterval: 600 },
        { hpMul: 2.65, speedMul: 1.5, spawnMul: 2.3, enemyCount: 80, spawnInterval: 500 }
    ],

    // アップグレード設定
    UPGRADE_LV_MAX: 10,
    UPGRADE_COST_MUL: 1.35,
    UPGRADE_WEAPON_BASE: 40,
    UPGRADE_ATK_SPEED_BASE: 80,

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
};
