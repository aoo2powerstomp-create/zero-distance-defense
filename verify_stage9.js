import { Simulator } from './src/utils/Simulator.js';
import { CONSTANTS } from './src/constants.js';

async function runVerification() {
    console.log("Starting Stage 9 Verification Simulation...");
    const sim = new Simulator();
    try {
        // Run 10 trials of Stage 9
        const results = sim.simulateMany(10, 9, 300, 12345);
        console.log("Verification Successful!");
        console.log(`Avg Total Spawns: ${results.total}`);
        console.log(`Avg Duration: ${results.avgDuration.toFixed(1)}s`);
    } catch (error) {
        console.error("Verification Failed with Error:");
        console.error(error);
        process.exit(1);
    }
}

runVerification();
