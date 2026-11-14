// EMBERLINE palette: Foundry dusk — dark iron browns, amber furnace glow, teal HUD.
// One place for every colour and material the map and HUD use, so the look stays coherent.
export const PALETTE = {
  sky: 0x1a1210,
  fog: 0x241a14,
  floor: 0x3a2f26,
  floorLine: 0x2c231c,
  wall: 0x4a382a,
  wallDark: 0x33261c,
  crate: 0x6b4a2c,
  crateEdge: 0x54371f,
  metal: 0x5a5a60,
  metalDark: 0x3c3c42,
  furnace: 0xff7a1a,
  furnaceHot: 0xffc233,
  emberGlow: 0xff9a3c,
  containerA: 0x7a4a22,
  containerB: 0x2e5a6b,
  containerC: 0x6b2e2e,
  accent: 0xe8a33d,
  ally: 0x2fae9e,
  allyDark: 0x1e7a6e,
  foe: 0xd94838,
  foeDark: 0x8f2a1e,
  hudText: '#e8ddc9',
  hudDim: '#9a8a72',
  hudTeal: '#35c4b5',
  hudAmber: '#ffb347',
  hudRed: '#ff5a4a',
  tracer: 0xffe08a,
  spark: 0xffc233,
};

// A tiny seeded RNG (mulberry32) so screenshot modes are deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
