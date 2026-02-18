import { Simulator } from './src/utils/Simulator.js';
import { CONSTANTS } from './src/constants.js';

async function runVerification() {
    console.log("=== Stage 9 Diversity Verification ===");
    const sim = new Simulator();
    const stage = 9;
    const runs = 100;

    try {
        const res = sim.simulateMany(runs, stage, 9999, 12345, true);

        const ratios = res.ratios;
        const total = parseFloat(res.total);

        console.log(`Runs: ${runs}`);
        console.log(`Avg Total: ${total}`);
        console.log(`Avg Duration: ${res.avgDuration.toFixed(1)}s`);
        console.log("");

        console.log("TYPE\tCOUNT\tRATIO%");
        console.log("----\t-----\t------");

        const sorted = Object.entries(ratios)
            .map(([type, data]) => ({ type, count: parseFloat(data.count), pct: parseFloat(data.pct) }))
            .filter(o => o.count > 0)
            .sort((a, b) => b.pct - a.pct);

        let hhi = 0;
        let ab_sum = 0;
        let c_l_j_sum = 0;

        sorted.forEach(o => {
            console.log(`${o.type}\t${o.count.toFixed(1)}\t${o.pct.toFixed(1)}%`);
            const p = o.pct / 100;
            hhi += p * p;

            if (o.type === 'A') ab_sum += o.pct;
            if (o.type === 'B') ab_sum += o.pct;

            // C: EVASIVE, L: OBSERVER, J: SPLITTER
            if (['C', 'L', 'J'].includes(o.type)) c_l_j_sum += o.pct;
        });

        console.log("");
        console.log(`A+B Ratio: ${ab_sum.toFixed(1)}%`);
        console.log(`C/L/J Ratio: ${c_l_j_sum.toFixed(1)}%`);
        console.log(`HHI: ${hhi.toFixed(3)}`);

        // Validation
        const successA = (ratios['A'].pct >= 35 && ratios['A'].pct <= 45); // Tolerance
        const successAB = (ab_sum <= 65);
        const successHHI = (hhi <= 0.28);

        if (successA && successAB && successHHI) {
            console.log("\n[SUCCESS] Diversity targets met!");
        } else {
            console.log("\n[WARNING] Some targets not met.");
        }

    } catch (error) {
        console.error("Verification Failed:", error);
    }
}

runVerification();
