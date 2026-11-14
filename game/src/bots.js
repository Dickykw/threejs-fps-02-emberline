// Bots: the other six soldiers. Each bot is a state machine — PATROL along a route,
// HOLD a lane, ENGAGE a visible enemy in bursts, INVESTIGATE a gunshot it heard, and,
// for defenders, DEFUSE a planted bomb. They move with the shared mover, see with the
// world's line-of-sight test, and shoot with an analytic ray-vs-capsule hit test, so no
// extra meshes are needed to wound the player.
import * as THREE from 'three';
import { PALETTE, shade } from './palette.js';
import { ROUTES, HOLD_SPOTS, SPAWNS, createMover } from './world.js';

const BOT_HEIGHT = 1.72;
const BOT_RADIUS = 0.34;
const BOT_EYE = 1.5;
const DECIDE_EVERY = 0.1;
const SEE_RANGE = 42;
const HEAR_RANGE = 26;
const DEFUSE_SECONDS = 5;

const NAMES = {
  slate: ['Rook', 'Vex', 'Hale', 'Moss'],
  ember: ['Juno', 'Pike'],
};

// Closest distance between a ray (origin, dir) and a segment (a, b). Squared, so no sqrt.
function raySegmentDistanceSq(origin, dir, a, b) {
  const d1x = dir.x, d1y = dir.y, d1z = dir.z;
  const d2x = b.x - a.x, d2y = b.y - a.y, d2z = b.z - a.z;
  const rx = a.x - origin.x, ry = a.y - origin.y, rz = a.z - origin.z;
  const a1 = d1x * d1x + d1y * d1y + d1z * d1z;
  const b1 = d1x * d2x + d1y * d2y + d1z * d2z;
  const c1 = d2x * d2x + d2y * d2y + d2z * d2z;
  const d = d1x * rx + d1y * ry + d1z * rz;
  const e = d2x * rx + d2y * ry + d2z * rz;
  const denom = a1 * c1 - b1 * b1;
  let s = denom > 0.000001 ? Math.max(0, (b1 * e - c1 * d) / denom) : 0;
  let t = (b1 * s + e) / c1;
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, (b1 * t - d) / a1);
  const px = origin.x + d1x * s - (a.x + d2x * t);
  const py = origin.y + d1y * s - (a.y + d2y * t);
  const pz = origin.z + d1z * s - (a.z + d2z * t);
  return px * px + py * py + pz * pz;
}

function buildModel(team) {
  const group = new THREE.Group();
  const teamColor = team === 'slate' ? PALETTE.foe : PALETTE.ally;
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.65 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), darkMat);
  legL.position.set(-0.11, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), torsoMat);
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
  head.position.y = 1.45;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), darkMat);
  visor.position.set(0, 1.47, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.2, 1.05, -0.3);
  group.add(legL, legR, torso, head, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head };
}

