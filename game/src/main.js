// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, createGrenadeSystem, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, KILL_MONEY } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const PLANT_SECONDS = 3;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 58);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders, SPAWNS.ember[1]);
const arsenal = createArsenal(camera);
const grenades = createGrenadeSystem(scene, world.colliders);
const bots = createBots(scene, world);
const rounds = createRounds();
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const endPoint = new THREE.Vector3();
const tempVec = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let paused = false;
let expectUnlock = false;
let overlayMode = 'start';
let accumulator = 0;
let lastTime = performance.now();
let plantProgress = 0;
let plantTickAt = 0;
let beepAt = 0;

function aliveCounts() {
  return {
    ember: (player.state.alive ? 1 : 0) + bots.aliveCount('ember'),
    slate: bots.aliveCount('slate'),
  };
}

function nearSite() {
  const p = player.state.position;
  for (const site of SITES) {
    const dx = p.x - site.x;
    const dz = p.z - site.z;
    if (dx * dx + dz * dz < site.r * site.r) return site;
  }
  return null;
}

function showOverlay(mode, data) {
  overlayMode = mode;
  hud.showOverlay(mode, data);
}

function onPlayerDeath(killerName) {
  hud.killFeed(`${killerName} ▸ You`);
  hud.showMessage('You are down', 3000);
  if (document.pointerLockElement) {
    expectUnlock = true;
    document.exitPointerLock();
  }
  if (rounds.state.phase === 'playing') showOverlay('dead');
}

const botHooks = {
  onTracer(from, to, team) {
    effects.tracer(from, to, team);
  },
  onShotSound(bot, distance) {
    audio.enemyShot(distance);
    bots.hearShot(bot.position.x, bot.position.z, bot.team, elapsed);
  },
  onHit(shooter, damage, head) {
    const target = shooter.target;
    if (!target) return;
    if (shooter.targetIsPlayer) {
      if (!player.state.alive) return;
      const died = player.damage(damage);
      hud.damageFlash();
      audio.hurt();
      if (died) onPlayerDeath(shooter.name);
    } else {
      const killed = bots.damage(target, damage, head ? 'head' : 'torso');
      if (killed) hud.killFeed(`${shooter.name} ▸ ${target.name}`);
    }
  },
  onDefuseDone() {
    rounds.defused(roundHooks);
  },
};

const roundHooks = {
  onBuyPhase(round) {
    bots.spawnRound();
    player.reset(SPAWNS.ember[1]);
    arsenal.refill();
    grenades.clear();
    plantProgress = 0;
    hud.setPlant(0);
    hud.setBomb('');
    world.bomb.visible = false;
    renderBuyMenu();
    showOverlay('buy', { round, money: rounds.state.money });
    if (document.pointerLockElement) {
      expectUnlock = true;
      document.exitPointerLock();
    }
  },
  onRoundStart(round) {
    hud.hideOverlay();
    hud.showMessage(`Round ${round} — go!`, 2000);
  },
  onRoundEnd(winner, reason) {
    grenades.clear();
    plantProgress = 0;
    hud.setPlant(0);
    hud.setBomb('');
    world.bomb.visible = false;
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    const matchOver = rounds.state.scoreEmber >= 5 || rounds.state.scoreSlate >= 5 || rounds.state.round >= 9;
    showOverlay('round', { winner, reason, ember: rounds.state.scoreEmber, slate: rounds.state.scoreSlate, matchOver });
    if (document.pointerLockElement) {
      expectUnlock = true;
      document.exitPointerLock();
    }
  },
  onMatchEnd(winner) {
    showOverlay('match', { winner, ember: rounds.state.scoreEmber, slate: rounds.state.scoreSlate });
    if (document.pointerLockElement) {
      expectUnlock = true;
      document.exitPointerLock();
    }
  },
  onBombExploded() {
    const bomb = rounds.state.bomb;
    tempVec.set(bomb.x, 0.5, bomb.z);
    effects.explosion(tempVec);
    audio.explosion();
    hud.setBomb('');
    world.bomb.visible = false;
  },
};

const BUY_ITEMS = [
  { id: 'rifle', key: '1', label: 'VK-47 Rifle', price: WEAPONS.rifle.price },
  { id: 'smg', key: '2', label: 'Hornet-9 SMG', price: WEAPONS.smg.price },
  { id: 'grenade', key: '3', label: 'Frag Grenade', price: GRENADE_PRICE },
  { id: 'armor', key: '4', label: 'Kevlar Armor', price: ARMOR_PRICE },
];

