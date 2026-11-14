// Foundry Yard: an open-air foundry yard at dusk, 38 x 30 m. Three lanes run south to
// north — A-long (west), Mid, B-long (east) — into two bomb sites: A, the foundry hall
// with a glowing furnace, and B, a container yard. Every box is a collider for players
// and bots and a surface a bullet stops on. Plain geometry only, no models, no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Bomb sites: name, centre, radius.
export const SITES = [
  { name: 'A', x: -14, z: -10, r: 4 },
  { name: 'B', x: 14, z: -10, r: 4 },
];

// Spawn points: [x, z]. Ember (attackers) south, Slate (defenders) north. Every spawn
// is clear of every box.
export const SPAWNS = {
  ember: [[-4, 12], [0, 13], [4, 12]],
  slate: [[-14, -11], [-6, -12], [6, -12], [14, -10]],
};

// Bot routes: named waypoint chains the bots walk. Every point was checked clear of
// every box (a bot is 0.68 m wide): lanes run beside the crates, never through them,
// and the mid route walks around the boiler block.
export const ROUTES = {
  aLong: [[-15, 12], [-15, 6], [-15, 1.5], [-15, -4], [-14, -8]],
  bLong: [[15, 12], [15, 6], [15, 1.5], [15, -4], [14, -8]],
  mid: [[0, 10], [0, 5.5], [3, 0], [3, -4], [0, -8]],
  toA: [[0, -8], [-5, -7.5], [-13, -11]],
  toB: [[0, -8], [5, -7.5], [13, -11]],
  // Slate patrol loops: defenders start north of the z = -6 wall, so each loop crosses
  // it through a door (A door x -9..-7, connector x -2..2, B door x 7..9) and returns
  // through the same door — a route that starts south of the wall would strand them.
  slateA: [[-8, -8], [-8, -4], [-8, 0], [-8, 4], [-12, 8], [-15, 4], [-15, -4], [-8, -4], [-8, -8]],
  slateB: [[8, -8], [8, -4], [8, 0], [8, 4], [12, 8], [15, 4], [15, -4], [8, -4], [8, -8]],
  slateMid: [[0, -8], [0, -4], [0, 0], [3, 0], [3, -4], [0, -8]],
};

// Defender hold spots: [x, z, yaw] — where Slate bots wait and watch a lane. Every
// spot is clear of every box, with room to stand.
export const HOLD_SPOTS = {
  A: [[-17, -8, 2.4], [-13.5, -7.5, -2.4], [-12, -14, 0]],
  B: [[13, -8, -2.4], [10, -7.5, 2.4], [17.5, -14.5, 0]],
  mid: [[-2, 2, 0], [2, 2, 0], [0, -5.5, 0]],
};

