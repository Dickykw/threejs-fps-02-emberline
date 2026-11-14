// EMBERLINE: a round-based tactical FPS — main entrypoint.
// Fixed-step simulation (60 Hz) kept apart from rendering; the game loop reads
// input, steps the sim, then renders. Screenshot modes (?shot=) build a
// deterministic frame, render it twice, freeze, and set window.__shotReady.
import * as THREE from 'three';
import { PALETTE, mulberry32, clamp } from './palette.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { buildWorld, SITES } from './world.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE, spreadDir } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, PLANT_TIME } from './rounds.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = shotMode ? mulberry32(seed) : Math.random;

// --- boot ---------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 18, 55);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();
const player = createPlayer(world, { x: 0, z: 12 });
const arsenal = createArsenal();
const bots = createBots(world, scene, rng);
const rounds = createRounds();

// Viewmodel: a gun held in front of the camera, with recoil kick and a flash.
const viewmodel = new THREE.Group();
const vmBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.09, 0.15, 0.52),
  new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.45, metalness: 0.55 })
);
viewmodel.add(vmBody);
const vmBarrel = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, 0.05, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.4, metalness: 0.6 })
);
vmBarrel.position.set(0, 0.02, -0.38);
viewmodel.add(vmBarrel);
const flash = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.22),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide })
);
flash.position.set(0, 0.02, -0.56);
viewmodel.add(flash);
viewmodel.position.set(0.28, -0.26, -0.55);
camera.add(viewmodel);
let vmKick = 0;
let flashT = 0;

let time = 0;
let roundEndShown = false;
let matchShown = false;

// --- helpers ------------------------------------------------------------
function eyePos() {
  const e = player.eye;
  return new THREE.Vector3(e.x, e.y, e.z);
}
function forwardVec(yaw, pitch) {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
function aimAt(point) {
  const e = eyePos();
  const dx = point.x - e.x;
  const dy = point.y - e.y;
  const dz = point.z - e.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.45, 1.45);
}

// Ray vs a bot's head and body spheres; returns the closest hit or null.
function raycastBots(origin, dir, maxDist) {
  let best = null;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === 'ember') continue; // no friendly fire
    const tests = [
      { c: new THREE.Vector3(bot.pos.x, bot.pos.y + 1.55, bot.pos.z), r: 0.24, head: true },
      { c: new THREE.Vector3(bot.pos.x, bot.pos.y + 1.0, bot.pos.z), r: 0.5, head: false },
    ];
    for (const t of tests) {
      const ocx = origin.x - t.c.x;
      const ocy = origin.y - t.c.y;
      const ocz = origin.z - t.c.z;
      const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      const c = ocx * ocx + ocy * ocy + ocz * ocz - t.r * t.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const d = -b - Math.sqrt(disc);
      if (d < 0 || d > maxDist) continue;
      if (!best || d < best.dist) best = { bot, dist: d, head: t.head };
    }
  }
  return best;
}

function muzzlePos() {
  const e = eyePos();
  const f = forwardVec(player.yaw, player.pitch);
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  return e.addScaledVector(f, 0.6).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.12, 0));
}

// The player's shot: spread, wall test, bot test, tracer, sound, recoil.
function shoot() {
  const def = arsenal.def();
  const moving = clamp(player.speed2d / 5.2, 0, 1);
  const shot = arsenal.fire(moving, !player.onGround);
  if (!shot) {
    if (arsenal.ammo() && arsenal.ammo().mag === 0) {
      audio.dryFire();
      arsenal.dryFire();
    }
    return;
  }
  const dir = spreadDir(forwardVec(player.yaw, player.pitch), shot.spread, rng);
  const origin = eyePos();
  const wallDist = world.rayWalls(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range);
  const hit = raycastBots(origin, dir, def.range);
  const m = muzzlePos();
  let end;
  if (hit && hit.dist < wallDist) {
    end = origin.clone().addScaledVector(dir, hit.dist);
    const dmg = Math.round(def.damage * (hit.head ? def.headMult : 1));
    const killed = bots.damageBot(hit.bot, dmg, hit.head, null, botCtx);
    effects.spark(end, hit.head ? 12 : 8);
    hud.showHitmarker(killed);
    audio.hit();
    if (killed) {
      rounds.addKillReward();
      hud.addKill(`You ▸ ${hit.bot.name}${hit.head ? ' (headshot)' : ''}`);
    }
  } else if (wallDist < Infinity) {
    end = origin.clone().addScaledVector(dir, wallDist);
    effects.spark(end, 6);
  } else {
    end = origin.clone().addScaledVector(dir, def.range);
  }
  effects.tracer(m, end);
  audio.shot(def.id);
  vmKick = 0.09;
  flashT = 0.045;
  player.pitch = clamp(player.pitch + def.recoil * 0.35, -1.45, 1.45);
  bots.hear(player.pos.x, player.pos.z);
}