function renderBuyMenu() {
  const items = BUY_ITEMS.map((item) => ({
    ...item,
    owned:
      item.id === 'rifle' || item.id === 'smg'
        ? arsenal.owned[item.id]
        : item.id === 'grenade'
          ? arsenal.state.grenades >= 2
          : player.state.armor >= 100,
  }));
  hud.renderBuy(items, rounds.state.money, buyItem);
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'rifle' || id === 'smg') {
    if (arsenal.owned[id]) return;
    if (rounds.buy(WEAPONS[id].price) && arsenal.buy(id)) {
      audio.buy();
      hud.setMoney(rounds.state.money);
      renderBuyMenu();
    }
  } else if (id === 'grenade') {
    if (rounds.buy(GRENADE_PRICE) && arsenal.addGrenade()) {
      audio.buy();
      hud.setMoney(rounds.state.money);
      renderBuyMenu();
    }
  } else if (id === 'armor') {
    if (player.state.armor >= 100) return;
    if (rounds.buy(ARMOR_PRICE)) {
      player.state.armor = 100;
      audio.buy();
      hud.setMoney(rounds.state.money);
      renderBuyMenu();
    }
  }
}

function startMatch() {
  rounds.startMatch();
  bots.spawnRound();
  player.reset(SPAWNS.ember[1]);
  arsenal.refill();
  grenades.clear();
  plantProgress = 0;
  audio.unlock();
  renderBuyMenu();
  showOverlay('buy', { round: 1, money: rounds.state.money });
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (overlayMode === 'start' || overlayMode === 'match') {
    startMatch();
    return;
  }
  if (overlayMode === 'buy' || overlayMode === 'paused' || overlayMode === 'round' || overlayMode === 'dead') {
    hud.hideOverlay();
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    paused = false;
    hud.hideOverlay();
  } else if (expectUnlock) {
    expectUnlock = false;
  } else if (started && rounds.state.phase === 'playing' && player.state.alive) {
    paused = true;
    showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + (body.alive ? body.eye : 0.5), body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = arsenal.def();
  if (!arsenal.takeRound()) {
    audio.dryFire();
    arsenal.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit) endPoint.copy(hit.point);
  else endPoint.copy(camera.position).addScaledVector(direction, 80);
  effects.tracer(camera.position, endPoint, 'ember');
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    if (bot.alive) {
      const damage = hit.object.userData.part === 'head' ? def.headDamage : def.damage;
      const killed = bots.damage(bot, damage, hit.object.userData.part);
      hud.hitMarker(killed);
      if (killed) {
        rounds.addMoney(KILL_MONEY);
        hud.killFeed(`You ▸ ${bot.name}`);
        audio.kill();
      } else {
        audio.hit();
      }
    } else {
      effects.spark(hit.point);
    }
  } else if (hit) {
    effects.spark(hit.point);
  }
  arsenal.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.id);
  bots.hearShot(player.state.position.x, player.state.position.z, 'ember', elapsed);
  return true;
}

function onGrenadeExplode(pos) {
  effects.explosion(pos);
  audio.explosion();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
    if (d >= 8) continue;
    const killed = bots.damage(bot, d < 4 ? 90 : 40, 'torso');
    if (killed) {
      if (bot.team === 'slate') {
        rounds.addMoney(KILL_MONEY);
        hud.killFeed(`You ▸ ${bot.name} (frag)`);
      } else {
        hud.killFeed(`${bot.name} caught the blast`);
      }
    }
  }
  const pd = Math.hypot(player.state.position.x - pos.x, player.state.position.z - pos.z);
  if (pd < 8 && player.state.alive) {
    const died = player.damage(pd < 4 ? 45 : 20);
    hud.damageFlash();
    if (died) onPlayerDeath('Your own grenade');
  }
}

function updatePlant(dt) {
  if (!player.state.alive || rounds.state.bomb.planted || rounds.state.phase !== 'playing') {
    if (plantProgress > 0) {
      plantProgress = 0;
      hud.setPlant(0);
    }
    return;
  }
  const site = nearSite();
  if (site && input.state.keys.has('KeyE')) {
    plantProgress += dt / PLANT_SECONDS;
    hud.setPlant(plantProgress);
    if (elapsed >= plantTickAt) {
      audio.plantTick();
      plantTickAt = elapsed + 0.5;
    }
    if (plantProgress >= 1) {
      plantProgress = 0;
      hud.setPlant(0);
      rounds.plant(site.name, site.x, site.z);
      world.bomb.position.set(site.x, 0.11, site.z);
      world.bomb.visible = true;
      beepAt = elapsed;
      hud.setBomb(`BOMB PLANTED — SITE ${site.name}`);
      hud.killFeed(`Bomb planted at ${site.name}`);
      hud.showMessage(`Bomb planted at ${site.name}!`, 3000);
    }
  } else if (plantProgress > 0) {
    plantProgress = 0;
    hud.setPlant(0);
  }
}

