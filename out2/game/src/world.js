// World: the Foundry Yard map — geometry, collision, line of sight and bot routes.
// Colliders are axis-aligned boxes; movement and sight both test against them.
// Everything here is pure math plus three.js meshes, so the sim can run headless.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -14, z: -10, r: 4.5 },
  B: { x: 14, z: -10, r: 4.5 },
};

export const SPAWN_EMBER = [
  { x: 0, z: 12 },
  { x: -2, z: 13 },
  { x: 2, z: 13 },
];
export const SPAWN_SLATE = [
  { x: -14, z: -13 },
  { x: -4, z: -13 },
  { x: 4, z: -13 },
  { x: 15.5, z: -7 },
];

// Patrol routes: open-floor waypoints, each leg clear of colliders.
export const ROUTES = {
  slateA: [
    { x: -14, z: -12 },
    { x: -13, z: -9 },
    { x: -8, z: -7 },
    { x: -6, z: -3 },
    { x: -4, z: 0 },
    { x: -3, z: 4 },
  ],
  slateB: [
    { x: 15.5, z: -7 },
    { x: 12, z: -8 },
    { x: 8, z: -7 },
    { x: 6, z: -3 },
    { x: 4, z: 0 },
    { x: 3, z: 4 },
  ],
  slateMid: [
    { x: -4, z: -13 },
    { x: -2, z: -8 },
    { x: 0, z: -4 },
    { x: -3, z: -1 },
    { x: -3, z: 2 },
    { x: 0, z: 5 },
  ],
  emberA: [
    { x: 0, z: 12 },
    { x: -4, z: 8 },
    { x: -6, z: 4 },
    { x: -6, z: -3 },
    { x: -10, z: -8 },
    { x: -14, z: -10 },
  ],
  emberB: [
    { x: 0, z: 12 },
    { x: 4, z: 8 },
    { x: 6, z: 4 },
    { x: 6, z: -3 },
    { x: 10, z: -8 },
    { x: 14, z: -10 },
  ],
  emberMid: [
    { x: 0, z: 12 },
    { x: 0, z: 6 },
    { x: -3, z: 2 },
    { x: -3, z: -1 },
    { x: 0, z: -4 },
    { x: 0, z: -8 },
  ],
};

// Hold spots: clear floor where a bot stops and watches a lane.
export const HOLDS = {
  A: [
    { x: -14, z: -8 },
    { x: -16, z: -9 },
    { x: -13, z: -10 },
  ],
  B: [
    { x: 14, z: -8 },
    { x: 12, z: -8 },
    { x: 15, z: -7 },
  ],
  mid: [
    { x: -3, z: 2 },
    { x: 3, z: 2 },
    { x: 0, z: 6 },
  ],
};

