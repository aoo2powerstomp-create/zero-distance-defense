/**
 * Simple Seeded Random Number Generator (LCG)
 * for reproducible simulations.
 */
export class RNG {
    constructor(seed = Date.now()) {
        this.seed = seed;
    }

    // Standard LCG
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    // Range [0, 1)
    random() {
        return this.next();
    }
}
