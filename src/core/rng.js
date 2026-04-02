/**
 * Seeded pseudo-random (mulberry32). Returns a function `random()` in [0, 1).
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    function random() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** Snapshot the internal state so it can be serialized and restored. */
    random.getState = () => a;
    random.setState = (s) => { a = s >>> 0; };
    return random;
}

/** Generate a random 32-bit unsigned integer suitable as a game seed. */
export function randomSeed() {
    return (Math.imul(Date.now(), 0x9e3779b1) ^ (Math.random() * 0x7fffffff | 0)) >>> 0;
}
