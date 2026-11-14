// The arsenal: three guns and a grenade. Each gun owns its numbers, its view model and
// its magazine; main.js owns the ray and the damage. Spread grows with movement speed,
// so stopping to aim pays. A grenade is a thrown mesh with a fuse, bounced off the map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9', price: 500, damage: 26, headDamage: 65,
    mag: 12, reserve: 48, gap: 0.16, reload: 1.4,
    spreadStill: 0.004, spreadMoving: 0.02, kick: 0.006, auto: false,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', price: 2700, damage: 34, headDamage: 100,
    mag: 30, reserve: 90, gap: 0.096, reload: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.009, auto: true,
  },
  smg: {
    id: 'smg', name: 'Hornet-9', price: 1500, damage: 22, headDamage: 55,
    mag: 32, reserve: 96, gap: 0.06, reload: 1.7,
    spreadStill: 0.006, spreadMoving: 0.034, kick: 0.005, auto: true,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const GRENADE_MAX = 2;

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), grip);
    handle.position.set(0, -0.1, 0.08);
    model.add(slide, handle);
    model.position.set(0.22, -0.2, -0.36);
  } else if (def.id === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), body);
    sight.position.set(0, 0.08, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.24, -0.2, -0.42);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    mag.position.set(0, -0.11, -0.05);
    mag.rotation.x = 0.25;
    model.add(receiver, barrel, mag);
    model.position.set(0.23, -0.19, -0.38);
  }
  return model;
}

export function createArsenal(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: true, rifle: false, smg: false };
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo[state.current];
        const take = Math.min(def().mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    owned,
    ammoOf(id) {
      return ammo[id];
    },
    currentAmmo() {
      return ammo[state.current];
    },
    switchTo(id) {
      if (!owned[id] || id === state.current || state.reloadLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = true;
      return true;
    },
    addGrenade() {
      if (state.grenades >= GRENADE_MAX) return false;
      state.grenades += 1;
      return true;
    },
    takeGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    step,
    ready() {
      const a = ammo[state.current];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      const a = ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const a = ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === def().mag || a.reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMoving;
    },
    refill() {
      for (const d of Object.values(WEAPONS)) {
        ammo[d.id].mag = d.mag;
        ammo[d.id].reserve = d.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}

// Grenades: thrown spheres with a 1.2 s fuse. They fall, bounce once off the floor and
// walls, then call onExplode with their position. The caller owns the damage.
const GRENADE_FUSE = 1.2;
const GRENADE_GRAVITY = 14;

export function createGrenadeSystem(scene, colliders) {
  const live = [];
  const geometry = new THREE.SphereGeometry(0.09, 12, 10);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.4, metalness: 0.6 });
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  return {
    count() {
      return live.length;
    },
    throw(origin, direction) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(origin);
      mesh.castShadow = true;
      scene.add(mesh);
      live.push({
        mesh,
        velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: GRENADE_FUSE,
      });
    },
    step(dt, onExplode) {
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const g = live[i];
        g.fuse -= dt;
        g.velocity.y -= GRENADE_GRAVITY * dt;
        const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
        if (overlaps(next.x, g.mesh.position.y, g.mesh.position.z)) {
          g.velocity.x *= -0.4;
          next.x = g.mesh.position.x;
        }
        if (overlaps(g.mesh.position.x, g.mesh.position.y, next.z)) {
          g.velocity.z *= -0.4;
          next.z = g.mesh.position.z;
        }
        if (overlaps(g.mesh.position.x, next.y, g.mesh.position.z) || next.y < 0.09) {
          g.velocity.y = Math.abs(g.velocity.y) * 0.45;
          next.y = Math.max(0.09, g.mesh.position.y);
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
        }
        g.mesh.position.copy(next);
        if (g.fuse <= 0) {
          scene.remove(g.mesh);
          live.splice(i, 1);
          onExplode(g.mesh.position);
        }
      }
    },
    clear() {
      for (const g of live) scene.remove(g.mesh);
      live.length = 0;
    },
  };
}
