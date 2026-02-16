/**
 * Formations Module
 * Responsible for calculating dx, dy offsets for various geometric spawn patterns.
 */

export const Formations = {
    /**
     * @param {string} pattern 
     * @param {number} count 
     * @param {number} spacing 
     * @returns {Array<{dx: number, dy: number}>}
     */
    getOffsets(pattern, count, spacing) {
        const offsets = [];
        switch (pattern) {
            case 'LINEAR': // Vertical line 
                for (let i = 0; i < count; i++) {
                    offsets.push({ dx: 0, dy: -i * spacing });
                }
                break;
            case 'HLINE': // Horizontal line
                const startX = -((count - 1) * spacing) / 2;
                for (let i = 0; i < count; i++) {
                    offsets.push({ dx: startX + i * spacing, dy: 0 });
                }
                break;
            case 'V_SHAPE':
                offsets.push({ dx: 0, dy: 0 }); // Lead
                const wings = count - 1;
                const pairs = Math.ceil(wings / 2);
                for (let i = 1; i <= pairs; i++) {
                    if (offsets.length < count) offsets.push({ dx: -i * spacing, dy: -i * spacing * 0.8 });
                    if (offsets.length < count) offsets.push({ dx: i * spacing, dy: -i * spacing * 0.8 });
                }
                break;
            case 'FAN': // Radial spread (Inward focus)
                const angleSpread = Math.PI / 3; // 60 degrees
                const startAngle = -angleSpread / 2;
                for (let i = 0; i < count; i++) {
                    const angle = startAngle + (i / Math.max(1, count - 1)) * angleSpread;
                    offsets.push({
                        dx: Math.sin(angle) * spacing * 2,
                        dy: -Math.cos(angle) * spacing * 2
                    });
                }
                break;
            case 'CIRCLE': {
                const radius = spacing * (count / 6);
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2;
                    offsets.push({
                        dx: Math.cos(angle) * radius,
                        dy: Math.sin(angle) * radius
                    });
                }
                break;
            }
            case 'ARC': {
                const radius = spacing * 2;
                const arcAngle = Math.PI; // 180 degrees
                const startAngle = -Math.PI / 2;
                for (let i = 0; i < count; i++) {
                    const angle = startAngle + (i / Math.max(1, count - 1)) * arcAngle;
                    offsets.push({
                        dx: Math.cos(angle) * radius,
                        dy: Math.sin(angle) * radius
                    });
                }
                break;
            }
            case 'GRID': {
                const cols = Math.ceil(Math.sqrt(count));
                const rows = Math.ceil(count / cols);
                const startX = -((cols - 1) * spacing) / 2;
                const startY = -((rows - 1) * spacing) / 2;
                for (let i = 0; i < count; i++) {
                    const r = Math.floor(i / cols);
                    const c = i % cols;
                    offsets.push({
                        dx: startX + c * spacing,
                        dy: startY + r * spacing
                    });
                }
                break;
            }
            case 'RANDOM_CLUSTER': {
                const radius = spacing * 1.5;
                for (let i = 0; i < count; i++) {
                    const r = Math.sqrt(Math.random()) * radius;
                    const theta = Math.random() * Math.PI * 2;
                    offsets.push({
                        dx: r * Math.cos(theta),
                        dy: r * Math.sin(theta)
                    });
                }
                break;
            }
            case 'CROSS': {
                const half = Math.ceil(count / 2);
                // Vertical part
                for (let i = 0; i < half; i++) {
                    offsets.push({ dx: 0, dy: (i - half / 2) * spacing });
                }
                // Horizontal part
                for (let i = half; i < count; i++) {
                    offsets.push({ dx: (i - half - (count - half) / 2) * spacing, dy: 0 });
                }
                break;
            }
            case 'DOUBLE_RING': {
                const innerCount = Math.floor(count / 3);
                const outerCount = count - innerCount;
                const innerRadius = spacing;
                const outerRadius = spacing * 2;
                for (let i = 0; i < innerCount; i++) {
                    const a = (i / innerCount) * Math.PI * 2;
                    offsets.push({ dx: Math.cos(a) * innerRadius, dy: Math.sin(a) * innerRadius });
                }
                for (let i = 0; i < outerCount; i++) {
                    const a = (i / outerCount) * Math.PI * 2;
                    offsets.push({ dx: Math.cos(a) * outerRadius, dy: Math.sin(a) * outerRadius });
                }
                break;
            }
            case 'WAVE': // Staggered grid
                for (let i = 0; i < count; i++) {
                    const row = Math.floor(i / 3);
                    const col = i % 3;
                    offsets.push({
                        dx: (col - 1) * spacing,
                        dy: -row * spacing * 1.5 - (col % 2 === 0 ? 0 : spacing * 0.5)
                    });
                }
                break;
            case 'DOUBLE': // Two parallel lines
                const half = Math.ceil(count / 2);
                for (let i = 0; i < count; i++) {
                    const isSecondLine = i >= half;
                    const idx = isSecondLine ? i - half : i;
                    offsets.push({
                        dx: (isSecondLine ? 40 : -40),
                        dy: -idx * spacing
                    });
                }
                break;
            default:
                for (let i = 0; i < count; i++) offsets.push({ dx: 0, dy: -i * spacing });
        }
        return offsets;
    }
};
