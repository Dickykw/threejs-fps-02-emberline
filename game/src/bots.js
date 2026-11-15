// Bots: six AI teammates and opponents with a small state machine — patrol, hold,
// engage, investigate, defuse — plus vision (LOS + field of view), burst fire with
// reaction time, hearing, and stuck recovery. Meshes are simple styled boxes.
import * as THREE from 'three';
import { PALETTE, clamp } from './palette.js';
import { ROUTES, HOLDS, SPAWN_EMBER, SPAWN_SLATE } from './world.js';

const BOT_SPEED = { patrol: 3.4, hold: 0, engage: 4.3, investigate: 3.8, defuse: 3.8 };
const VISION_RANGE = 26;
const VISION_FOV = Math.cos((100 * Math.PI) / 360); // cos(half-angle)
const BOT_DAMAGE = 13;
const BOT_HEAD_MULT = 2;

function makeMesh(team) {
  const g = new THREE.Group();
  const bodyColor = team === 'ember' ? PALETTE.ally : PALETTE.foe;
  const dark = team === 'ember' ? PALETTE.allyDark : PALETTE.foeDark;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.62, 0.3),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 })
  );
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.8 })
  );
  head.position.y = 1.55;
  g.add(head);
  const helm = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.34),
    new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7 })
  );
  helm.position.y = 1.68;
  g.add(helm);
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.6, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 })
    );
    leg.position.set(sx, 0.3, 0);
    g.add(leg);
  }
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.13, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5, metalness: 0.5 })
  );
  gun.position.set(0.2, 1.15, 0.3);
  g.add(gun);
  // Bots cast shadows: body, head, helm, legs and gun all land on the floor.
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export function createBots(world, scene, rng) {
  const bots = [];
  const tmp = new THREE.Vector3();

  function addBot(team, name) {
    const mesh = makeMesh(team);
    scene.add(mesh);
    const bot = {
      team,
      name,
      mesh,
      pos: new THREE.Vector3(),
      yaw: 0,
      hp: 100,
      alive: true,
      state: 'patrol',
      stateT: 0,
      route: [],
      routeIdx: 0,
      holdPos: null,
      holdT: 0,
      target: null,
      reaction: 0,
      burstLeft: 0,
      burstT: 0,
      shootT: 0,
      scanT: 0,
      defuseT: 0,
      stuckT: 0,
      lastX: 0,
      lastZ: 0,
      strafeDir: 1,
      strafeT: 0,
      heard: null,
      lastSeen: null,
    };
    bots.push(bot);
    return bot;
  }

  // Two Ember allies and four Slate opponents.
  addBot('ember', 'Ember-2');
  addBot('ember', 'Ember-3');
  addBot('slate', 'Slate-1');
  addBot('slate', 'Slate-2');
  addBot('slate', 'Slate-3');
  addBot('slate', 'Slate-4');

  function pickRoute(bot, routes) {
    bot.route = routes[Math.floor(rng() * routes.length)];
    bot.routeIdx = 0;
  }

  function setHold(bot) {
    const spots = bot.team === 'slate' ? [...HOLDS.A, ...HOLDS.B, ...HOLDS.mid] : HOLDS.mid;
    bot.holdPos = spots[Math.floor(rng() * spots.length)];
    bot.state = 'hold';
    bot.holdT = 6 + rng() * 6;
    bot.stateT = 0;
  }

  function eyeOf(bot) {
    return { x: bot.pos.x, y: bot.pos.y + 1.5, z: bot.pos.z };
  }

  // The nearest visible enemy of `bot`, or null. Vision is range + FOV + LOS.
  function seeEnemy(bot, ctx) {
    const eye = eyeOf(bot);
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    let best = null;
    let bestD = Infinity;
    const consider = (px, py, pz, ref) => {
      const dx = px - eye.x;
      const dy = py - eye.y;
      const dz = pz - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > VISION_RANGE || d < 0.3) return;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < VISION_FOV) return;
      if (!world.losClear(eye.x, eye.y, eye.z, px, py, pz)) return;
      if (d < bestD) {
        bestD = d;
        best = { ref, dist: d, x: px, y: py, z: pz };
      }
    };
    if (bot.team === 'slate' && ctx.playerAlive && ctx.playerEye) {
      consider(ctx.playerEye.x, ctx.playerEye.y - 0.4, ctx.playerEye.z, 'player');
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider(other.pos.x, other.pos.y + 1.1, other.pos.z, other);
    }
    return best;
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const step = Math.min(d, speed * dt);
    bot.pos.x += (dx / d) * step;
    bot.pos.z += (dz / d) * step;
    bot.yaw = Math.atan2(-dx, -dz);
    world.collideCircle(bot.pos, 0.35, bot.pos.y, 1.7);
    return d - step < 0.15;
  }

  function fireAt(bot, seen, ctx) {
    // Burst of 3-5 shots; later shots in a burst are less accurate.
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(rng() * 3);
      bot.burstT = 0;
    }
    bot.burstT -= 1 / 60;
    if (bot.burstT > 0) return;
    bot.burstT = 0.12 + rng() * 0.06;
    bot.burstLeft -= 1;
    const moving = seen.ref === 'player' && ctx.playerMoving ? 1 : 0;
    let chance = 0.55 - seen.dist * 0.012 - moving * 0.15 - (4 - bot.burstLeft) * 0.03;
    chance = clamp(chance, 0.12, 0.7);
    if (rng() > chance) return; // miss: tracer only, no damage
    const head = rng() < 0.1;
    const dmg = Math.round(BOT_DAMAGE * (head ? BOT_HEAD_MULT : 1) * (0.85 + rng() * 0.3));
    if (seen.ref === 'player') {
      ctx.damagePlayer(dmg, bot);
    } else {
      damageBot(seen.ref, dmg, head, bot, ctx);
    }
    ctx.onBotShot?.(bot, seen);
  }

  function damageBot(bot, amount, isHead, srcBot, ctx) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.state === 'defuse') bot.defuseT = 0;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.mesh.rotation.x = -Math.PI / 2 + 0.12;
      bot.mesh.position.y = 0.15;
      ctx?.onKill?.(srcBot ?? null, bot);
      return true;
    }
    // Being shot at makes a bot turn toward the shooter.
    if (srcBot && srcBot !== bot) {
      bot.heard = { x: srcBot.pos.x, z: srcBot.pos.z };
      if (bot.state === 'patrol' || bot.state === 'hold') {
        bot.state = 'investigate';
        bot.stateT = 0;
      }
    }
    void isHead;
    return false;
  }

  return {
    bots,
    aimPoint(i) {
      const b = bots[i];
      if (!b) return new THREE.Vector3();
      return new THREE.Vector3(b.pos.x, b.pos.y + 1.1, b.pos.z);
    },
    aliveCount(team) {
      let n = 0;
      for (const b of bots) if (b.alive && b.team === team) n++;
      return n;
    },
    damageBot(bot, amount, isHead, srcBot, ctx) {
      return damageBot(bot, amount, isHead, srcBot, ctx);
    },
    // A loud event somewhere: nearby bots go look.
    hear(x, z) {
      for (const b of bots) {
        if (!b.alive) continue;
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d < 20 && (b.state === 'patrol' || b.state === 'hold')) {
          b.heard = { x, z };
          b.state = 'investigate';
          b.stateT = 0;
        }
      }
    },
    spawnRound() {
      const emberRoutes = [ROUTES.emberA, ROUTES.emberB, ROUTES.emberMid];
      const slateRoutes = [ROUTES.slateA, ROUTES.slateB, ROUTES.slateMid];
      let ei = 0;
      let si = 0;
      for (const bot of bots) {
        bot.hp = 100;
        bot.alive = true;
        bot.state = 'patrol';
        bot.stateT = 0;
        bot.target = null;
        bot.defuseT = 0;
        bot.heard = null;
        bot.lastSeen = null;
        bot.mesh.rotation.x = 0;
        bot.mesh.position.y = 0;
        if (bot.team === 'ember') {
          const s = SPAWN_EMBER[ei % SPAWN_EMBER.length];
          bot.pos.set(s.x, 0, s.z);
          bot.yaw = Math.PI;
          pickRoute(bot, emberRoutes);
          ei++;
        } else {
          const s = SPAWN_SLATE[si % SPAWN_SLATE.length];
          bot.pos.set(s.x, 0, s.z);
          bot.yaw = 0;
          pickRoute(bot, slateRoutes);
          si++;
        }
        bot.lastX = bot.pos.x;
        bot.lastZ = bot.pos.z;
        bot.mesh.position.copy(bot.pos);
      }
    },
    update(dt, ctx) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.stateT += dt;
        bot.scanT -= dt;

        // Periodic vision scan.
        if (bot.scanT <= 0) {
          bot.scanT = 0.15;
          const seen = seeEnemy(bot, ctx);
          if (seen) {
            if (bot.state !== 'engage') {
              bot.state = 'engage';
              bot.reaction = 0.35 + rng() * 0.4;
              bot.burstLeft = 0;
            }
            bot.target = seen;
            bot.lastSeen = { x: seen.x, z: seen.z };
          } else if (bot.state === 'engage') {
            // Lost sight: go check the last known position.
            bot.state = 'investigate';
            bot.heard = bot.lastSeen ? { x: bot.lastSeen.x, z: bot.lastSeen.z } : null;
            bot.stateT = 0;
            bot.target = null;
          }
        }

        if (bot.state === 'engage' && bot.target) {
          const t = bot.target;
          const dx = t.x - bot.pos.x;
          const dz = t.z - bot.pos.z;
          bot.yaw = Math.atan2(-dx, -dz);
          // Strafe sideways so the bot is not a static target.
          bot.strafeT -= dt;
          if (bot.strafeT <= 0) {
            bot.strafeT = 0.7 + rng() * 0.8;
            bot.strafeDir = rng() < 0.5 ? -1 : 1;
          }
          const sd = bot.strafeDir * 1.6 * dt;
          const px = bot.pos.x + Math.cos(bot.yaw) * sd;
          const pz = bot.pos.z - Math.sin(bot.yaw) * sd;
          bot.pos.x = px;
          bot.pos.z = pz;
          world.collideCircle(bot.pos, 0.35, bot.pos.y, 1.7);
          bot.reaction -= dt;
          if (bot.reaction <= 0) {
            const seen = seeEnemy(bot, ctx);
            if (seen) {
              bot.target = seen;
              fireAt(bot, seen, ctx);
            } else {
              bot.state = 'investigate';
              bot.heard = bot.lastSeen ? { x: bot.lastSeen.x, z: bot.lastSeen.z } : null;
              bot.stateT = 0;
              bot.target = null;
            }
          }
        } else if (bot.state === 'defuse') {
          bot.defuseT += dt;
          if (bot.defuseT >= 5) {
            ctx.onDefused?.(bot);
            bot.state = 'hold';
            bot.stateT = 0;
          }
        } else if (bot.state === 'hold' && bot.holdPos) {
          // Slow sweep while holding a position.
          bot.yaw += Math.sin(ctx.time * 0.5 + bot.pos.x) * 0.002;
          if (bot.stateT > bot.holdT) {
            pickRoute(bot, bot.team === 'slate' ? [ROUTES.slateA, ROUTES.slateB, ROUTES.slateMid] : [ROUTES.emberA, ROUTES.emberB, ROUTES.emberMid]);
            bot.state = 'patrol';
            bot.stateT = 0;
          }
          // A planted bomb pulls the nearest Slate bot to defuse.
          if (bot.team === 'slate' && ctx.bombPlanted && ctx.bombPos) {
            const d = Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z);
            if (d < 16) {
              bot.state = 'defuse';
              bot.defuseT = 0;
              bot.stateT = 0;
            }
          }
        } else if (bot.state === 'investigate') {
          const dest = bot.heard;
          if (!dest) {
            bot.state = 'patrol';
            bot.stateT = 0;
          } else if (moveToward(bot, dest.x, dest.z, BOT_SPEED.investigate, dt)) {
            bot.yaw += dt * 1.2;
            if (bot.stateT > 3) {
              bot.heard = null;
              bot.state = 'patrol';
              bot.stateT = 0;
            }
          }
          if (bot.team === 'slate' && ctx.bombPlanted && ctx.bombPos) {
            const d = Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z);
            if (d < 16) {
              bot.state = 'defuse';
              bot.defuseT = 0;
              bot.stateT = 0;
            }
          }
        } else {
          // Patrol: walk the route, then hold a spot.
          const wp = bot.route[bot.routeIdx];
          if (!wp) {
            setHold(bot);
          } else if (moveToward(bot, wp.x, wp.z, BOT_SPEED.patrol, dt)) {
            bot.routeIdx++;
            if (bot.routeIdx >= bot.route.length) setHold(bot);
          }
          if (bot.team === 'slate' && ctx.bombPlanted && ctx.bombPos) {
            const d = Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z);
            if (d < 16) {
              bot.state = 'defuse';
              bot.defuseT = 0;
              bot.stateT = 0;
            }
          }
        }

        // Defuse movement: walk to the bomb, then channel.
        if (bot.state === 'defuse' && ctx.bombPos) {
          const d = Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z);
          if (d > 1.2) {
            moveToward(bot, ctx.bombPos.x, ctx.bombPos.z, BOT_SPEED.defuse, dt);
            bot.defuseT = 0;
          }
        }

        // Stuck recovery: barely moved in 2 s while trying to walk.
        bot.stuckT += dt;
        if (bot.stuckT > 2) {
          const moved = Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ);
          if (moved < 0.15 && (bot.state === 'patrol' || bot.state === 'investigate')) {
            bot.routeIdx++;
            if (bot.routeIdx >= bot.route.length) setHold(bot);
          }
          bot.lastX = bot.pos.x;
          bot.lastZ = bot.pos.z;
          bot.stuckT = 0;
        }

        bot.mesh.position.copy(bot.pos);
        bot.mesh.rotation.y = bot.yaw;
        void tmp;
      }
    },
  };
}