export function buildWorld(scene) {
  const colliders = [];
  const mats = new Map();
  const geoCache = new Map();

  function mat(color) {
    let m = mats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.08 });
      mats.set(color, m);
    }
    return m;
  }
  function geo(w, h, d) {
    const key = `${w}|${h}|${d}`;
    let g = geoCache.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d);
      geoCache.set(key, g);
    }
    return g;
  }
  // A solid box: mesh + collider. y is the centre height.
  function box(w, h, d, x, y, z, color, solid = true) {
    const m = new THREE.Mesh(geo(w, h, d), mat(color));
    m.position.set(x, y, z);
    scene.add(m);
    if (solid) colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y0: y - h / 2, y1: y + h / 2 });
    return m;
  }

  // Floor (visual only, no collider — the ground plane is y = 0).
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(38.4, 30.4),
    new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // Floor seams: thin dark strips so the ground reads as poured concrete slabs.
  for (let i = -3; i <= 3; i++) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 30.4), new THREE.MeshBasicMaterial({ color: PALETTE.floorLine }));
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(i * 5.4, 0.01, 0);
    scene.add(seam);
  }

  // Outer walls.
  box(0.4, 5, 30.4, -19.2, 2.5, 0, PALETTE.wallDark);
  box(0.4, 5, 30.4, 19.2, 2.5, 0, PALETTE.wallDark);
  box(38.4, 5, 0.4, 0, 2.5, -15.2, PALETTE.wallDark);
  box(38.4, 5, 0.4, 0, 2.5, 15.2, PALETTE.wallDark);

  // North wall (z = -6) with three doors: A (x -9..-7), connector (x -2..2), B (x 7..9).
  box(10, 4, 0.4, -14, 2, -6, PALETTE.wall);
  box(5, 4, 0.4, -4.5, 2, -6, PALETTE.wall);
  box(5, 4, 0.4, 4.5, 2, -6, PALETTE.wall);
  box(10, 4, 0.4, 14, 2, -6, PALETTE.wall);
  // Door lintels so the gaps read as doorways.
  box(2, 1.2, 0.4, -8, 3.4, -6, PALETTE.wallDark);
  box(4, 1.2, 0.4, 0, 3.4, -6, PALETTE.wallDark);
  box(2, 1.2, 0.4, 8, 3.4, -6, PALETTE.wallDark);

  // Site dividers (x = -9 and x = 9, z -15..-6) with a door gap at z -11..-8.
  box(0.4, 4, 4, -9, 2, -13, PALETTE.wall);
  box(0.4, 4, 2, -9, 2, -7, PALETTE.wall);
  box(0.4, 4, 4, 9, 2, -13, PALETTE.wall);
  box(0.4, 4, 2, 9, 2, -7, PALETTE.wall);

  // Site A, the foundry hall: furnace, chimney stack and a heat-shield wall.
  const furnace = box(3.2, 3, 2.2, -16, 1.5, -12.5, PALETTE.furnace);
  furnace.material = new THREE.MeshStandardMaterial({ color: PALETTE.furnace, emissive: PALETTE.furnaceHot, emissiveIntensity: 0.7, roughness: 0.6 });
  box(1, 5, 1, -16, 2.5, -13.8, PALETTE.wallDark);
  box(2.4, 1.1, 1.2, -11.5, 0.55, -12.5, PALETTE.metal);
  box(1.2, 1.1, 3.4, -11.5, 0.55, -8.5, PALETTE.crate);

  // Site B, the container yard: painted containers stacked into lanes.
  box(6, 2.4, 2.4, 14, 1.2, -12.5, PALETTE.containerA);
  box(6, 2.4, 2.4, 14, 3.6, -12.5, PALETTE.containerB);
  box(2.4, 2.4, 6, 17.5, 1.2, -9, PALETTE.containerC);
  box(2.4, 1.1, 2.4, 11.5, 0.55, -12.5, PALETTE.crate);

  // Mid: a boiler block, low crates and thin cover walls.
  box(4, 3, 3, 0, 1.5, -2, PALETTE.metalDark);
  box(3.6, 1.1, 1.2, 0, 0.55, 3.5, PALETTE.crate);
  box(1.2, 1.1, 3.6, -4.5, 0.55, 4.5, PALETTE.crate);
  box(1.2, 1.1, 3.6, 4.5, 0.55, 4.5, PALETTE.crate);
  box(0.4, 4, 4, -8, 2, 4, PALETTE.wall);
  box(0.4, 4, 4, 8, 2, 4, PALETTE.wall);
  box(0.4, 4, 4, -8, 2, -4, PALETTE.wall);
  box(0.4, 4, 4, 8, 2, -4, PALETTE.wall);

  // Lighting: dim ambient, a low sun, furnace glow over site A, warm light over site B.
  scene.add(new THREE.AmbientLight(0x8a6a4a, 0.55));
  const sun = new THREE.DirectionalLight(0xffe0b0, 0.7);
  sun.position.set(10, 18, 8);
  scene.add(sun);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.furnaceHot), 26, 16, 1.7);
  furnaceLight.position.set(-14, 2.6, -11);
  scene.add(furnaceLight);
  const siteBLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 14, 12, 1.8);
  siteBLight.position.set(14, 3.4, -10);
  scene.add(siteBLight);

  // The bomb: a dark case with a blinking red top, hidden until planted.
  const bomb = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.4, metalness: 0.6 })
  );
  caseMesh.position.y = 0.11;
  bomb.add(caseMesh);
  const blinkMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), blinkMat);
  blink.position.set(0, 0.26, 0);
  bomb.add(blink);
  bomb.visible = false;
  scene.add(bomb);

  return {
    colliders,
    sites: SITES,
    bombMesh: bomb,
    bombBlink: blinkMat,
    furnaceLight,
    // True when the point (x, z) has no collider within `margin` metres.
    pointFree(x, z, margin = 0.4) {
      for (const c of colliders) {
        if (c.y0 >= 1.8) continue; // overhead: lintel / stacked top, walkable under
        if (c.y1 < 0.3) continue;
        if (x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin) return false;
      }
      return true;
    },
    // Push a circle (pos {x, z}, radius r, feet y, height h) out of every collider it overlaps.
    collideCircle(pos, r, y = 0, h = 1.7) {
      for (let pass = 0; pass < 2; pass++) {
        for (const c of colliders) {
          if (c.y0 >= 1.8) continue; // overhead: lintel / stacked top, walkable under
          if (y + h <= c.y0 + 0.01 || y >= c.y1 - 0.01) continue;
          const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
          const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the smallest penetration axis.
            const pl = pos.x - (c.x0 - r);
            const pr = c.x1 + r - pos.x;
            const pt = pos.z - (c.z0 - r);
            const pb = c.z1 + r - pos.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) pos.x = c.x0 - r;
            else if (m === pr) pos.x = c.x1 + r;
            else if (m === pt) pos.z = c.z0 - r;
            else pos.z = c.z1 + r;
          }
        }
      }
      // Clamp inside the outer walls.
      pos.x = Math.max(-18.6, Math.min(18.6, pos.x));
      pos.z = Math.max(-14.6, Math.min(14.6, pos.z));
    },
    // True when the segment a→b is not blocked by any collider.
    losClear(ax, ay, az, bx, by, bz) {
      for (const c of colliders) {
        if (c.y1 < 0.3) continue;
        if (segmentHitsBox(ax, ay, az, bx, by, bz, c)) return false;
      }
      return true;
    },
    // Nearest distance a ray hits a wall, or Infinity. dir must be normalized.
    rayWalls(ox, oy, oz, dx, dy, dz, maxDist) {
      let best = Infinity;
      for (const c of colliders) {
        const t = rayHitsBox(ox, oy, oz, dx, dy, dz, c, maxDist);
        if (t >= 0 && t < best) best = t;
      }
      return best;
    },
  };
}

// Slab test: does the segment a→b intersect the box (with a small shrink so
// grazing a corner does not block sight)?
function segmentHitsBox(ax, ay, az, bx, by, bz, c) {
  const e = 0.06;
  const x0 = c.x0 + e;
  const x1 = c.x1 - e;
  const z0 = c.z0 + e;
  const z1 = c.z1 - e;
  const y0 = c.y0;
  const y1 = c.y1;
  if (x1 <= x0 || z1 <= z0) return false;
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const axes = [
    [ax, dx, x0, x1],
    [ay, dy, y0, y1],
    [az, dz, z0, z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Slab test for a ray: nearest t in [0, maxDist], or -1.
function rayHitsBox(ox, oy, oz, dx, dy, dz, c, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const axes = [
    [ox, dx, c.x0, c.x1],
    [oy, dy, c.y0, c.y1],
    [oz, dz, c.z0, c.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
