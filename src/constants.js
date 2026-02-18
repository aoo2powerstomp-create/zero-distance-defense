export const CONSTANTS = {
    // 画面設定
    TARGET_WIDTH: 800,
    TARGET_HEIGHT: 800,
    BG_Y_OFFSET: 53, // 背景画像の垂直位置微調整 (炉心と自機の重なり用)

    // デバッグステージID
    STAGE_DEBUG: 999,

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

    // レーザー反射設定
    LASER_BOUNCE_LIMIT: 3,
    LASER_MAX_DISTANCE: 5000, // 画面端までの反射を考慮して大幅に強化
    LASER_HIT_INTERVAL_MS: 100, // 同一敵へのヒット間隔

    // 敵設定
    ENEMY_SIZE: 15,
    ENEMY_BASE_SPEED: 0.96,
    ENEMY_DAMAGE_RATIO: 0.03, // 3%
    ENEMY_CONTACT_COOLDOWN_MS: 250,

    ENEMY_KNOCKBACK_POWER: 4.0,
    ENEMY_KNOCKBACK_DAMP: 0.9,
    ENEMY_KNOCKBACK_MAX: 15,

    // エリート設定
    ELITE_HP_MUL: 8, // 3 -> 8 (User confirmed "High HP")
    ELITE_SIZE_MUL: 1.8,
    ELITE_KB_RESIST: 0.9, // 90%軽減 (Stronger resist)
    ELITE_DAMAGE_MUL: 2.0, // New: Contact damage multiplier
    ELITE_CHARGE: {
        orbitDuration: 3000,
        telegraphDuration: 1000,
        chargeDuration: 1500,
        cooldownDuration: 1000,
        chargeSpeedMul: 3.5,
        minChargeDistance: 250  // Must be within this distance to start charge
    },

    // ボス設定
    BOSS_HP_MUL: 60, // 12 -> 60 (5倍に強化)
    BOSS_SIZE_MUL: 6, // 10 -> 6 (当たり判定縮小)
    BOSS_KB_RESIST: 1.0, // 100%軽減 (ノックバック無効)
    BOSS_SPEED_MUL: 0.6,
    BOSS_SUMMON_INTERVAL_NORMAL_MS: 3000,
    BOSS_SUMMON_INTERVAL_ENRAGED_MS: 1500,
    BOSS_SUMMON_COUNT: 2,
    BOSS_STAGE5_SUMMON_INTERVAL_MUL: 2.5, // [NEW] Stage5Bossの召喚間隔を2.5倍に延ばす
    BOSS_STAGE5_SUMMON_MAX_MINIONS: 4,    // [NEW] Stage5Bossの同時雑魚存在上限
    BOSS_RETREAT_DISTANCE: 220,
    BOSS_STOP_DISTANCE: 280,

    // 画像アセット定義 (キー: 相対パス)
    // 実際にファイルが存在しない場合は既存の図形描画にフォールバックします
    ASSET_MAP: {
        PLAYER: './assets/player/player.png',
        BG_STAGE_01: './assets/bg/bg_stage_01.jpg',
        BG_STAGE_02: './assets/bg/bg_stage_02.jpg',
        BG_STAGE_03: './assets/bg/bg_stage_03.jpg',
        BG_STAGE_04: './assets/bg/bg_stage_04.jpg',
        BG_STAGE_05: './assets/bg/bg_stage_05.jpg',
        BG_STAGE_06: './assets/bg/bg_stage_06.jpg',
        BG_STAGE_07: './assets/bg/bg_stage_07.jpg',
        BG_STAGE_08: './assets/bg/bg_stage_08.jpg',
        BG_STAGE_09: './assets/bg/bg_stage_09.jpg',
        BG_STAGE_10: './assets/bg/bg_stage_10.jpg',
        ENEMY_A: './assets/enemy/icon_enemy_nomal.png',   // NORMAL
        ENEMY_B: './assets/enemy/icon_enemy_zigzag.png',  // ZIGZAG
        ENEMY_C: './assets/enemy/icon_enemy_evasive.png', // EVASIVE
        ENEMY_D: './assets/enemy/icon_enemy_elite.png',   // ELITE
        ENEMY_E: './assets/enemy/icon_enemy_assault.png', // ASSAULT
        ENEMY_F: './assets/enemy/icon_enemy_shielder.png',// SHIELDER
        ENEMY_G: './assets/enemy/icon_enemy_guardian.png',// GUARDIAN
        ENEMY_H: './assets/enemy/icon_enemy_dasher.png',  // DASHER
        ENEMY_I: './assets/enemy/icon_enemy_orbiter.png', // ORBITER
        ENEMY_J: './assets/enemy/icon_enemy_splitter.png',// FLANKER (Use splitter as base)
        ENEMY_K: './assets/enemy/icon_enemy_splitter_child.png', // BARRIER_PAIR
        ENEMY_L: './assets/enemy/icon_enemy_observer.png',// TRICKSTER (Use observer as base)
        ENEMY_M: './assets/enemy/icon_enemy_guardian.png',// ATTRACTOR (Use guardian as base)
        ENEMY_N: './assets/enemy/icon_enemy_elite.png',   // REFLECTOR (Use elite as base)
        ENEMY_O: './assets/enemy/icon_enemy_observer.png',// OBSERVER
        ENEMY_S1: './assets/enemy/icon_enemy_splitter.png',// SPLITTER
        ENEMY_S2: './assets/enemy/icon_enemy_splitter_child.png', // CHILD
        ENEMY_BOSS_5: './assets/enemy/icon_enemy_boss_5.png',
        ENEMY_BOSS_10: './assets/enemy/icon_enemy_boss_10.png',
        ENEMY_PD5: './assets/ui/ui_icon_speed.png', // PLASMA DRONE (Fallback icon)

        // アイテム
        ITEM_HEAL: './assets/item/item_heal.png',
        ITEM_FREEZE: './assets/item/item_freeze.png',
        ITEM_BOMB: './assets/item/item_bomb.png',
        ITEM_OVERDRIVE: './assets/item/item_overdrive.png',
        ITEM_INVINCIBLE: './assets/item/item_invincible.png',
        ITEM_NUKE: './assets/item/item_bomb.png', // Fallback as original is missing
        GOLD: './assets/item/item_coin.png',
        BULLET_RIFLE: './assets/bullet/bullet_Rifle.png',
        BULLET_SHOT: './assets/bullet/bullet_shotgun.png',
        BULLET_LASER: './assets/bullet/bullet_laser.png',
        UI_ICON_RIFLE: './assets/ui/ui_icon_rifle.png',
        UI_ICON_SHOTGUN: './assets/ui/ui_icon_shotgun.png',
        UI_ICON_LASER: './assets/ui/ui_icon_laser.png',
        UI_ICON_SPEED: './assets/ui/ui_icon_speed.png',
        UI_ICON_PULSE: './assets/ui/ui_icon_pulse.png',
    },

    // --- Sound System (SSOT) ---
    SOUND_ASSETS: {
        // BGM
        BGM_STAGE_01: { type: "bgm", file: "assets/sound/bgm/bgm_stage_01.mp3", baseVolume: 0.25 },
        BGM_STAGE_03: { type: "bgm", file: "assets/sound/bgm/bgm_stage_03.mp3", baseVolume: 0.10},
        BGM_BOSS_01: { type: "bgm", file: "assets/sound/bgm/bgm_boss_01.mp3", baseVolume: 0.3 },

        // SE
        SE_BARRIER_01: { type: "se", file: "assets/sound/se/se_barrier_01.mp3" },
        SE_BARRIER_02: { type: "se", file: "assets/sound/se/se_barrier_02.mp3" },

        SE_BREAK_NORMAL: { type: "se", file: "assets/sound/se/se_break_01.mp3" },
        SE_BREAK_SPECIAL: { type: "se", file: "assets/sound/se/se_break_02.mp3" },

        SE_DAMAGE: { type: "se", file: "assets/sound/se/se_damage_01.mp3" },
        SE_PULSE: { type: "se", file: "assets/sound/se/se_impact_01.mp3" },
        SE_HP: { type: "se", file: "assets/sound/se/se_hp.mp3" },

        SE_GUARD_HIT_01: { type: "se", file: "assets/sound/se/se_shot_guard_01.mp3" },
        SE_GUARD_HIT_02: { type: "se", file: "assets/sound/se/se_shot_guard_02.mp3" },

        SE_SHOT_LASER: { type: "se", file: "assets/sound/se/se_shot_laser_03.mp3" },
        SE_SHOT_RIFLE: { type: "se", file: "assets/sound/se/se_shot_rifle_01.mp3" },
        SE_SHOT_SHOTGUN: { type: "se", file: "assets/sound/se/se_shot_shotgun_01.mp3" },

        SE_COUNTDOWN_PI: { type: "se", file: "assets/sound/se/se_contdown_01.mp3" },
        SE_COUNTDOWN_PEEN: { type: "se", file: "assets/sound/se/se_contdown_02.mp3" },
        SE_COIN: { type: "se", file: "assets/sound/se/se_coin_01.mp3" },
        SE_SELECT: { type: "se", file: "assets/sound/se/se_select_01.mp3" },
        SE_DASH_IMPACT: { type: "se", file: "assets/sound/se/se_shot_unknown_01.mp3" },
    },

    BGM_MAPPING: {
        1: "BGM_STAGE_01",
        2: "BGM_STAGE_01",
        3: "BGM_STAGE_03",
        4: "BGM_STAGE_03",
        5: "BGM_BOSS_01",
        6: "BGM_STAGE_03",
        7: "BGM_STAGE_03",
        8: "BGM_STAGE_03",
        9: "BGM_STAGE_03",
        10: "BGM_BOSS_01",
    },

    SOUND_DEFAULTS: {
        BGM_VOLUME: 0.5,
        SE_VOLUME: 0.50,
    },

    SE_VOLUME_MULTIPLIER: {
        SE_SHOT_LASER: 0.4, // さらに引き下げ (0.85 -> 0.3)
        SE_SHOT_RIFLE: 1.0, // 3倍に強化 (0.12 -> 0.36)
        SE_SHOT_SHOTGUN: 1.0, // 少し引き下げ
        SE_COIN: 0.3, // コイン獲得音を引き下げ
        SE_PULSE: 1.8, // パルス衝撃音 (+50%)
    },

    SE_POLYPHONY_LIMIT: {
        SE_SHOT_LASER: 8,
        SE_SHOT_RIFLE: 8,
        SE_SHOT_SHOTGUN: 6,
        DEFAULT: 3
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
            durationMs: 15000,
            damageMul: 1.5,
            stack: 'extend',
            maxDurationMs: 30000
        },
        invincible: {
            rarity: 'RARE',
            durationMs: 10000,
            stack: 'extend',
            maxDurationMs: 20000
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
            baseDamage: 1.2,   // 強化 (1.0 -> 1.2)
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
            baseDamage: 0.78,  // 強化 (0.65 -> 0.78)
            damageScale: 1.06, // 1.15 -> 1.06
            pierceBase: 0,
            speedScale: 0.9,
            baseCooldown: 500,
            minInterval: 120,  // 連射上限（秒間最大8.3回）
            lifeScale: 0.2,    // 初期射程をさらに短縮 (0.4 -> 0.2)
            knockMul: 0.6,
            desc: '3方向拡散射撃。密集処理に特化。命中時に微量回復。'
        },
        pierce: {
            name: 'LASER',
            unlockCost: 0,
            baseDamage: 1.56,  // 強化 (1.3 -> 1.56)
            damageScale: 1.05, // 1.1 -> 1.05
            pierceBase: 2,
            speedScale: 1.8,   // 弾速を1.5倍に強化 (1.2 -> 1.8)
            baseCooldown: 600,
            minInterval: 75,   // 連射上限を緩和 (150 -> 75)
            lifeScale: 5.0,    // 反射が最後まで続くよう寿命を5倍に延長
            knockMul: 1.2,
            desc: '超高速の貫通弾。高HPの敵に特化。命中時に微量回復。'
        }
    },
    ATK_SPEED_GROWTH_RATE: 0.96, // 0.85相当 -> 0.96（緩やかな成長）
    STANDARD_RECOVERY_ON_HIT: 0.002,
    BOSS_DAMAGE_LIMIT_RATIO_PER_SEC: 0.08, // HPの8%/秒（安全装置を強化: 最低約12.5秒かかる設計）
    BOSS_DAMAGE_LIMIT_MIN_DPS: 12.0,      // 最低保証DPS

    // 敵のドロップ獲得金額 (ここが undefined だとエラーになる)
    ENEMY_GOLD: {
        A: 10,  // NORMAL
        B: 15,  // ZIGZAG
        C: 20,  // EVASIVE
        D: 100, // ELITE
        E: 15,  // ASSAULT
        F: 30,  // SHIELDER
        G: 150, // GUARDIAN
        H: 20,  // DASHER
        I: 25,  // ORBITER
        J: 30,  // FLANKER
        K: 30,  // BARRIER_PAIR
        L: 15,  // TRICKSTER
        M: 25,  // ATTRACTOR
        N: 40,  // REFLECTOR
        O: 40,  // OBSERVER
        S1: 30, // SPLITTER
        S2: 5   // SPLITTER_CHILD
    },

    // 敵タイプ
    ENEMY_TYPES: {
        NORMAL: 'A',
        ZIGZAG: 'B',
        EVASIVE: 'C',
        ELITE: 'D',
        ASSAULT: 'E',
        SHIELDER: 'F',
        GUARDIAN: 'G',
        DASHER: 'H',
        ORBITER: 'I',
        FLANKER: 'J',
        BARRIER_PAIR: 'K',
        TRICKSTER: 'L',
        ATTRACTOR: 'M',
        REFLECTOR: 'N',
        OBSERVER: 'O',
        SPLITTER: 'S1',
        SPLITTER_CHILD: 'S2',
        PLASMA_DRONE_STAGE5: 'PD5', // [NEW] 世界観に合わせた追尾プラズマ・ドローン
        RIM_LASER_STAGE5: 'RL5'
    },

    // --- ACTIVE LAYER (Balance Test) ---
    // 検証用: 以下のリストに含まれる敵のみ出現する (空なら全開放)
    ACTIVE_ENEMY_TYPES: [],
    // 検証用: 以下の陣形のみ使用する (空なら全開放)
    ACTIVE_FORMATIONS: [],
    // 検証用: 固定ハードキャップ (0なら無効)
    TEST_HARD_CAP: 0,
    // -----------------------------------

    // 敵の役割分類 (SpawnDirector用)
    ENEMY_ROLES: {
        A: 'CORE',      // NORMAL
        B: 'CORE',      // ZIGZAG
        E: 'CORE',      // ASSAULT
        F: 'CORE',      // SHIELDER
        I: 'CORE',      // ORBITER

        C: 'HARASSER',  // EVASIVE
        H: 'HARASSER',  // DASHER
        J: 'HARASSER',  // FLANKER
        L: 'HARASSER',  // TRICKSTER
        S1: 'HARASSER', // SPLITTER
        S2: 'HARASSER', // SPLITTER_CHILD

        K: 'CONTROLLER',// BARRIER_PAIR
        G: 'CONTROLLER',// GUARDIAN

        M: 'DIRECTOR',  // ATTRACTOR
        O: 'DIRECTOR',  // OBSERVER

        D: 'ELITE',     // ELITE
        N: 'ELITE'      // REFLECTOR
    },

    // 役割ごとの同時出現上限 (厳格化)
    ROLE_LIMITS: {
        CORE: 999,      // 基本兵は制限なし (ENEMY_LIMITが全体キャップ)
        HARASSER: 3,    // 翻弄枠 (5 -> 3)
        CONTROLLER: 1,  // 制圧枠 (組数: BARRIER_PAIR=1, GUARDIAN=1)
        DIRECTOR: 1,    // 指揮枠 (OBSERVER/ATTRACTOR 合計1)
        ELITE: 2        // 強敵枠 (2体まで)
    },

    // 個別タイプの同時出現上限 (理不尽回避)
    TYPE_LIMITS: {
        SHIELDER: 1,    // 最重要: 同時1体まで
        ORBITER: 2,     // 視認負荷対策
        DASHER: 2,      // 瞬殺防止
        SPLITTER: 2,    // 増殖事故防止
        GUARDIAN: 1,
        BARRIER_PAIR: 1, // ペア単位
        OBSERVER: 1
    },

    // スポーンクールダウン (秒) - 連発防止
    SPAWN_COOLDOWNS: {
        SHIELDER: 20,
        GUARDIAN: 40,
        BARRIER_PAIR: 25,
        OBSERVER: 25,
        DASHER: 10,
        ATTRACTOR: 15
    },

    // スポーン予算コスト (Budget)
    SPAWN_COSTS: {
        CORE: 0,
        HARASSER: 1,  // EVASIVE, DASHER, SPLITTER, FLANKER, TRICKSTER
        DIRECTOR: 2,  // OBSERVER, ATTRACTOR
        CONTROLLER: 3,// BARRIER_PAIR, GUARDIAN
        ELITE: 2,     // ELITE, REFLECTOR
        SHIELDER: 2   // 特別扱い
    },

    // ステージ別予算補充量 (15秒毎)
    STAGE_BUDGET_REFILL: {
        1: 1, 2: 1,
        3: 2, 4: 2,
        5: 3, 6: 3,
        7: 4, 8: 4,
        9: 5, 10: 5
    },

    // 新敵タイプ設定
    FLANKER: {
        maxHp: 2,
        speed: 2.8,               // 基本速度を大幅アップ (1.4 -> 2.8)
        backDist: 180,            // プレイヤーの背後に回る際の基準距離
        approachDist: 350,        // 回り込みを開始する距離
        orbitRadius: 220,         // 回り込み中の半径
        chargeSpeedMul: 9.0,      // 超高速突進 (12.0 -> 9.0: ユーザー要望で下方修正)
        maintainDurationMs: 2000, // 2秒間背後を維持
        flankTurnRate: 0.15,      // 回り込み時の俊敏な旋回性能
        spawnRate: 0.05,
        unlockStage: 7
    },
    BARRIER_PAIR: {
        maxDist: 200,
        minDist: 100,
        barrierWidth: 6,
        orbitRadius: 180,
        spawnRate: 0.03,
        unlockStage: 8,
        searchDurationMs: 7000,   // 相方を探す時間
        fleeDistance: 140,         // プレイヤーから逃げる距離
        searchOrbitRadius: 360,   // 索敵時の外周半径
        revengeZigzagAmp: 120,    // 復讐突撃時の蛇行幅
        revengeZigzagFreq: 0.008, // 復讐突撃時の蛇行周波数
        revengeChargeDist: 250    // 復讐突撃（ソニックバースト）開始距離
    },
    TRICKSTER: {
        sizeMul: 0.7,
        zigzagAmp: 80,
        zigzagFreq: 0.005,
        spawnRate: 0.10,
        unlockStage: 5 // Stage 5
    },
    ATTRACTOR: {
        pullRadius: 200,
        pullForce: 0.05,
        maxHp: 4,
        orbitRadius: 300, // 遠巻きに維持
        spawnRate: 0.05,
        unlockStage: 7, // Stage 7
        RED_BONUS: 0.20,   // 攻撃強化ベース値（1スタック当たり）
        BLUE_BONUS: 0.25,  // 機動力強化ベース値（1スタック当たり）
        STACK_MAX: 3,      // 同色最大スタック数
        DECAY: 0.7,        // 減衰係数（スタック増加による効果減衰）
        MAX_ALIVE_RED: 4,  // RED同時存在上限
        MAX_ALIVE_BLUE: 4, // BLUE同時存在上限
        MAX_PER_WAVE: 2    // 1ウェーブ内生成上限
    },
    ATTRACTOR_KIND: {
        RED: 'RED',   // 攻撃強化型
        BLUE: 'BLUE'  // 機動力強化型
    },
    REFLECTOR: {
        reflectAngle: Math.PI / 2, // 前方180度 (半円ビジュアルと同期)
        orbitRadius: 200, // 弾を防ぎやすい距離を維持
        activeDurationMs: 7000,   // 反射有効時間
        vulnerableDurationMs: 3000, // 解除（脆弱）時間
        spawnRate: 0.07,
        unlockStage: 8, // Stage 8
        MAX_ALIVE: 10  // 同時存在上限
    },
    PLASMA_DRONE_STAGE5: {
        v0: 1.5,            // 初速 (90px/s)
        vMax: 2.8,          // 最大速度 (170px/s)
        turnRate: 0.026,    // 旋回制限 (1.6rad/s)
        dischargeDist: 65,  // 放電開始距離
        dischargeRadius: 80,// 放電半径
        accelDist: 220,     // 加速開始距離
        maxHp: 1,           // 耐久力 (1固定)
        intervalMs: 1200,   // 発射間隔 (短縮)
        maxActive: 6,       // 同時存在上限 (増加)
        lifespanMs: 8000,   // 最大寿命
        damage: 0.03        // 放電ダメージ (3% HP)
    },
    RIM_LASER_STAGE5: {
        maxHp: 2,           // 耐久力 (HP2)
        speed: 4.5,         // 外周移動速度
        diveSpeed: 11.0,    // プレイヤーへの突進速度
        intervalMs: 1600,   // 発射間隔
        maxActive: 24,      // 同時存在上限 (Update)
        damage: 0.01,       // 突進ダメージ (1% HP)
        warnDuration: 0.25  // 侵入予告時間（秒）
    },
    RIM_LASER_STAGE10: {
        maxHp: 3,           // 10面は少し硬い
        speed: 5.2,         // 外周早い
        diveSpeed: 14.0,    // 突進も早い
        intervalMs: 1200,   // 発射間隔も短い
        maxActive: 32,      // 同時存在上限 (Stage 10)
        damage: 0.01,
        warnDuration: 0.22  // 猶予も少し短い
    },

    // --- 復活管理システム ---
    // 現在の安定セット（変更しない・基本抽選枠）
    ACTIVE_ENEMY_TYPES: ['A', 'B', 'D', 'E'], // NORMAL, ZIGZAG, ELITE, ASSAULT

    // 復活枠（ここに1個ずつ追加していく）
    UNFROZEN_ENEMY_TYPES: [
        'F', // SHIELDER
        'C', // EVASIVE
        'G', // GUARDIAN
        'H', // DASHER
        'I', // ORBITER
        'J', // FLANKER
        'N', // REFLECTOR
        'L', // TRICKSTER
        'M', // ATTRACTOR
        'O', // OBSERVER
        'K', // BARRIER_PAIR
        'S1' // SPLITTER
    ],

    // 復活エネミー固有のクールダウン（ミリ秒）
    UNFROZEN_COOLDOWNS: {
        'F': 20000, // SHIELDER: 20秒
        'N': 30000, // BARRIER_PAIR: 30秒 (予定)
    },
    // ----------------------

    // スポーン同時上限
    SPAWN_LIMITS: {
        GUARDIAN: 1,
        ORBITER: 2,
        SHIELDER: 2,
        OBSERVER: 1
    },

    ENEMY_FORMATION_TYPES: {
        LINEAR: 'LINEAR',
        PARALLEL: 'PARALLEL', // PINCER
        V_SHAPE: 'V_SHAPE',
        CIRCLE: 'CIRCLE',
        GRID: 'GRID',
        STREAM: 'STREAM',
        CROSS: 'CROSS',
        RANDOM_BURST: 'RANDOM_BURST'
    },
    ENEMY_MOVEMENT_TYPES: {
        DIRECT: 'DIRECT',       // 直線追尾 (NORMAL)
        ZIGZAG: 'ZIGZAG',       // Sine波 (ZIGZAG, SPLITTER)
        ASSAULT: 'ASSAULT',     // 旋回制限付き追尾 (EVASIVE)
        ORBIT: 'ORBIT',         // 周回 (ORBITER)
        FLANK: 'FLANK',         // 背後狙い (FLANKER)
        TRICKSTER: 'TRICKSTER', // S字 (TRICKSTER)
        DASH: 'DASH',           // 回避->突進 (DASHER)
        HOVER: 'HOVER',         // ゆっくり追尾 (SHIELDER, ELITE)
        REFLECT: 'REFLECT',      // 横移動混じり (REFLECTOR)
        AVOID: 'AVOID',         // 照準回避 (BARRIER_PAIR)
        SEARCH: 'SEARCH',       // 索敵・再ペアリング
        REVENGE: 'REVENGE'      // 復讐突撃
    },

    // 敵ごとの基本移動設定
    ENEMY_SPECS: {
        // A
        NORMAL: { mode: 'DIRECT', turnRate: 0 }, // 0=無限
        // B
        ZIGZAG: { mode: 'ZIGZAG', freq: 0.005, amp: 80 },
        // C
        EVASIVE: { mode: 'ASSAULT', turnRate: 0.08 }, // Old EVASIVE const, kept for compat if needed, but EVASIVE type uses EVASIVE mode now
        // D
        ELITE: { mode: 'ELITE', turnRate: 0.04 },
        // E (ASSAULT -> ASSAULT_CURVE)
        ASSAULT: { mode: 'ASSAULT_CURVE', turnRate: 0.1 },
        // E (Splitter)
        SPLITTER: { mode: 'ZIGZAG', freq: 0.008, amp: 60 },
        // F
        SHIELDER: { mode: 'HOVER', turnRate: 0.03 },
        // H
        DASHER: { mode: 'DASH' },
        // I
        ORBITER: { mode: 'ORBIT', radius: 250 },
        // J/K Splitter Child
        SPLITTER_CHILD: { mode: 'ZIGZAG', freq: 0.01, amp: 40 },
        // M
        FLANKER: { mode: 'FLANK', turnRate: 0.06 },
        // O
        TRICKSTER: { mode: 'TRICKSTER' },
        // Q
        REFLECTOR: { mode: 'REFLECT' },
        GUARDIAN: { mode: 'HOVER', turnRate: 0.02 },
        BARRIER_PAIR: { mode: 'AVOID', orbitRadius: 240, turnRate: 0.05 },
        OBSERVER: { mode: 'HOVER', turnRate: 0.05 },
        ATTRACTOR: { mode: 'HOVER', turnRate: 0.03 }
    },

    ENEMY_MIN_SPEED_RATIO: 0.6,     // 最至近での速度比率 (40%減)
    ENEMY_SPEED_ADJUST_RADIUS: 180, // 減速を開始する距離 (px)

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

    // アサルト設定
    ASSAULT_CURVE: {
        weaveFreq: 0.004,
        weaveAmp: 65 * (Math.PI / 180), // 45 -> 65度 (More snake)
        triggerDist: 180, // 280 -> 180 (Close range charge)
        telegraphDuration: 600, // 予兆スキ（溜め）
        chargeSpeedMul: 2.5,
        turnRateWhileWeaving: 0.08
    },

    // シールダー(Shielder)設定
    SHIELDER: {
        maxHp: 6,                 // 基本HP
        unlockStage: 3,           // Stage 3
        speed: 2.6,               // 基本速度
        orbitRadius: 160,         // 維持する半径 (220 -> 160)
        orbitRadiusMin: 120,      // (170 -> 120)
        orbitRadiusMax: 200,      // (260 -> 200)
        orbitAngularSpeed: 0.045, // 旋回角速度
        retreatBoost: 1.6,
        approachBoost: 1.2,

        barrierWindupMs: 800,     // 予兆時間を少し延長 (250 -> 800)
        barrierDurationMs: 10000, // ★設置されたシールドの持続時間（10秒）
        barrierCooldownMs: 3200,  // 次の予兆までのクールダウン
        damageMultiplierWhileBarrier: 0.1, // シールド内での通常軽減（全ダメージ1化を優先適用するが、念のため）

        vulnerableMs: 650,        // 弱点（露出）時間
        vulnerableDamageMultiplier: 1.8,   // 弱点中の被ダメ倍率
        speedMultiplierWhileVulnerable: 0.8, // 弱点中の速度低下

        auraRadius: 90,           // この範囲内の味方を守る (110 -> 90)
        minDamageRatio: 0.1       // 軽減後の最低保証ダメージ (10%は通る)
    },

    // ガーディアン(Guardian)設定 - 全画面バフ
    GUARDIAN: {
        maxHp: 12,
        unlockStage: 5,           // Stage 5
        speed: 1.8,               // シールダーより遅い
        orbitRadius: 220,         // より遠巻きに旋回 (280 -> 220)
        orbitRadiusMin: 180,      // (240 -> 180)
        orbitRadiusMax: 260,      // (320 -> 260)
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
        speed: 1.1,
        windupMs: 800,
        dashSpeedMultiplier: 6.0, // Increased from 3.0 to 6.0 for real speed
        dashCooldownMs: 3200,
        dashDurationMs: 400,      // Shorter duration for high-speed burst
        windupVulnerableMultiplier: 1.6
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
        speed: 1.0,               // ベース速度
        splitCount: 2,
        dashSpeedMultiplier: 5.0, // 「ビュン」の速さ
        dashDurationMs: 300,      // 移動時間
        pauseDurationMs: 600      // 「ピタ」の停止時間
    },
    SPLITTER_CHILD: {
        maxHp: 1,
        speedMultiplier: 1.5,
        sizeMul: 0.7,
        zigzagFreq: 0.006,
        zigzagAmp: 30
    },
    OBSERVER: {
        speedMul: 1.0,
        unlockStage: 5,           // Stage 5
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
        { hpMul: 2.4, speedMul: 1.26, spawnMul: 2.1, enemyCount: 400, spawnInterval: 200 }, // Stage 6 (240 -> 200)
        { hpMul: 3.0, speedMul: 1.30, spawnMul: 2.4, enemyCount: 550, spawnInterval: 150 }, // Stage 7 (200 -> 150)
        { hpMul: 3.8, speedMul: 1.35, spawnMul: 2.7, enemyCount: 550, spawnInterval: 100 }, // Stage 8 (750 -> 550)
        { hpMul: 4.8, speedMul: 1.39, spawnMul: 3.0, enemyCount: 570, spawnInterval: 80 },  // Stage 9 (1000 -> 570)
        { hpMul: 6.0, speedMul: 1.43, spawnMul: 3.5, enemyCount: 1500, spawnInterval: 60 }   // Stage 10 (100 -> 60)
    ],

    // アップグレード設定
    UPGRADE_LV_MAX: 30,
    UPGRADE_COST_GROWTH_WEAPON: 1.20, // 武器コスト上昇率
    UPGRADE_COST_GROWTH_SPEED: 1.18,  // 速度コスト上昇率
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
    ECON_GROWTH_BASE: 1.18, // ステージごとのゴールド増加倍率 (指数)

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
        HOWTO: 8,
        OPTIONS: 9,
    },

    // localStorage 用のキー [NEW]
    STORAGE_KEYS: {
        SE_VOLUME: 'opt_seVolume',
        BGM_VOLUME: 'opt_bgmVolume',
        GAME_SPEED: 'opt_gameSpeed',
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
    SPAWN_SECTOR_MIN_SEP_DEG: 80,      // セクタ間の最低角度差
    SPAWN_SECTOR_MAX_SEP_DEG: 150,     // セクタ間の最大角度差（挟み撃ち防止）
    SPAWN_QUEUE_MAX: 999,
    SPAWN_RELEASE_PER_FRAME_MAX: 2,
    SPAWN_RELEASE_PER_SEC_MAX: 20,
    ACTIVE_ENEMIES_SOFT_CAP_RATIO: 0.9,

    DANGER_CAP: 12,                    // 危険域内の最大敵数
    SPAWN_BUDGET_PER_SEC: 22,          // 1秒あたりのスポーン予算
    PULSE_RADIUS: 200,                 // パルス範囲
    PULSE_COOLDOWN_MS: 3000,           // パルスCD (20000 -> 3000: テストおよび爽快感のため短縮)
    PULSE_KNOCKBACK: 36,               // パルス強度 (24 * 1.5 = 36)

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
            item: 1,             // アイテム使用1回あたり減点
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
    DEFAULT_TARGET_TIME_SEC: 90,
    ENEMY_DESCRIPTIONS: {
        'A': { name: 'NORMAL', jpName: 'ノーマル', desc: '標準的なエネミー。まっすぐ自機に向かって進みます。', strategy: '基本の敵。落ち着いて射線を合わせましょう。', danger: 1 },
        'B': { name: 'ZIGZAG', jpName: 'ジグザグ', desc: '蛇行しながら接近するエネミー。狙いを定めるのが少し難しい。', strategy: '動きの先を読んで撃つか、引き付けてから倒しましょう。', danger: 2 },
        'C': { name: 'EVASIVE', jpName: 'エヴァイシブ', desc: '回避型。自機にある程度近づくと、左右に避ける動きを見せます。', strategy: '回避行動の終わり際を狙うのが効果的です。', danger: 2 },
        'D': { name: 'ELITE', jpName: 'エリート', desc: '精鋭。高いHPを持ち、周囲を旋回してから強力な突撃を仕掛けます。', strategy: '突撃の予備動作中に集中攻撃で仕留めましょう。', danger: 4 },
        'E': { name: 'ASSAULT', jpName: 'アサルト', desc: '突撃型。一定距離まで近づくと、直線的に加速して体当たりを狙います。', strategy: '加速し始めたら横に避けるか、ノックバックで弾きましょう。', danger: 3 },
        'F': { name: 'SHIELDER', jpName: 'シールダー', desc: '盾持ち。周囲の敵を保護するエネルギーバリアを展開します。', strategy: '守られている敵を狙う前に、まず本体を排除しましょう。', danger: 3 },
        'G': { name: 'GUARDIAN', jpName: 'ガーディアン', desc: '守護者。周囲の敵の攻撃力や速度を強化するバフを付与します。', strategy: 'バフの影響範囲は広いため、優先的に倒すべき対象です。', danger: 4 },
        'H': { name: 'DASHER', jpName: 'ダッシャー', desc: '高速蛇行型。不規則に素早く揺れながら接近し、幻惑します。', strategy: '弾幕の広い武器や、引き付けたパルスが有効です。', danger: 3 },
        'I': { name: 'ORBITER', jpName: 'オービター', desc: '軌道周回型。自機の周囲を一定距離で回り続け、隙を伺います。', strategy: '旋回速度に合わせて少しずつ狙いを動かして撃破しましょう。', danger: 2 },
        'J': { name: 'FLANKER', jpName: 'フランカー', desc: '暗殺型。側面や背後に回り込んで潜伏し、一等一瞬の隙を突いて超高速突撃します。', strategy: '常に周囲を見渡し、死角からの接近を許さないように。', danger: 5 },
        'K': { name: 'BARRIER_PAIR', jpName: 'バリアペア', desc: '連結型。2体1組で現れ、その間に破壊不可能なレーザーバリアを張ります。', strategy: 'どちらか1体を素早く倒せば、バリアを消滅させられます。', danger: 4 },
        'L': { name: 'TRICKSTER', jpName: 'トリックスター', desc: '幻惑型。テレポートや急な方向転換でプレイヤーを翻弄します。', strategy: '出現した瞬間を狙うか、広範囲の攻撃に巻き込みましょう。', danger: 4 },
        'M': { name: 'ATTRACTOR', jpName: 'アトラクター', desc: '追加型。周囲の敵を自身に引き寄せ、盾のような役割を果たします。', strategy: '貫通武器を使って、盾となっている敵ごと本体を撃ちましょう。', danger: 3 },
        'N': { name: 'REFLECTOR', jpName: 'リフレクター', desc: '反射型。正面からの攻撃を弾き返します。', strategy: '背後や側面から攻撃するか、高火力の貫通武器を使いましょう。', danger: 4 },
        'O': { name: 'OBSERVER', jpName: 'オブザーバー', desc: '観測者。一定距離で停止し、じっと自機を観察（威圧）しながら位置情報を共有します。', strategy: '直接的な攻撃はありませんが、放置すると包囲網が狭まります。', danger: 3 },
        'S1': { name: 'SPLITTER', jpName: 'スプリッター', desc: '分裂型。倒されると複数の小型エネミー（S2）に分裂します。', strategy: '分裂後の敵は弱いため、連射の効く武器で一掃しましょう。', danger: 2 },
        'S2': { name: 'CHILD', jpName: 'チャイルド', desc: '分裂後の小型個体。非常に弱いが数で攻めてきます。', strategy: '単体では無害ですが、囲まれる前に処理しましょう。', danger: 1 },
        'PD5': { name: 'PLASMA DRONE', jpName: 'プラズマドローン', desc: '追尾ドローン。接近すると加速・放電します。', strategy: '耐久力は低いため、近づかれる前に撃ち落としましょう。', danger: 2 }
    }
};