function throwGrenade() {
  const e = eyePos();
  const dir = forwardVec(player.yaw, player.pitch);
  if (arsenal.throwGrenade(e, dir)) audio.click();
}

function detonate(at) {
  effects.explosion(new THREE.Vector3(at.x, at.y, at.z));
  audio.explosion();
  bots.hear(at.x, at.z);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dmg = arsenal.grenadeDamage(at, bot.pos);
    if (dmg > 0) {
      const killed = bots.damageBot(bot, dmg, false, null, botCtx);
      if (killed) {
        rounds.addKillReward();
        hud.addKill(`You ▸ ${bot.name} (grenade)`);
      }
    }
  }
  const pd = arsenal.grenadeDamage(at, player.pos);
  if (pd > 0 && player.alive) {
    const killed = player.damage(pd);
    audio.hurt();
    if (killed) hud.addKill(`Grenade ▸ You`);
  }
}

// --- bot context --------------------------------------------------------
const botCtx = {
  get time() {
    return time;
  },
  get playerAlive() {
    return player.alive;
  },
  get playerEye() {
    if (!player.alive) return null;
    const e = player.eye;
    return new THREE.Vector3(e.x, e.y, e.z);
  },
  get playerMoving() {
    return player.moving;
  },
  get bombPlanted() {
    return rounds.bomb.planted;
  },
  get bombPos() {
    return rounds.bomb.planted ? { x: rounds.bomb.x, z: rounds.bomb.z } : null;
  },
  damagePlayer(amount, srcBot) {
    if (!player.alive) return;
    const killed = player.damage(amount);
    audio.hurt();
    if (killed) {
      hud.addKill(`${srcBot.name} ▸ You`);
      hud.showOverlay('You died', 'Your team fights on — you respawn next round.', 'Wait for next round', () => {});
      document.getElementById('overlay-btn')?.setAttribute('disabled', 'true');
    }
  },
  onKill(killer, victim) {
    if (victim && killer) hud.addKill(`${killer.name} ▸ ${victim.name}`);
  },
  onBotShot() {},
  onDefused() {
    rounds.endRound('slate', 'Bomb defused');
    world.bombMesh.visible = false;
    audio.defuse();
    onRoundEnd();
  },
};

// --- rounds flow --------------------------------------------------------
function respawnAll() {
  const armor = player.armor;
  player.reset({ x: 0, z: 12 });
  player.armor = armor;
  arsenal.refill();
  bots.spawnRound();
  hud.hideOverlay();
  document.getElementById('overlay-btn')?.removeAttribute('disabled');
  roundEndShown = false;
}

function startMatch() {
  rounds.reset();
  matchShown = false;
  respawnAll();
  showBuyMenu();
}

function showBuyMenu() {
  const items = [
    { id: 'rifle', name: 'VK-47 Rifle', price: WEAPONS.rifle.price, owned: !!arsenal.owned.rifle, desc: '30-round automatic rifle' },
    { id: 'smg', name: 'Hornet-9 SMG', price: WEAPONS.smg.price, owned: !!arsenal.owned.smg, desc: 'Fast 24-round SMG' },
    { id: 'grenade', name: 'Grenade', price: GRENADE.price, owned: false, desc: 'Timed explosive, 5.5 m blast' },
    { id: 'armor', name: 'Kevlar Vest', price: 650, owned: player.armor > 0, desc: 'Absorbs half of damage' },
  ];
  hud.renderBuy(items, rounds.money, buyItem);
  hud.showBuy(true);
}

function buyItem(id) {
  if (rounds.phase !== 'buy') return;
  const price = id === 'rifle' ? WEAPONS.rifle.price : id === 'smg' ? WEAPONS.smg.price : id === 'grenade' ? GRENADE.price : 650;
  if (rounds.money < price) return;
  if (id === 'rifle' || id === 'smg') {
    const res = arsenal.buy(id);
    if (!res.ok) return;
    arsenal.switchTo(id);
  } else if (id === 'grenade') {
    arsenal.buyGrenade();
  } else {
    player.armor = 50;
  }
  rounds.money -= price;
  audio.buy();
  showBuyMenu();
}

function onRoundEnd() {
  if (roundEndShown) return;
  roundEndShown = true;
  const w = rounds.lastWinner;
  hud.showBanner(
    w === 'ember' ? 'ROUND WON' : 'ROUND LOST',
    `${rounds.lastReason} — ${rounds.scoreEmber} : ${rounds.scoreSlate}`
  );
  if (w === 'ember') audio.roundWin();
  else audio.roundLose();
  hud.showBuy(false);
  hud.setPlant(null);
  world.bombMesh.visible = false;
}

