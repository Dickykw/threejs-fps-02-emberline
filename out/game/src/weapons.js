// Weapons: the arsenal — three guns and a grenade — with spread, recoil, reload
// and per-weapon damage. Firing only decides the shot; the caller resolves hits.
import * as THREE from 'three';
import { clamp } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'P9',
    price: 500,
    mag: 12,
    reserveMax: 48,
    damage: 30,
    headMult: 2.5,
    interval: 0.18,
    reloadTime: 1.4,
    spread: 0.012,
    moveSpread: 0.03,
    recoil: 0.011,
    auto: false,
    range: 60,
  },
  rifle: {
    id: 'rifle',
    name: 'VK-47',
    price: 2700,
    mag: 30,
    reserveMax: 90,
    damage: 34,
    headMult: 3,
    interval: 0.1,
    reloadTime: 2.2,
    spread: 0.008,
    moveSpread: 0.035,
    recoil: 0.014,
    auto: true,
    range: 80,
  },
  smg: {
    id: 'smg',
    name: 'Hornet-9',
    price: 1500,
    mag: 24,
    reserveMax: 72,
    damage: 22,
    headMult: 2.5,
    interval: 0.07,
    reloadTime: 1.8,
    spread: 0.016,
    moveSpread: 0.04,
    recoil: 0.009,
    auto: true,
    range: 50,
  },
};

export const GRENADE = {
  price: 300,
  fuse: 1.2,
  radius: 5.5,
  maxDamage: 90,
  minDamage: 10,
};

export function createArsenal() {
  const owned = {
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax },
    rifle: null,
    smg: null,
  };
  return {
    owned,
    current: 'pistol',
    grenades: 0,
    // Live grenades in the world: {pos, vel, fuse}.
    live: [],
    cooldown: 0,
    reloadT: 0,
    reloading: false,
    spreadBloom: 0,

    def() {
      return WEAPONS[this.current];
    },
    ammo() {
      return owned[this.current];
    },
    canFire() {
      const a = this.ammo();
      return !this.reloading && this.cooldown <= 0 && a && a.mag > 0;
    },
    // Consume one round and return the shot's spread; null when it cannot fire.
    // `moving` (0..1) and `airborne` widen the cone, so firing on the move is punished.
    fire(moving, airborne) {
      if (!this.canFire()) return null;
      const def = this.def();
      const a = this.ammo();
      a.mag -= 1;
      this.cooldown = def.interval;
      const spread = def.spread + def.moveSpread * moving + (airborne ? 0.03 : 0) + this.spreadBloom;
      this.spreadBloom = Math.min(0.05, this.spreadBloom + def.recoil);
      return { spread, def };
    },
    dryFire() {
      this.cooldown = 0.25;
    },
    startReload() {
      const a = this.ammo();
      if (!a || this.reloading || a.mag >= this.def().mag || a.reserve <= 0) return false;
      this.reloading = true;
      this.reloadT = this.def().reloadTime;
      return true;
    },
    switchTo(id) {
      if (!owned[id] || id === this.current) return false;
      this.current = id;
      this.reloading = false;
      this.cooldown = 0.15;
      this.spreadBloom = 0;
      return true;
    },
    buy(id) {
      if (owned[id]) return { ok: false, reason: 'owned' };
      owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserveMax };
      return { ok: true };
    },
    buyGrenade() {
      this.grenades += 1;
      return true;
    },
    buyArmor() {
      return true;
    },
    refill() {
      for (const id of Object.keys(owned)) {
        if (owned[id]) {
          owned[id].mag = WEAPONS[id].mag;
          owned[id].reserve = WEAPONS[id].reserveMax;
        }
      }
      this.grenades = 0;
      this.reloading = false;
    },
    // Throw a grenade from `origin` along `dir` with a 1.2 s fuse.
    throwGrenade(origin, dir) {
      if (this.grenades <= 0) return false;
      this.grenades -= 1;
      this.live.push({
        pos: new THREE.Vector3(origin.x, origin.y, origin.z),
        vel: new THREE.Vector3(dir.x * 17, dir.y * 17 + 3.5, dir.z * 17),
        fuse: GRENADE.fuse,
      });
      return true;
    },
    // Step live grenades: gravity, bounce off the floor and walls, fuse countdown.
    // Returns the grenades whose fuse hit zero this step (positions to detonate).
    updateGrenades(dt, world) {
      const done = [];
      for (let i = this.live.length - 1; i >= 0; i--) {
        const g = this.live[i];
        g.fuse -= dt;
        g.vel.y -= 12 * dt;
        g.pos.addScaledVector(g.vel, dt);
        if (g.pos.y < 0.12) {
          g.pos.y = 0.12;
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        }
        const before = { x: g.pos.x, z: g.pos.z };
        world.collideCircle(g.pos, 0.12, g.pos.y, 0.2);
        if ((g.pos.x !== before.x || g.pos.z !== before.z) && Math.hypot(g.vel.x, g.vel.z) > 0.5) {
          // A wall bounce: dampen the horizontal speed.
          g.vel.x *= 0.5;
          g.vel.z *= 0.5;
        }
        if (g.fuse <= 0) {
          done.push({ x: g.pos.x, y: Math.max(0.2, g.pos.y), z: g.pos.z });
          this.live.splice(i, 1);
        }
      }
      return done;
    },
    update(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.spreadBloom = Math.max(0, this.spreadBloom - dt * 0.06);
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          this.reloading = false;
          const def = this.def();
          const a = this.ammo();
          const need = def.mag - a.mag;
          const take = Math.min(need, a.reserve);
          a.mag += take;
          a.reserve -= take;
        }
      }
    },
    // AoE damage of a detonation at `at` against a target at `p` (feet position).
    grenadeDamage(at, p) {
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d > GRENADE.radius) return 0;
      const k = 1 - d / GRENADE.radius;
      return Math.round(GRENADE.minDamage + (GRENADE.maxDamage - GRENADE.minDamage) * k);
    },
  };
}

// A shot's direction with spread applied: base dir plus a random cone offset.
export function spreadDir(dir, spread, rng) {
  const a = rng() * Math.PI * 2;
  const r = (rng() + rng()) * 0.5 * spread;
  const out = new THREE.Vector3(dir.x, dir.y, dir.z);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.y) > 0.9) right.set(0, 0, 1);
  else right.crossVectors(dir, up).normalize();
  up.crossVectors(right, dir).normalize();
  out.addScaledVector(right, Math.cos(a) * r);
  out.addScaledVector(up, Math.sin(a) * r);
  return out.normalize();
}