export function createBots(scene, world) {
  const mover = createMover(world.colliders);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const segA = new THREE.Vector3();
  const segB = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const moveTarget = new THREE.Vector3();
  const losPoint = new THREE.Vector3();
  const forwardVec = new THREE.Vector3();
  const headCenter = new THREE.Vector3();
  const toHead = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const shotDir = new THREE.Vector3();
  const shotFrom = new THREE.Vector3();

  const bots = [];
  const hitMeshes = [];
  let noise = null;

  function makeBot(team, index, spawn) {
    const { group, torso, head } = buildModel(team);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);
    const bot = {
      team,
      name: NAMES[team][index],
      group,
      torso,
      head,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: team === 'slate' ? Math.PI : 0,
      health: 100,
      alive: true,
      state: 'patrol',
      route: null,
      routeIndex: 0,
      holdSpot: null,
      holdUntil: 0,
      target: null,
      targetIsPlayer: false,
      lastSeen: new THREE.Vector3(),
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      pauseUntil: 0,
      decideAt: 0,
      stuckAt: 0,
      lastProgress: new THREE.Vector3(spawn[0], 0, spawn[1]),
      defuseProgress: 0,
      speed: 3.2 + Math.random() * 0.7,
      damage: 11 + Math.random() * 5,
      fall: 0,
      walkPhase: Math.random() * 6,
    };
    torso.userData = { bot, part: 'torso' };
    head.userData = { bot, part: 'head' };
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnRound() {
    let slateIndex = 0;
    let emberIndex = 0;
    for (const bot of bots) {
      const spawns = bot.team === 'slate' ? SPAWNS.slate : SPAWNS.ember;
      const spawn = spawns[bot.team === 'slate' ? slateIndex++ : emberIndex++];
      bot.position.set(spawn[0], 0, spawn[1]);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'slate' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.state = bot.team === 'slate' ? 'hold' : 'patrol';
      bot.target = null;
      bot.defuseProgress = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.y = 0;
      bot.group.visible = true;
      if (bot.team === 'slate') {
        const spots = HOLD_SPOTS.A.concat(HOLD_SPOTS.B, HOLD_SPOTS.mid);
        bot.holdSpot = spots[Math.floor(Math.random() * spots.length)];
        bot.holdUntil = 0;
        bot.route = null;
      } else {
        // Ally bots shadow the player instead of walking a route.
        bot.route = null;
        bot.holdSpot = null;
      }
    }
  }

  function init() {
    for (let i = 0; i < 4; i += 1) makeBot('slate', i, SPAWNS.slate[i]);
    for (let i = 0; i < 2; i += 1) makeBot('ember', i, SPAWNS.ember[i]);
    spawnRound();
  }

  function eyePos(bot, out) {
    out.set(bot.position.x, bot.position.y + BOT_EYE, bot.position.z);
    return out;
  }

  function visibleEnemy(bot, player, allBots) {
    let best = null;
    let bestDist = SEE_RANGE;
    const candidates = [];
    if (bot.team === 'slate' && player.state.alive) candidates.push({ ref: player, isPlayer: true });
    for (const other of allBots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      candidates.push({ ref: other, isPlayer: false });
    }
    for (const candidate of candidates) {
      const ref = candidate.ref;
      const pos = candidate.isPlayer ? ref.state.position : ref.position;
      const height = candidate.isPlayer ? ref.state.height : BOT_HEIGHT;
      eyePos(bot, eye);
      toTarget.set(pos.x, pos.y + height * 0.7, pos.z).sub(eye);
      const dist = toTarget.length();
      if (dist > bestDist) continue;
      forwardVec.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      const facing = toTarget.dot(forwardVec) / dist;
      if (facing < 0.15 && dist > 7) continue;
      losPoint.set(pos.x, pos.y + height * 0.7, pos.z);
      if (!world.hasLineOfSight(eye, losPoint)) continue;
      best = candidate;
      bestDist = dist;
    }
    return best ? { candidate: best, dist: bestDist } : null;
  }

  function decide(bot, time, player, allBots, bomb) {
    if (!bot.alive) return;
    const seen = visibleEnemy(bot, player, allBots);
    if (seen) {
      const firstSight = bot.state !== 'engage';
      bot.state = 'engage';
      bot.target = seen.candidate.ref;
      bot.targetIsPlayer = seen.candidate.isPlayer;
      const pos = bot.targetIsPlayer ? bot.target.state.position : bot.target.position;
      const height = bot.targetIsPlayer ? bot.target.state.height : BOT_HEIGHT;
      bot.lastSeen.set(pos.x, pos.y + height * 0.7, pos.z);
      if (firstSight) bot.reactionAt = time + 0.35 + Math.random() * 0.4;
      return;
    }
    bot.target = null;
    if (bomb.planted && bot.team === 'slate') {
      bot.state = 'defuse';
      return;
    }
    if (noise && time - noise.time < 4 && noise.team !== bot.team) {
      const dx = noise.x - bot.position.x;
      const dz = noise.z - bot.position.z;
      if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE) {
        bot.state = 'investigate';
        return;
      }
    }
    if (bot.team === 'slate') {
      // Hold first (holdUntil 0 means "not started yet"), then patrol a loop that
      // crosses the north wall through a door. The southern routes would strand a
      // defender north of the wall.
      bot.state = bot.holdUntil === 0 || time < bot.holdUntil ? 'hold' : 'patrol';
      if (bot.state === 'patrol' && !bot.route) {
        const routes = [ROUTES.slateA, ROUTES.slateB, ROUTES.slateMid];
        bot.route = routes[Math.floor(Math.random() * routes.length)];
        bot.routeIndex = 0;
      }
    } else {
      bot.state = 'patrol';
    }
  }

  function moveToward(bot, dt, x, z, speed) {
    moveTarget.set(x - bot.position.x, 0, z - bot.position.z);
    const dist = moveTarget.length();
    if (dist < 0.4) return true;
    moveTarget.multiplyScalar(1 / dist);
    wish.copy(moveTarget).multiplyScalar(speed);
    bot.velocity.x += (wish.x - bot.velocity.x) * Math.min(1, dt * 8);
    bot.velocity.z += (wish.z - bot.velocity.z) * Math.min(1, dt * 8);
    mover.slide(bot.position, bot.velocity, dt, BOT_HEIGHT, BOT_RADIUS);
    bot.yaw = Math.atan2(-moveTarget.x, -moveTarget.z);
    return false;
  }

  function fireAt(bot, time, player, hooks) {
    if (time < bot.reactionAt || time < bot.pauseUntil) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.nextShotAt = time;
    }
    if (time < bot.nextShotAt) return;
    bot.nextShotAt = time + 0.11;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.pauseUntil = time + 0.8 + Math.random() * 0.6;

    const target = bot.target;
    if (!target || (bot.targetIsPlayer ? !target.state.alive : !target.alive)) return;
    const pos = bot.targetIsPlayer ? target.state.position : target.position;
    const height = bot.targetIsPlayer ? target.state.height : BOT_HEIGHT;
    const speed = bot.targetIsPlayer
      ? Math.hypot(target.state.velocity.x, target.state.velocity.z)
      : Math.hypot(target.velocity.x, target.velocity.z);
    const dist = eyePos(bot, eye).distanceTo(losPoint.set(pos.x, pos.y + height * 0.7, pos.z));
    const err = 0.22 + dist * 0.022 + (speed > 1 ? 0.3 : 0) - (bot.targetIsPlayer && target.state.crouching ? 0.1 : 0);
    aimPoint.set(
      pos.x + (Math.random() * 2 - 1) * err,
      pos.y + height * 0.7 + (Math.random() * 2 - 1) * err,
      pos.z + (Math.random() * 2 - 1) * err,
    );
    const from = eyePos(bot, shotFrom);
    shotDir.copy(aimPoint).sub(from).normalize();
    hooks.onTracer(from, aimPoint, bot.team);
    hooks.onShotSound(bot, dist);

    // A wall between muzzle and aim point swallows the shot.
    raycaster.set(from, shotDir);
    raycaster.far = dist + 2;
    const wall = raycaster.intersectObjects(world.shootables, false)[0];
    if (wall && wall.distance < dist - 0.3) return;

    // Analytic hit: ray against the target's capsule, head sphere first.
    segA.set(pos.x, pos.y, pos.z);
    segB.set(pos.x, pos.y + height, pos.z);
    headCenter.set(pos.x, pos.y + height - 0.18, pos.z);
    toHead.copy(headCenter).sub(from);
    const along = toHead.dot(shotDir);
    if (along > 0) {
      closest.copy(from).addScaledVector(shotDir, along);
      if (closest.distanceTo(headCenter) < 0.22) {
        hooks.onHit(bot, bot.damage * 2, true);
        return;
      }
    }
    if (raySegmentDistanceSq(from, shotDir, segA, segB) < 0.35 * 0.35) {
      hooks.onHit(bot, bot.damage, false);
    }
  }

  function stepBot(bot, dt, time, player, allBots, bomb, hooks) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
      }
      return;
    }
    bot.walkPhase += dt * 8;
    if (time >= bot.decideAt) {
      bot.decideAt = time + DECIDE_EVERY;
      decide(bot, time, player, allBots, bomb);
    }

    if (bot.state === 'engage' && bot.target) {
      const pos = bot.targetIsPlayer ? bot.target.state.position : bot.target.position;
      const height = bot.targetIsPlayer ? bot.target.state.height : BOT_HEIGHT;
      bot.yaw = Math.atan2(-(pos.x - bot.position.x), -(pos.z - bot.position.z));
      bot.velocity.x *= Math.max(0, 1 - dt * 8);
      bot.velocity.z *= Math.max(0, 1 - dt * 8);
      fireAt(bot, time, player, hooks);
    } else if (bot.state === 'defuse' && bomb.planted) {
      const arrived = moveToward(bot, dt, bomb.x, bomb.z, bot.speed);
      if (arrived) {
        bot.defuseProgress += dt;
        bot.velocity.x = 0;
        bot.velocity.z = 0;
        if (bot.defuseProgress >= DEFUSE_SECONDS) {
          bot.defuseProgress = 0;
          hooks.onDefuseDone();
        }
      }
    } else if (bot.state === 'investigate' && noise) {
      const arrived = moveToward(bot, dt, noise.x, noise.z, bot.speed);
      if (arrived) {
        bot.yaw += dt * 1.5;
        if (time - noise.time > 4) bot.state = 'patrol';
      }
    } else if (bot.state === 'hold' && bot.holdSpot) {
      const [hx, hz, hyaw] = bot.holdSpot;
      const dx = hx - bot.position.x;
      const dz = hz - bot.position.z;
      if (dx * dx + dz * dz > 0.25) moveToward(bot, dt, hx, hz, bot.speed);
      else {
        bot.yaw = hyaw;
        bot.velocity.x = 0;
        bot.velocity.z = 0;
      }
      if (bot.holdUntil === 0) bot.holdUntil = time + 6 + Math.random() * 6;
    } else if (bot.state === 'patrol' && bot.route) {
      const point = bot.route[bot.routeIndex % bot.route.length];
      const arrived = moveToward(bot, dt, point[0], point[1], bot.speed);
      if (arrived) bot.routeIndex += 1;
    } else if (bot.team === 'ember') {
      // Ally bots shadow the player a few metres behind.
      const px = player.state.position.x;
      const pz = player.state.position.z;
      const dx = px - bot.position.x;
      const dz = pz - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) moveToward(bot, dt, px + Math.sin(player.state.yaw) * 3, pz + Math.cos(player.state.yaw) * 3, bot.speed + 0.5);
      else {
        bot.yaw = player.state.yaw;
        bot.velocity.x = 0;
        bot.velocity.z = 0;
      }
    }

    // Stuck: no progress for 1.5 s while trying to move — skip to the next waypoint.
    // A holding bot that cannot reach its spot gives up the hold and patrols instead.
    const moved = Math.hypot(bot.position.x - bot.lastProgress.x, bot.position.z - bot.lastProgress.z);
    if (moved > 0.5) {
      bot.lastProgress.copy(bot.position);
      bot.stuckAt = time;
    } else if (time - bot.stuckAt > 1.5 && (bot.state === 'patrol' || bot.state === 'investigate' || bot.state === 'defuse' || bot.state === 'hold')) {
      if (bot.state === 'hold') bot.holdUntil = time;
      else bot.routeIndex += 1;
      bot.stuckAt = time;
      bot.lastProgress.copy(bot.position);
    }

    bot.group.rotation.y = bot.yaw;
    const bob = Math.hypot(bot.velocity.x, bot.velocity.z) > 0.5 ? Math.sin(bot.walkPhase) * 0.03 : 0;
    bot.group.position.y = bob;
  }

  init();

  return {
    bots,
    hitMeshes,
    spawnRound,
    hearShot(x, z, team, time) {
      noise = { x, z, team, time };
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    damage(bot, amount, part) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      return true;
    },
    step(dt, time, player, bomb, hooks) {
      for (const bot of bots) stepBot(bot, dt, time, player, bots, bomb, hooks);
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.position.x, bot.position.y + 1.2, bot.position.z);
    },
    reset() {
      spawnRound();
    },
  };
}