function onMatchEnd() {
  if (matchShown) return;
  matchShown = true;
  const w = rounds.matchWinner;
  const title = w === 'ember' ? 'VICTORY' : w === 'slate' ? 'DEFEAT' : 'DRAW';
  hud.showOverlay(
    title,
    `Final score ${rounds.scoreEmber} — ${rounds.scoreSlate}. Emberline is a round-based tactical FPS: plant the bomb or eliminate Slate, first to 5 rounds.`,
    'Play again',
    () => {
      startMatch();
    }
  );
  document.getElementById('overlay-btn')?.removeAttribute('disabled');
}

// --- per-step sim -------------------------------------------------------
function step(dt) {
  time += dt;
  const look = input.consumeLook();
  const axis = input.moveAxis();
  const wantJump = input.wasPressed('Space');
  player.crouch = input.crouch;
  player.update(dt, axis, look, wantJump);

  // Weapon input.
  const def = arsenal.def();
  if (input.wasPressed('KeyR')) {
    if (arsenal.startReload()) audio.reload();
  }
  if (input.wasPressed('Digit1')) arsenal.switchTo('pistol');
  if (input.wasPressed('Digit2') && arsenal.owned.rifle) arsenal.switchTo('rifle');
  if (input.wasPressed('Digit3') && arsenal.owned.smg) arsenal.switchTo('smg');
  if (input.wasPressed('KeyG')) throwGrenade();
  if (rounds.phase === 'buy') {
    if (input.wasPressed('Digit1')) buyItem('rifle');
    if (input.wasPressed('Digit2')) buyItem('smg');
    if (input.wasPressed('Digit3')) buyItem('grenade');
    if (input.wasPressed('Digit4')) buyItem('armor');
  }
  const wantFire = def.auto ? input.attackHeld : input.consumeAttackPressed();
  if (wantFire && player.alive && (rounds.phase === 'playing' || rounds.phase === 'buy')) shoot();
  arsenal.update(dt);

  // Grenades.
  for (const at of arsenal.updateGrenades(dt, world)) detonate(at);

  // Bomb plant: hold E inside a site.
  if (rounds.phase === 'playing' && player.alive && !rounds.bomb.planted) {
    let site = null;
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r) site = key;
    }
    if (site && keysDown.has('KeyE')) {
      rounds.plantT += dt;
      hud.setPlant(rounds.plantT / PLANT_TIME);
      if (rounds.plantT >= PLANT_TIME) {
        const s = SITES[site];
        rounds.plant(site, s.x, s.z);
        world.bombMesh.position.set(s.x, 0, s.z);
        world.bombMesh.visible = true;
        audio.plantDone();
        hud.addKill(`Bomb planted at ${site}`);
        hud.setPlant(null);
      }
    } else {
      rounds.plantT = 0;
      hud.setPlant(null);
    }
  }

  // Bots.
  bots.update(dt, botCtx);

  // Round timer / bomb / eliminations.
  const ev = rounds.update(dt, {
    emberAlive: (player.alive ? 1 : 0) + bots.aliveCount('ember'),
    slateAlive: bots.aliveCount('slate'),
  });
  if (ev === 'roundStart') {
    hud.showBuy(false);
    hud.hideBanner();
    hud.showBanner(`ROUND ${rounds.round}`, 'Eliminate Slate or plant the bomb');
  } else if (ev === 'roundEnd') {
    onRoundEnd();
  } else if (ev === 'bombExploded') {
    detonate({ x: rounds.bomb.x, y: 0.4, z: rounds.bomb.z });
    onRoundEnd();
  }

  // Round-end / match-end transitions after a short beat.
  if (rounds.phase === 'roundEnd' && rounds.phaseT > 3) {
    rounds.nextRound();
    respawnAll();
    showBuyMenu();
  }
  if (rounds.phase === 'matchEnd' && rounds.phaseT > 3) onMatchEnd();

  // Footsteps.
  if (player.stepped) {
    player.stepped = false;
    audio.step();
  }

  // Furnace flicker + bomb blink.
  world.furnaceLight.intensity = 26 + Math.sin(time * 7) * 3 + Math.sin(time * 13.3) * 2;
  if (world.bombMesh.visible) {
    const on = Math.sin(time * 6) > 0;
    world.bombBlink.color.setHex(on ? 0xff2222 : 0x550000);
  }

  effects.update(dt);
  input.consumePressed();
}