function updateBomb(dt) {
  if (!rounds.state.bomb.planted) return;
  const bomb = rounds.state.bomb;
  if (elapsed >= beepAt) {
    audio.bombBeep(bomb.timer <= 10);
    beepAt = elapsed + (bomb.timer <= 10 ? 0.45 : 1.0);
    world.bombLight.visible = !world.bombLight.visible;
  }
  hud.setBomb(`BOMB ${bomb.site} — 0:${String(Math.max(0, Math.ceil(bomb.timer))).padStart(2, '0')}`);
}

function handlePressed(pressed) {
  for (const code of pressed) {
    if (code === 'KeyG' && rounds.state.phase === 'playing' && player.state.alive) {
      if (arsenal.takeGrenade()) {
        camera.getWorldDirection(direction);
        tempVec.copy(camera.position).addScaledVector(direction, 0.5);
        tempVec.y -= 0.1;
        grenades.throw(tempVec, direction);
      }
    } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
      if (rounds.state.phase === 'buy') {
        buyItem(BUY_ITEMS[Number(code.slice(-1)) - 1].id);
      } else if (rounds.state.phase === 'playing') {
        const ids = ['rifle', 'smg', 'pistol'];
        const id = ids[Number(code.slice(-1)) - 1];
        if (id) arsenal.switchTo(id);
      }
    } else if (code === 'KeyB' && rounds.state.phase === 'buy') {
      hud.hideOverlay();
      input.requestLock();
    }
  }
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'playing' && !paused) {
    player.step(dt, input.state.keys);
    bots.step(dt, elapsed, player, rounds.state.bomb, botHooks);
    grenades.step(dt, onGrenadeExplode);
    updatePlant(dt);
    updateBomb(dt);
  }
  rounds.step(dt, aliveCounts(), roundHooks);
  arsenal.step(dt);
  effects.step(dt);
}

function syncHud() {
  const a = arsenal.currentAmmo();
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(a.mag, a.reserve, arsenal.def().name);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.scoreEmber, rounds.state.scoreSlate, rounds.state.round);
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  const counts = aliveCounts();
  hud.setAlive(counts.ember, counts.slate);
  hud.setCrosshairGap(6 + arsenal.spread(player.groundSpeed()) * 350);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    handlePressed(input.takePressed());
    if (!paused && rounds.state.phase === 'playing' && input.state.locked) {
      if (input.state.firing && arsenal.ready()) shoot(arsenal.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) arsenal.reload();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    // Spiral-of-death guard: a long hitch must not queue a burst of catch-up steps.
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  player.state.pitch = 0;
  player.state.yaw = 0;
  if (name === 'play') {
    rounds.state.round = 3;
    rounds.state.scoreEmber = 2;
    rounds.state.scoreSlate = 1;
    rounds.state.money = 1450;
    rounds.state.timer = 83;
    rounds.state.phase = 'playing';
    arsenal.buy('rifle');
    arsenal.switchTo('rifle');
    arsenal.ammoOf('rifle').mag = 24;
    bots.spawnRound();
    bots.bots[0].position.set(-6, 0, 2);
    bots.bots[1].position.set(4, 0, -1);
    bots.bots[4].position.set(-2, 0, 8);
    player.state.position.set(0, 0, 10);
    settle(20);
    aimAt(bots.aimPoint(0));
    shoot(0);
    settle(12);
    aimAt(bots.aimPoint(1));
  } else if (name === 'end') {
    rounds.state.round = 6;
    rounds.state.scoreEmber = 3;
    rounds.state.scoreSlate = 2;
    rounds.state.money = 2200;
    rounds.state.phase = 'playing';
    rounds.state.bomb.planted = true;
    rounds.state.bomb.site = 'A';
    rounds.state.bomb.x = -14;
    rounds.state.bomb.z = -10;
    rounds.state.bomb.timer = 32;
    world.bomb.position.set(-14, 0.11, -10);
    world.bomb.visible = true;
    bots.spawnRound();
    // Camera inside site A (west side, clear of furnace + heat shield) looking at the bomb.
    player.state.position.set(-17, 0, -8);
    settle(20);
    aimAt(new THREE.Vector3(-14, 0.6, -10));
    hud.setBomb('BOMB A — 0:32');
  } else {
    player.state.position.set(0, 0, 12);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    showOverlay('start');
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.domElement.addEventListener('click', () => {
  if (!shot && !input.state.locked && rounds.state.phase === 'playing' && overlayMode !== 'dead') {
    input.requestLock();
  }
});

syncCamera();
syncHud();
showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
