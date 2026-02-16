
const MAX_LV = 30;
const COST_BASE = 1.25;
const WEAPON_BASE = 40;
const SPEED_BASE = 80;

function calculateTotal(base, maxLv) {
    let total = 0;
    let details = [];
    // Upgrade from Lv 1 to Lv 2, ..., Lv 29 to Lv 30
    // The code uses `getUpgradeCost(base, currentLevel)`
    // So to go from 1->2 we pay cost(1). To go from 29->30 we pay cost(29).
    for (let lv = 1; lv < maxLv; lv++) {
        const cost = Math.round(base * Math.pow(COST_BASE, lv - 1));
        total += cost;
        details.push(`Lv${lv}->${lv + 1}: ${cost}`);
    }
    return total;
}

const weaponTotal = calculateTotal(WEAPON_BASE, MAX_LV);
const speedTotal = calculateTotal(SPEED_BASE, MAX_LV);

console.log(`Weapon Upgrade Total (Lv1->30): ${weaponTotal}`);
console.log(`Speed Upgrade Total (Lv1->30): ${speedTotal}`);
console.log(`Total per Weapon (Power + Speed): ${weaponTotal + speedTotal}`);