// E-key state lives outside input's edge set so holding it plants the bomb.
const keysDown = new Set();
window.addEventListener('keydown', (e) => keysDown.add(e.code));
window.addEventListener('keyup', (e) => keysDown.delete(e.code));

// --- render -------------------------------------------------------------
function render() {
  const e = player.eye;
  camera.position.set(e.x, e.y, e.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  vmKick = Math.max(0, vmKick - 0.008);
  viewmodel.position.z = -0.55 + vmKick;
  if (flashT > 0) {
    flashT -= 1 / 60;
    flash.material.opacity = flashT > 0 ? 0.9 : 0;
  }
  renderer.render(scene, camera);
}

function updateHud() {
  const a = arsenal.ammo();
  hud.update({
    hp: player.hp,
    armor: player.armor,
    mag: a ? a.mag : null,
    reserve: a ? a.reserve : null,
    weaponName: arsenal.def().name,
    money: rounds.money,
    timer: rounds.phase === 'buy' ? rounds.timer : rounds.bomb.planted ? rounds.bomb.timer : rounds.timer,
    scoreEmber: rounds.scoreEmber,
    scoreSlate: rounds.scoreSlate,
    round: rounds.round,
    aliveEmber: (player.alive ? 1 : 0) + bots.aliveCount('ember'),
    aliveSlate: bots.aliveCount('slate'),
    bombText: rounds.bomb.planted ? `BOMB ${rounds.bomb.site} — 0:${String(Math.max(0, Math.ceil(rounds.bomb.timer))).padStart(2, '0')}` : '',
    phase: rounds.phase,
    spread: arsenal.spreadBloom,
    moving: player.moving,
  });
}

// --- main loop ----------------------------------------------------------
let last = performance.now();
let acc = 0;
let frozen = false;
function loop(now) {
  if (frozen) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  render();
  updateHud();
}

function settle(steps) {
  for (let i = 0; i < steps; i++) step(STEP);
  render();
}

function paintTwiceThenReady() {
  render();
  updateHud();
  render();
  window.__shotReady = true;
  frozen = true;
}

// --- screenshot modes ---------------------------------------------------
function runShot(name) {
  hud.hideOverlay();
  input.forceLock();
  player.yaw = 0;
  player.pitch = 0;
  if (name === 'play') {
    rounds.round = 3;
    rounds.scoreEmber = 2;
    rounds.scoreSlate = 1;
    rounds.money = 1450;
    rounds.timer = 83;
    rounds.phase = 'playing';
    arsenal.buy('rifle');
    arsenal.switchTo('rifle');
    arsenal.ammo().mag = 24;
    bots.spawnRound();
    bots.bots[2].pos.set(-6, 0, 2);
    bots.bots[3].pos.set(4, 0, -1);
    bots.bots[4].pos.set(-2, 0, 8);
    player.pos.set(0, 0, 10);
    settle(20);
    aimAt(bots.aimPoint(2));
    shoot();
    settle(12);
    aimAt(bots.aimPoint(3));
  } else if (name === 'end') {
    rounds.round = 6;
    rounds.scoreEmber = 3;
    rounds.scoreSlate = 2;
    rounds.money = 2200;
    rounds.phase = 'playing';
    rounds.bomb.planted = true;
    rounds.bomb.site = 'A';
    rounds.bomb.x = -14;
    rounds.bomb.z = -10;
    rounds.bomb.timer = 32;
    world.bombMesh.position.set(-14, 0, -10);
    world.bombMesh.visible = true;
    bots.spawnRound();
    // Camera inside site A (west side, clear of furnace + heat shield) looking at the bomb.
    player.pos.set(-17, 0, -8);
    settle(20);
    aimAt(new THREE.Vector3(-14, 0.6, -10));
  } else {
    player.pos.set(0, 0, 12);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    rounds.phase = 'buy';
    rounds.money = 800;
    hud.showOverlay(
      'EMBERLINE',
      'Foundry Yard. Plant the bomb at A or B, or eliminate Slate. First to 5 rounds takes the match.',
      'Click to play',
      () => {}
    );
  }
  paintTwiceThenReady();
}

// --- start --------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotMode) {
  runShot(shotMode);
} else {
  hud.showOverlay(
    'EMBERLINE',
    'Foundry Yard. Plant the bomb at A or B, or eliminate Slate. First to 5 rounds takes the match.\n\nW A S D — Move · Mouse — Look · Click — Fire · R — Reload · 1 2 3 — Switch weapon · E — Plant bomb (at a site) · G — Throw grenade · Ctrl — Crouch · Space — Jump',
    'Click to play',
    () => {
      audio.unlock();
      input.forceLock();
      hud.hideOverlay();
      startMatch();
    }
  );
  requestAnimationFrame(loop);
}
