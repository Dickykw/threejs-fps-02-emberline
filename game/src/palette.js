// EMBERLINE palette: Foundry afternoon — sunlit yard, pale sky, warm concrete,
// painted steel and bright containers, teal HUD. One place for every colour and
// material the map and HUD use, so the look stays coherent.
export const PALETTE = {
  sky: 0x9db8cc,
  fog: 0x8fa3b5,
  floor: 0x9a8468,
  floorLine: 0x6b5b4a,
  wall: 0xb09a7a,
  wallDark: 0x8a6f52,
  crate: 0xa8763e,
  crateEdge: 0x7a5230,
  metal: 0x9aa2ac,
  metalDark: 0x6a7078,
  furnace: 0xff7a1a,
  furnaceHot: 0xffc233,
  emberGlow: 0xff9a3c,
  containerA: 0xc46a1e,
  containerB: 0x2e7a9b,
  containerC: 0xa83a3a,
  accent: 0xe8a33d,
  ally: 0x2fae9e,
  allyDark: 0x1e7a6e,
  foe: 0xd94838,
  foeDark: 0x8f2a1e,
  hudText: '#f2e9d6',
  hudDim: '#a89a80',
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
