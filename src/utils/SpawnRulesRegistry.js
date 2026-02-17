/**
 * SpawnRulesRegistry.js
 * Centralized registry for spawn constraints.
 */
export class SpawnRulesRegistry {
    constructor() {
        this.rules = [];
    }

    /**
     * @param {Object} ruleObject
     */
    register(ruleObject) {
        const rule = {
            type: ruleObject.type, // 'CAP' | 'LIMIT' | 'FLOOR' | 'EXCLUSION' | 'POSITION' | 'REPLACEMENT'
            target: ruleObject.target,
            threshold: ruleObject.threshold,
            scope: ruleObject.scope || 'alive', // 'alive' | 'perWave' | 'perTick'
            stageCondition: ruleObject.stageCondition || (() => true),
            severity: ruleObject.severity || 'BLOCK',
            // For POSITION or custom checks
            validator: ruleObject.validator || null
        };
        this.rules.push(rule);
    }

    /**
     * Validates a spawn decision against all applicable rules.
     * @param {Object} decision 
     * @param {Object} ctx 
     * @returns {Array<Object>} violations
     */
    validate(decision, ctx) {
        const violations = [];
        for (const rule of this.rules) {
            // Apply stage condition
            if (!rule.stageCondition(ctx)) continue;

            let isViolated = false;
            let currentValue = 0;

            const target = rule.target;
            const type = decision.type;

            // 1. Check if the rule applies to this decision
            const isMatch = (target === 'ANY') || (target === type);
            if (!isMatch && rule.type !== 'POSITION') continue;

            // 2. Perform check based on rule type
            switch (rule.type) {
                case 'CAP':
                case 'LIMIT':
                case 'FLOOR':
                    currentValue = this._getCurrentValue(rule, ctx);
                    if (rule.type === 'FLOOR') {
                        if (currentValue < rule.threshold) isViolated = true;
                    } else {
                        if (currentValue >= rule.threshold) isViolated = true;
                    }
                    break;
                case 'EXCLUSION':
                    if (rule.scope === 'formation' && decision.pattern !== 'NONE') {
                        isViolated = true;
                    }
                    break;
                case 'POSITION':
                    if (rule.validator && !rule.validator(decision, ctx)) {
                        isViolated = true;
                    }
                    break;
            }

            if (isViolated) {
                violations.push({
                    ruleType: rule.type,
                    target: rule.target,
                    currentValue,
                    threshold: rule.threshold,
                    severity: rule.severity
                });
            }
        }
        return violations;
    }

    /**
     * 日本語でのルール概要を生成します。
     */
    dumpRules() {
        let output = '=== 生成ルール一覧 (SSOT) ===\n';
        for (const rule of this.rules) {
            const severityStr = rule.severity === 'BLOCK' ? '【強制置換】' : '【警告のみ】';
            let ruleText = '';

            // スコープの日本語訳
            const scopeMap = {
                'alive': '生存数',
                'perWave': 'ウェーブ内出現数',
                'perTick': 'Tick内出現数',
                'formation': '隊列生成'
            };
            const scopeJP = scopeMap[rule.scope] || rule.scope;

            const op = (rule.type === 'FLOOR') ? '以上' : '以下';
            const valueDesc = (rule.type === 'EXCLUSION' || rule.type === 'POSITION') ? '' : `が ${rule.threshold} ${op}`;

            switch (rule.type) {
                case 'CAP':
                    ruleText = `[上限] ${rule.target} の${scopeJP}${valueDesc}であること`;
                    break;
                case 'LIMIT':
                    ruleText = `[制限] ${rule.target} の${scopeJP}${valueDesc}であること`;
                    break;
                case 'FLOOR':
                    ruleText = `[最低保証] ${rule.target} の${scopeJP}${valueDesc}であること`;
                    break;
                case 'EXCLUSION':
                    ruleText = `[禁止] ${rule.target} は ${scopeJP} を禁止`;
                    break;
                case 'POSITION':
                    ruleText = `[位置] ${rule.target} の近接生成を制限`;
                    break;
                case 'REPLACEMENT':
                    ruleText = `[置換] ${rule.target} を置換`;
                    break;
            }

            // Stage condition
            let conditionText = '常時有効';
            if (rule.stageCondition) {
                const str = rule.stageCondition.toString();
                if (str.includes('stage')) {
                    const match = str.match(/stage\s*([><=!]+)\s*(\d+)/);
                    if (match) {
                        const opJP = { '>=': '以上', '>': '超', '<=': '以下', '<': '未満', '===': 'のみ', '==': 'のみ' }[match[1]] || match[1];
                        conditionText = `ステージ${match[2]}${opJP}`;
                    } else {
                        conditionText = '特定のステージ';
                    }
                }
            }

            output += `${severityStr} ${ruleText} (${conditionText})\n`;
        }
        return output;
    }

    _getCurrentValue(rule, ctx) {
        const target = rule.target;
        const scope = rule.scope;

        if (scope === 'alive') {
            if (!ctx.aliveCounts) return 0;
            // Specialized checks
            if (target === 'ATTRACTOR_RED') return (ctx.attractorCounts && ctx.attractorCounts.red) || 0;
            if (target === 'ATTRACTOR_BLUE') return (ctx.attractorCounts && ctx.attractorCounts.blue) || 0;
            if (target === 'REFLECTOR') return ctx.reflectorCount || 0;
            // Fallback for types
            return ctx.aliveCounts[target] || 0;
        }

        if (scope === 'perWave') {
            if (!ctx.waveCounts) return 0;
            // Unified ID check (Attractor is 'M')
            if (target === 'M' || target === 'ATTRACTOR') return ctx.attractorWaveCount || 0;
            return ctx.waveCounts[target] || 0;
        }

        if (scope === 'perTick') {
            if (!ctx.tickCounts) return 0;
            // Unified ID check (Elite is 'D')
            if (target === 'D' || target === 'ELITE') return ctx.eliteSpawnedThisTick || 0;
            return ctx.tickCounts[target] || 0;
        }

        return 0;
    }
}
