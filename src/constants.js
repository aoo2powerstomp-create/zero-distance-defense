export const CONSTANTS = {
    // 画面設定
    TARGET_WIDTH: 800,
    TARGET_HEIGHT: 800,
    BG_Y_OFFSET: 53, // 背景画像の垂直位置微調整 (炉心と自機の重なり用)

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
    ENEMY_BASE_SPEED: 0.96,
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
    BOSS_SIZE_MUL: 10,
    BOSS_KB_RESIST: 0.7, // 70%軽減
    BOSS_SPEED_MUL: 0.6,
    BOSS_SUMMON_INTERVAL_NORMAL_MS: 4000,
    BOSS_SUMMON_INTERVAL_ENRAGED_MS: 2000,
    BOSS_SUMMON_INTERVAL_ENRAGED_MS: 2000,
    BOSS_SUMMON_COUNT: 3,

    // 画像アセット定義 (キー: 相対パス)
    // 実際にファイルが存在しない場合は既存の図形描画にフォールバックします
    ASSET_MAP: {
        PLAYER: './assets/player/player.png',
        BG_STAGE_01: './assets/bg/bg_stage_01.jpg',
        ENEMY_A: './assets/enemy/icon_enemy_nomal.png',   // NORMAL
        ENEMY_B: './assets/enemy/icon_enemy_zigzag.png',  // ZIGZAG
        ENEMY_C: './assets/enemy/icon_enemy_evasive.png', // EVASIVE
        ENEMY_D: './assets/enemy/icon_enemy_elite.png',   // ELITE
        ENEMY_E: './assets/enemy/icon_enemy_assault.png', // ASSAULT
        ENEMY_F: './assets/enemy/icon_enemy_shielder.png',// SHIELDER
        ENEMY_G: './assets/enemy/icon_enemy_guardian.png',// GUARDIAN
        ENEMY_H: './assets/enemy/icon_enemy_dasher.png',  // DASHER
        ENEMY_I: './assets/enemy/icon_enemy_orbiter.png', // ORBITER
        ENEMY_J: './assets/enemy/icon_enemy_splitter.png',// SPLITTER
        ENEMY_K: './assets/enemy/icon_enemy_splitter_child.png', // SPLITTER_CHILD
        ENEMY_L: './assets/enemy/icon_enemy_observer.png',// OBSERVER
        ENEMY_BOSS_5: './assets/enemy/icon_enemy_boss_5.png',
        ENEMY_BOSS_10: './assets/enemy/icon_enemy_boss_10.png',

        // アイテム
        ITEM_HEAL: './assets/item_heal.png',
        ITEM_FREEZE: './assets/item_freeze.png',
        ITEM_BOMB: './assets/item_bomb.png',
        ITEM_OVERDRIVE: './assets/item_overdrive.png',
        ITEM_INVINCIBLE: './assets/item_invincible.png',
        ITEM_NUKE: './assets/item_nuke.png',
    },

    // 武器タイプ
    WEAPON_TYPES: {
        STANDARD: 'standard',
        SHOT: 'shot',
        PIERCE: 'pierce'
    },

    // アイテム設定
    ITEM_TYPES: {
        // Common
        HEAL: 'heal',
        FREEZE: 'freeze',
        BOMB: 'bomb',
        // Rare
        OVERDRIVE: 'overdrive',
        INVINCIBLE: 'invincible',
        NUKE: 'nuke'
    },
    ITEM_CONFIG: {
        dropChanceNormal: 0.03,
        dropChanceElite: 0.06,
        maxCount: 3,
        lifetimeMs: 8000,
        pickupRadius: 36, // クリック判定 (24 -> 36: 押しやすさ重視)

        RARE_RATE: 0.1, // 10%でRARE

        healAmountRatio: 0.2, // 20%回復
        freezeDurationMs: 2500,
        freezeSpeedMultiplier: 0.2,
        bombRadius: 180,
        bombEliteDamageRatio: 0.5 // エリートは50%削る
    },

    // ドロップ抽選テーブル (weighted random)
    ITEM_TABLE: {
        COMMON: [
            { key: 'heal', weight: 50 },
            { key: 'freeze', weight: 30 },
            { key: 'bomb', weight: 20 }
        ],
        RARE: [
            { key: 'overdrive', weight: 45 },
            { key: 'invincible', weight: 35 },
            { key: 'nuke', weight: 20 }
        ]
    },

    // アイテム定義 (メタデータ)
    ITEM_DEFS: {
        heal: { rarity: 'COMMON' },
        freeze: { rarity: 'COMMON' },
        bomb: { rarity: 'COMMON' },

        overdrive: {
            rarity: 'RARE',
            durationMs: 10000,
            damageMul: 1.5,
            stack: 'extend',
            maxDurationMs: 20000
        },
        invincible: {
            rarity: 'RARE',
            durationMs: 2000,
            stack: 'extend',
            maxDurationMs: 4000
        },
        nuke: {
            rarity: 'RARE'
        }
    },

    // アイテム演出設定
    ITEM_VFX: {
        spawnPopMs: 180,
        landingRingMs: 220,
        floatAmpPx: 3,
        floatPeriodMs: 900,
        pulseScaleAmp: 0.05,
        pulsePeriodMs: 1200,
        blinkStartMs: 1200,
        blinkFastMs: 600,
        pickupSuctionMs: 220,
        maxRings: 10
    },

    ITEM_VISUALS: {
        heal: { color: '#00ff88', icon: '+' },
        freeze: { color: '#00ccff', icon: '❄' },
        bomb: { color: '#ff4400', icon: 'B' },

        overdrive: { color: '#ff0055', icon: '⚡' }, // Red/Pink
        invincible: { color: '#ffd700', icon: '★' }, // Gold
        nuke: { color: '#aa00ff', icon: '☢' } // Purple
    },

    WEAPON_CONFIG: {
        standard: {
            name: 'RIFLE',
            unlockCost: 0,
            baseDamage: 1.0,
            damageScale: 1.08, // 1.2 -> 1.08（インフレ抑制）
            pierceBase: 0,
            speedScale: 1.0,
            baseCooldown: 350,
            minInterval: 80,   // 連射上限（秒間最大12.5回）
            lifeScale: 1.0,
            knockMul: 1.0,
            desc: '基本の単発射撃。命中時に微量回復。'
        },
        shot: {
            name: 'SHOTGUN',
            unlockCost: 0,
            baseDamage: 0.65,
            damageScale: 1.06, // 1.15 -> 1.06
            pierceBase: 0,
            speedScale: 0.9,
            baseCooldown: 500,
            minInterval: 120,  // 連射上限（秒間最大8.3回）
            lifeScale: 0.2,    // 初期射程をさらに短縮 (0.4 -> 0.2)
            knockMul: 0.6,
            desc: '3方向拡散射撃。密集処理に特化。'
        },
        pierce: {
            name: 'LASER',
            unlockCost: 0,
            baseDamage: 1.3,
            damageScale: 1.05, // 1.1 -> 1.05
            pierceBase: 2,
            speedScale: 1.2,
            baseCooldown: 600,
            minInterval: 75,   // 連射上限を緩和 (150 -> 75)
            lifeScale: 1.0,
            knockMul: 1.2,
            desc: '超高速の貫通弾。高HPの敵に特化。'
        }
    },
    ATK_SPEED_GROWTH_RATE: 0.96, // 0.85相当 -> 0.96（緩やかな成長）
    STANDARD_RECOVERY_ON_HIT: 0.002,
    BOSS_DAMAGE_LIMIT_RATIO_PER_SEC: 0.2, // HPの20%/秒（安全装置）
    BOSS_DAMAGE_LIMIT_MIN_DPS: 12.0,      // 最低保証DPS

    // 敵タイプ
    ENEMY_TYPES: {
        NORMAL: 'A',
        ZIGZAG: 'B',
        EVASIVE: 'C',
        ELITE: 'D',
        ASSAULT: 'E', // 突撃型
        SHIELDER: 'F', // オーラ型バリア
        GUARDIAN: 'G', // 全画面バフ型
        DASHER: 'H',   // 突進型
        ORBITER: 'I',  // 旋回型
        SPLITTER: 'J', // 分裂型
        SPLITTER_CHILD: 'K', // 分裂後の小型
        OBSERVER: 'L'       // 観察者
    },

    // スポーン同時上限
    SPAWN_LIMITS: {
        GUARDIAN: 1,
        ORBITER: 2,
        SHIELDER: 2,
        OBSERVER: 1
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

    // シールダー(Shielder)設定
    SHIELDER: {
        maxHp: 6,                 // 基本HP
        speed: 2.6,               // 基本速度
        orbitRadius: 220,         // 維持する半径
        orbitRadiusMin: 170,
        orbitRadiusMax: 260,
        orbitAngularSpeed: 0.045, // 旋回角速度
        retreatBoost: 1.6,
        approachBoost: 1.2,

        barrierWindupMs: 250,     // 予兆時間
        barrierDurationMs: 900,   // バリア持続時間
        barrierCooldownMs: 3200,  // バリア再使用間隔
        damageMultiplierWhileBarrier: 0.1, // バリア中の被ダメ倍率

        vulnerableMs: 650,        // 弱点（露出）時間
        vulnerableDamageMultiplier: 1.8,   // 弱点中の被ダメ倍率
        speedMultiplierWhileVulnerable: 0.8, // 弱点中の速度低下

        auraRadius: 90,           // この範囲内の味方を守る (110 -> 90)
        minDamageRatio: 0.1       // 軽減後の最低保証ダメージ (10%は通る)
    },

    // ガーディアン(Guardian)設定 - 全画面バフ
    GUARDIAN: {
        maxHp: 12,
        speed: 1.8,               // シールダーより遅い
        orbitRadius: 280,         // より遠巻きに旋回
        orbitRadiusMin: 240,
        orbitRadiusMax: 320,
        orbitAngularSpeed: 0.03,
        retreatBoost: 1.4,
        approachBoost: 1.1,

        barrierWindupMs: 400,
        barrierDurationMs: 1200,
        barrierCooldownMs: 4500,
        damageMultiplierWhileBarrier: 0.1,

        vulnerableMs: 800,
        vulnerableDamageMultiplier: 2.0,
        speedMultiplierWhileVulnerable: 0.5,
        globalBuffDamageMultiplier: 1.2, // 全体バフ時の攻撃力倍率 (20%UP)
        globalBuffSpeedMultiplier: 1.2   // 全体バフ時の速度倍率 (20%UP)
    },

    // 新敵設定
    DASHER: {
        maxHp: 3,
        speed: 1.2,               // 通常時は並
        windupMs: 500,            // 予兆時間
        dashSpeedMultiplier: 4.0, // 突進倍率
        dashCooldownMs: 3000,     // サイクル
        dashDurationMs: 600,      // 突進時間
        windupVulnerableMultiplier: 1.5 // 予兆中は被弾1.5倍
    },
    ORBITER: {
        maxHp: 2,
        speed: 2.5,
        orbitRadius: 220,
        orbitRadiusMin: 170,
        orbitRadiusMax: 260,
        orbitAngularSpeed: 0.04
    },
    SPLITTER: {
        maxHp: 4,
        speed: 1.2,
        splitCount: 2
    },
    SPLITTER_CHILD: {
        maxHp: 1,
        speedMultiplier: 1.5,
        sizeMul: 0.7
    },
    OBSERVER: {
        maxHp: 5,            // 低め（当てられたら倒せる）
        speed: 0,            // 移動はSNAPで扱う
        observerRadius: 260, // 外周半径
        slots: 12,           // 円周スロット数
        snapMs: 450,         // SNAP時間（120ms -> 450ms に増加: より滑らかに）
        holdMs: 800,         // 静止時間（狙い撃つチャンス）

        markWindupMs: 300,   // HOLD開始からマーキングまでの予兆
        globalBuffSpeedMul: 1.10,  // 全体速度バフ（軽く）
        globalBuffDurationMs: 1500 // 継続時間
    },

    // ステージ定義 (序盤の難易度カーブを大幅に緩和)
    STAGE_DATA: [
        { hpMul: 1.0, speedMul: 1.00, spawnMul: 1.0, enemyCount: 40, spawnInterval: 1000 }, // Stage 1 (さらに緩和)
        { hpMul: 1.1, speedMul: 1.02, spawnMul: 1.1, enemyCount: 60, spawnInterval: 900 },  // Stage 2 (詰みポイントの緩和)
        { hpMul: 1.3, speedMul: 1.05, spawnMul: 1.3, enemyCount: 100, spawnInterval: 700 }, // Stage 3
        { hpMul: 1.6, speedMul: 1.10, spawnMul: 1.5, enemyCount: 180, spawnInterval: 500 }, // Stage 4
        { hpMul: 2.0, speedMul: 1.15, spawnMul: 1.8, enemyCount: 350, spawnInterval: 300 }, // Stage 5
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

    // 回避性能
    EVASIVE_COOLDOWN_MS: 800, // 回避のクールタイム
    ENEMY_AFFINITIES: {
        SWARM: 'S',   // 小型・数
        ARMORED: 'A', // 高耐久
        PHASE: 'P'    // 特殊移動
    },

    AFFINITY_COLORS: {
        S: '#00ff44', // 緑
        A: '#ff00ff', // 紫
        P: '#ffff00'  // 黄
    },

    // 相性倍率マトリックス (武器 x 敵属性)
    // ダメージ倍率
    AFFINITY_DAMAGE_MATRIX: {
        standard: { S: 0.90, A: 1.25, P: 1.00 }, // RIFLE vs ARMORED(+)
        shot: { S: 1.25, A: 0.85, P: 1.00 },     // SHOTGUN vs SWARM(+)
        pierce: { S: 1.00, A: 0.95, P: 1.25 }    // LASER vs PHASE(+)
    },

    // ノックバック倍率 (任意: 微調整)
    AFFINITY_KNOCK_MATRIX: {
        standard: { S: 1.0, A: 1.1, P: 1.0 },
        shot: { S: 1.1, A: 0.9, P: 1.0 },
        pierce: { S: 1.0, A: 1.0, P: 1.1 }
    },

    // 属性出現率 (StageProgressに応じて変化させるためのベース)
    // [SWARM, ARMORED, PHASE]
    // 初期武器 RIFLE は ARMORED に強いため、序盤は ARMORED を多めにする
    AFFINITY_SPAWN_RATES: [
        { stage: 0, rates: [0.20, 0.75, 0.05] }, // Stage 1 (RIFLE 活躍期)
        { stage: 4, rates: [0.45, 0.35, 0.20] }, // Stage 5 (SHOT / LASER 導入期)
        { stage: 9, rates: [0.35, 0.35, 0.30] }  // Stage 10 (混戦)
    ],

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
            KNOCK_POWER: 0.5,     // 追加ノックバック
            ATK_SPEED_MUL_MAX: 2.0 // 追加連射倍率 (Lv30で2倍)
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
    SPAWN_SECTOR_ANGLE: 90,           // 出現扇形の角度 (120 -> 90: より方位を限定)
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
    PULSE_COOLDOWN_MS: 3000,           // パルスCD (20000 -> 3000: テストおよび爽快感のため短縮)
    PULSE_KNOCKBACK: 24,               // パルス強度 (15 -> 24: ベース強化)

    // PULSE 強化演出設定
    PULSE_VFX: {
        RING_COUNT: 3,
        RING_LIFE_MS: 520,
        RING_START_R: 40,
        RING_END_R: 200,     // PULSE_RADIUS に合わせる
        OUTLINE_MS: 120,
        SHAKE_MS: 180,
        SHAKE_MAX_PX: 3
    },
    PULSE_KNOCKBACK_PARAMS: {
        FALLOFF_POWER: 1.5,
        MIN_FACTOR: 0.15
    },

    BARRIER_RADIUS: 28,                // バリアの当たり判定半径（ダメージ判定 33 より小さく設定）
    BARRIER_DPS: 0.1,                  // バリアの毎秒ダメージ（微弱化）
    BARRIER_SAFE_RADIUS: 180,           // バリアが安全に展開できる距離
    BARRIER_INSTANT_KILL_TYPES: ['A', 'B', 'C', 'E'], // 即死対象: NORMAL, ZIGZAG, EVASIVE, ASSAULT
    BARRIER_MAX_CHARGES: 3,             // バリア即死の最大ストック数
    BARRIER_REGEN_MS: 1500,             // ストックの回復時間

    // ランク評価システム
    RANK_RULES: {
        baseScore: 100,
        penalty: {
            hit: 8,              // 被弾1回あたり減点
            item: 5,             // アイテム使用1回あたり減点
            overtimePerSec: 0.2  // 目標時間超過1秒あたり減点
        },
        thresholds: [
            { rank: "SSS", minScore: 97 },
            { rank: "SS", minScore: 92 },
            { rank: "S", minScore: 86 },
            { rank: "A+", minScore: 78 },
            { rank: "A-", minScore: 70 },
            { rank: "A", minScore: 62 },
            { rank: "B", minScore: 52 },
            { rank: "C", minScore: 42 },
            { rank: "D", minScore: 30 },
            { rank: "F", minScore: 0 }
        ]
    },

    STAGE_TARGET_TIME_SEC: {
        1: 60,
        2: 70,
        3: 80,
        4: 90,
        5: 100,
        6: 120, // Stage 6以降は敵数が多いので長めに
        7: 130,
        8: 140,
        9: 150,
        10: 180
    },
    DEFAULT_TARGET_TIME_SEC: 90
};
