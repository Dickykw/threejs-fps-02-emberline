// World: the Foundry Yard map — geometry, collision, line of sight and bot routes.
// Colliders are axis-aligned boxes; movement and sight both test against them.
// Everything here is pure math plus three.js meshes, so the sim can run headless.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';

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
  const TEX = makeTextures();
  const texMats = new Map();
  // Textured standard material: tile about once per 3 m so a long wall and a
  // small crate read at the same texel density. Textures are cloned per repeat
  // (the canvas image itself is shared).
  function texMat(name, w, h, d = 0) {
    const rx = Math.max(1, Math.round(Math.max(w, d) / 3));
    const ry = Math.max(1, Math.round(h / 3));
    const key = `${name}|${rx}|${ry}`;
    let m = texMats.get(key);
    if (!m) {
      const t = TEX[name].clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      const metal = name === 'metalPanel';
      m = new THREE.MeshStandardMaterial({
        map: t,
        roughness: metal ? 0.55 : 0.85,
        metalness: metal ? 0.4 : 0.08,
      });
      texMats.set(key, m);
    }
    return m;
  }
  // Painted surfaces get their texture from their colour, so the existing
  // layout calls need no changes: walls/metal -> panels, crates -> wood,
  // containers -> corrugated paint, furnace -> rust.
  const TEX_BY_COLOR = new Map([
    [PALETTE.wall, 'metalPanel'],
    [PALETTE.wallDark, 'metalPanel'],
    [PALETTE.metal, 'metalPanel'],
    [PALETTE.metalDark, 'metalPanel'],
    [PALETTE.crate, 'crateWood'],
    [PALETTE.containerA, 'containerA'],
    [PALETTE.containerB, 'containerB'],
    [PALETTE.containerC, 'containerC'],
    [PALETTE.furnace, 'rust'],
  ]);

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
  // A solid box: mesh + collider. y is the centre height. Textured by colour,
  // and every box both casts and receives shadows so the yard reads in 3D.
  function box(w, h, d, x, y, z, color, solid = true) {
    const texName = TEX_BY_COLOR.get(color);
    const m = new THREE.Mesh(geo(w, h, d), texName ? texMat(texName, w, h, d) : mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (solid) colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y0: y - h / 2, y1: y + h / 2 });
    return m;
  }

  // Floor (visual only, no collider — the ground plane is y = 0). Textured
  // concrete slabs; the texture carries the expansion joints, and the floor
  // receives every shadow in the yard.
  const floorTex = TEX.floorGrid.clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(6, 5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(38.4, 30.4),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

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

  // ---- Dressing: pipes, barrels, vents, trim, lamps, ramp (visual dressing
  // around the layout — floor props block movement, everything overhead or
  // stacked is non-solid, so lanes, routes and sightlines are unchanged). ----
  function cyl(rTop, rBottom, h, x, y, z, material, rotX = 0, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 20), material);
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    m.rotation.z = rotZ;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const pipeMat = texMat('metalPanel', 4, 4);
  const rustMat = texMat('rust', 2, 2);
  // Overhead pipes along both long walls + vertical risers at the corners.
  cyl(0.22, 0.22, 36, 0, 4.5, -14.9, pipeMat, 0, Math.PI / 2);
  cyl(0.16, 0.16, 36, 0, 4.5, 14.9, pipeMat, 0, Math.PI / 2);
  cyl(0.18, 0.18, 5, -18.9, 2.5, -14.9, rustMat);
  cyl(0.18, 0.18, 5, 18.9, 2.5, -14.9, rustMat);
  cyl(0.18, 0.18, 5, -18.9, 2.5, 14.9, rustMat);
  cyl(0.18, 0.18, 5, 18.9, 2.5, 14.9, rustMat);
  // A fat duct across the boiler, above head height.
  cyl(0.4, 0.4, 12, 0, 3.6, -2, pipeMat, 0, Math.PI / 2);
  // Barrels: rusted drums clustered against walls, clear of every lane.
  // Solid, so they block movement like any other floor prop.
  function barrel(x, z, material) {
    const m = cyl(0.42, 0.42, 1.05, x, 0.53, z, material);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 20), mat(PALETTE.metalDark));
    rim.position.set(x, 0.95, z);
    rim.castShadow = true;
    scene.add(rim);
    colliders.push({ x0: x - 0.42, z0: z - 0.42, x1: x + 0.42, z1: z + 0.42, y0: 0, y1: 1.05 });
    return m;
  }
  const barrelMats = [rustMat, texMat('containerB', 1, 1), texMat('containerA', 1, 1)];
  barrel(-18, -14.3, barrelMats[0]);
  barrel(-17, -14.5, barrelMats[1]);
  barrel(18, -14.3, barrelMats[2]);
  barrel(18, -13.3, barrelMats[0]);
  barrel(18, 14, barrelMats[1]);
  barrel(17, 14.5, barrelMats[0]);
  barrel(-18, 5, barrelMats[2]);
  barrel(-18, 6, barrelMats[0]);
  barrel(3.6, -2, barrelMats[1]);
  // Wall vents high on the outer walls.
  function vent(x, y, z, ry) {
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.12), mat(PALETTE.metalDark));
    back.castShadow = true;
    back.receiveShadow = true;
    g.add(back);
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.06), mat(PALETTE.wallDark));
      slat.position.set(0, i * 0.32, 0.09);
      g.add(slat);
    }
    g.position.set(x, y, z);
    g.rotation.y = ry;
    scene.add(g);
  }
  vent(-19, 3.8, 0, Math.PI / 2);
  vent(19, 3.8, 0, -Math.PI / 2);
  vent(0, 3.8, -15, 0);
  // Wall trim: a light band near the top of every outer wall.
  box(0.5, 0.3, 30.4, -19.2, 4.8, 0, PALETTE.accent, false);
  box(0.5, 0.3, 30.4, 19.2, 4.8, 0, PALETTE.accent, false);
  box(38.4, 0.3, 0.5, 0, 4.8, -15.2, PALETTE.accent, false);
  box(38.4, 0.3, 0.5, 0, 4.8, 15.2, PALETTE.accent, false);
  // Extra crates stacked on the solid ones + one in the south-west corner.
  box(1.0, 0.9, 1.0, 0, 1.55, 3.5, PALETTE.crate, false);
  box(0.9, 0.8, 0.9, -4.5, 1.5, 4.5, PALETTE.crate, false);
  box(0.9, 0.8, 0.9, 4.5, 1.5, 4.5, PALETTE.crate, false);
  box(1.1, 1.0, 1.1, 11.5, 1.6, -12.5, PALETTE.crate, false);
  box(1.0, 0.9, 1.0, -18, 0.45, 10, PALETTE.crate, true);
  // Loading ramp against the south wall (visual only).
  const ramp = new THREE.Mesh(geo(4, 0.3, 3), texMat('metalPanel', 4, 3));
  ramp.rotation.x = -0.38;
  ramp.position.set(12, 0.55, 13.6);
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);
  // Hazard plate under the furnace + a glowing furnace mouth toward site A.
  const haz1 = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.8),
    new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.8 })
  );
  haz1.rotation.x = -Math.PI / 2;
  haz1.rotation.z = 0.4;
  haz1.position.set(-16, 0.02, -12.5);
  haz1.receiveShadow = true;
  scene.add(haz1);
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.1),
    new THREE.MeshBasicMaterial({ color: PALETTE.furnaceHot })
  );
  mouth.position.set(-14.38, 1.3, -12.5);
  mouth.rotation.y = Math.PI / 2;
  scene.add(mouth);
  // Hanging lamps: cord + shade + warm bulb, three of them over the lanes.
  function lamp(x, z) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), mat(PALETTE.metalDark));
    cord.position.set(x, 4.55, z);
    scene.add(cord);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.32, 0.28, 16), mat(PALETTE.metalDark));
    shade.position.set(x, 4.05, z);
    shade.castShadow = true;
    scene.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe6b8 })
    );
    bulb.position.set(x, 3.88, z);
    scene.add(bulb);
  }
  lamp(0, 8);
  lamp(-8, 0);
  lamp(8, 0);

  // Lighting: bright afternoon sun with shadows, warm ambient, a sky/ground
  // hemisphere for top-vs-bottom shading contrast, furnace glow over site A,
  // warm light over site B and a hanging-lamp pool mid-map.
  scene.add(new THREE.AmbientLight(0xfff2dd, 0.65));
  scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x8a6f52, 0.4));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.furnaceHot), 45, 18, 1.6);
  furnaceLight.position.set(-14, 2.6, -11);
  scene.add(furnaceLight);
  const siteBLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 24, 15, 1.7);
  siteBLight.position.set(14, 3.4, -10);
  scene.add(siteBLight);
  const midLight = new THREE.PointLight(new THREE.Color('#ffe6b8'), 12, 14, 1.8);
  midLight.position.set(0, 3.8, 8);
  scene.add(midLight);

  // The bomb: a dark case with a blinking red top, hidden until planted.
  const bomb = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.4, metalness: 0.6 })
  );
  caseMesh.position.y = 0.11;
  caseMesh.castShadow = true;
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
