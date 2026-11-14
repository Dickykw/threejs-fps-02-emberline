// Player: first-person movement with acceleration, friction, crouch, jump and
// gravity, plus health and armour. Collision is a circle in XZ against the world.
import * as THREE from 'three';
import { clamp } from './palette.js';

export const PLAYER_RADIUS = 0.35;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 11;
const JUMP_VEL = 5.2;
const GRAVITY = -14;

export function createPlayer(world, spawn) {
  const pos = new THREE.Vector3(spawn.x, 0, spawn.z);
  const vel = new THREE.Vector3();
  return {
    pos,
    vel,
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    crouch: false,
    onGround: true,
    alive: true,
    stepTimer: 0,

    get eyeHeight() {
      return this.crouch ? EYE_CROUCH : EYE_STAND;
    },
    get eye() {
      return { x: pos.x, y: pos.y + this.eyeHeight, z: pos.z };
    },
    get speed2d() {
      return Math.hypot(vel.x, vel.z);
    },
    get moving() {
      return this.speed2d > 0.6;
    },

    reset(spawnPoint) {
      pos.set(spawnPoint.x, 0, spawnPoint.z);
      vel.set(0, 0, 0);
      this.yaw = 0;
      this.pitch = 0;
      this.hp = 100;
      this.armor = 0;
      this.crouch = false;
      this.onGround = true;
      this.alive = true;
    },

    // lookDX/DY are mouse pixels since the last step; axis is {f, s} in -1..1.
    update(dt, axis, look, wantJump) {
      if (!this.alive) return;
      this.yaw -= look.dx * 0.0022;
      this.pitch = clamp(this.pitch - look.dy * 0.0022, -1.45, 1.45);

      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Forward is -Z rotated by yaw; right is +X rotated by yaw.
      let wx = -sin * axis.f + cos * axis.s;
      let wz = -cos * axis.f - sin * axis.s;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) {
        wx /= wl;
        wz /= wl;
      }
      const maxSpeed = this.crouch ? CROUCH_SPEED : WALK_SPEED;
      vel.x += wx * ACCEL * dt;
      vel.z += wz * ACCEL * dt;
      // Friction when no input, so stopping to aim pays.
      if (wl < 0.05) {
        const f = Math.max(0, 1 - FRICTION * dt);
        vel.x *= f;
        vel.z *= f;
      }
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > maxSpeed) {
        vel.x *= maxSpeed / sp;
        vel.z *= maxSpeed / sp;
      }
      if (wantJump && this.onGround) {
        vel.y = JUMP_VEL;
        this.onGround = false;
      }
      vel.y += GRAVITY * dt;
      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      pos.y += vel.y * dt;
      if (pos.y <= 0) {
        pos.y = 0;
        vel.y = 0;
        this.onGround = true;
      }
      const h = this.crouch ? 1.15 : 1.7;
      world.collideCircle(pos, PLAYER_RADIUS, pos.y, h);
      // Footstep timing for the audio layer.
      if (this.moving && this.onGround) {
        this.stepTimer -= dt * this.speed2d;
        if (this.stepTimer <= 0) {
          this.stepTimer = 2.1;
          this.stepped = true;
        }
      }
    },

    // Damage with armour absorbing half; returns true when this kill lands.
    damage(amount) {
      if (!this.alive) return false;
      let rest = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, rest * 0.5);
        this.armor -= absorbed;
        rest -= absorbed;
      }
      this.hp -= rest;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        return true;
      }
      return false;
    },

    healFull() {
      this.hp = 100;
      this.alive = true;
    },
  };
}