// Axis-separated box mover, shared by the player and the bots so the collision rule is
// written once: try X, then Z, and stop the blocked axis instead of sliding through.
export function createMover(colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, radius, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  function slide(position, velocity, dt, height, radius) {
    const nextX = position.x + velocity.x * dt;
    if (!overlaps(nextX, position.y, position.z, height, radius, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nextZ, height, radius, 0.04)) position.z = nextZ;
    else velocity.z = 0;
  }
  return { overlaps, slide };
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // The furnace glows: the same accent, but emissive.
  materials.furnace = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 1.6,
    roughness: 0.6,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the four perimeter walls (5 m high, open to the dusk sky).
  box(38.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 30.4, -19.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 19.2, 2.5, 0, 'surface');
  box(38.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(38.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Lane dividers (x = -8 and x = 8, z -6..6) with a 4 m door gap at z -2..2.
  box(0.4, 4, 4, -8, 2, 4, 'hairline');
  box(0.4, 4, 4, -8, 2, -4, 'hairline');
  box(0.4, 4, 4, 8, 2, 4, 'hairline');
  box(0.4, 4, 4, 8, 2, -4, 'hairline');

  // North wall (z = -6) between mid and the sites: doors to A, the connector, and B.
  box(10, 4, 0.4, -14, 2, -6, 'hairline');
  box(5, 4, 0.4, -4.5, 2, -6, 'hairline');
  box(5, 4, 0.4, 4.5, 2, -6, 'hairline');
  box(10, 4, 0.4, 14, 2, -6, 'hairline');

  // Site dividers (x = -9 and x = 9, z -15..-6) with a door gap at z -11..-8.
  box(0.4, 4, 4, -9, 2, -13, 'hairline');
  box(0.4, 4, 2, -9, 2, -7, 'hairline');
  box(0.4, 4, 4, 9, 2, -13, 'hairline');
  box(0.4, 4, 2, 9, 2, -7, 'hairline');

  // Site A, the foundry hall: the furnace, its chimney stack and a heat shield wall.
  box(3.2, 3, 2.2, -16, 1.5, -12.5, 'furnace');
  box(1, 5, 1, -16, 2.5, -13.8, 'hairline');
  box(2.4, 1.1, 1.2, -11.5, 0.55, -12.5, 'surface');
  box(1.2, 1.1, 3.4, -11.5, 0.55, -8.5, 'surface');

  // Site B, the container yard: painted containers stacked into lanes.
  box(6, 2.4, 2.4, 14, 1.2, -12.5, 'accent');
  box(6, 2.4, 2.4, 14, 3.6, -12.5, 'ally');
  box(2.4, 2.4, 6, 17.5, 1.2, -9, 'foe');
  box(2.4, 1.1, 2.4, 11.5, 0.55, -12.5, 'surface');

  // Mid: the boiler block and a low wall that split the middle lane.
  box(4, 3, 3, 0, 1.5, -2, 'hairline');
  box(3.6, 1.1, 1.2, 0, 0.55, 3.5, 'surface');
  box(1.2, 1.1, 3.6, -4.5, 0.55, 4.5, 'hairline');
  box(1.2, 1.1, 3.6, 4.5, 0.55, 4.5, 'hairline');

  // Cover along the long lanes: crates to crouch behind, pillars to peek around.
  box(1.6, 1.1, 1.6, -15, 0.55, 7, 'surface');
  box(1.6, 1.1, 1.6, -15, 0.55, -1, 'surface');
  box(1.6, 1.1, 1.6, 15, 0.55, 7, 'surface');
  box(1.6, 1.1, 1.6, 15, 0.55, -1, 'surface');
  box(1, 3.4, 1, -15, 1.7, 3.5, 'hairline');
  box(1, 3.4, 1, 15, 1.7, 3.5, 'hairline');
  box(2.4, 0.9, 1.2, -2.5, 0.45, 9.5, 'surface');
  box(2.4, 0.9, 1.2, 2.5, 0.45, 9.5, 'surface');
  box(1.6, 0.7, 1.6, -5.5, 0.35, -9.5, 'surface');
  box(1.6, 0.7, 1.6, 5.5, 0.35, -9.5, 'surface');

  // The bomb itself: a small dark case with a blinking light, hidden until planted.
  const bomb = new THREE.Group();
  const bombCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.5, metalness: 0.4 }),
  );
  bombCase.castShadow = true;
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  bombLight.position.set(0.12, 0.14, 0);
  bomb.add(bombCase, bombLight);
  bomb.position.y = 0.11;
  bomb.visible = false;
  scene.add(bomb);

  // Light: a low dusk sun from the west, a cool fill from the east, a warm sky gradient,
  // and the furnace's own glow over site A.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a2f26'), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.4);
  key.position.set(-18, 12, 6);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 30, 16, 1.6);
  furnaceLight.position.set(-14.5, 2.2, -11);
  scene.add(furnaceLight);

  const siteBLight = new THREE.PointLight(new THREE.Color('#ffd9a0'), 14, 12, 1.8);
  siteBLight.position.set(14, 3.4, -10);
  scene.add(siteBLight);

  // Line of sight: true when no wall stands between two eye positions. One raycaster,
  // reused, so no allocation per check.
  const losRay = new THREE.Raycaster();
  const losDir = new THREE.Vector3();
  function hasLineOfSight(from, to) {
    losDir.copy(to).sub(from);
    const distance = losDir.length();
    if (distance < 0.001) return true;
    losDir.multiplyScalar(1 / distance);
    losRay.set(from, losDir);
    losRay.far = distance;
    return losRay.intersectObjects(shootables, false).length === 0;
  }

  return { colliders, shootables, group, bomb, bombLight, furnaceLight, hasLineOfSight };
}
