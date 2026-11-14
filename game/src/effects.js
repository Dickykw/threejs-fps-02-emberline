// Effects: tracers, impact sparks and explosions from fixed pools.
// Nothing is allocated in the hot loop — meshes are reused, only their transforms change.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 96;
const FLASH_COUNT = 4;

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const flashes = [];
  const tmpV = new THREE.Vector3();
  const tmpU = new THREE.Vector3();

  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: PALETTE.tracer, transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_COUNT; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }

  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: PALETTE.spark });
  for (let i = 0; i < SPARK_COUNT; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }

  const flashLight = new THREE.PointLight(0xffa040, 0, 18, 1.6);
  scene.add(flashLight);
  for (let i = 0; i < FLASH_COUNT; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.furnaceHot, transparent: true, opacity: 0 })
    );
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, life: 0 });
  }

  function nextFree(pool) {
    for (const item of pool) if (item.life <= 0) return item;
    return pool[0];
  }

  return {
    // A glowing streak from muzzle to hit point, alive for 60 ms.
    tracer(from, to) {
      const t = nextFree(tracers);
      tmpV.subVectors(to, from);
      const len = tmpV.length();
      if (len < 0.05) return;
      t.mesh.visible = true;
      t.mesh.position.copy(from).addScaledVector(tmpV, 0.5);
      t.mesh.scale.set(0.02, 0.02, len);
      t.mesh.lookAt(to);
      t.life = 0.06;
    },
    // A burst of hot chips flying out of an impact point.
    spark(pos, count = 8) {
      for (let i = 0; i < count; i++) {
        const s = nextFree(sparks);
        s.mesh.visible = true;
        s.mesh.position.copy(pos);
        s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
        s.life = 0.25 + Math.random() * 0.25;
      }
    },
    // An expanding fireball plus a light flash at the blast point.
    explosion(pos) {
      const f = nextFree(flashes);
      f.mesh.visible = true;
      f.mesh.position.copy(pos);
      f.mesh.scale.setScalar(0.5);
      f.life = 0.45;
      flashLight.position.copy(pos);
      flashLight.position.y += 0.6;
      flashLight.intensity = 60;
      this.spark(pos, 24);
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        if (s.life <= 0) {
          s.mesh.visible = false;
          continue;
        }
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
      }
      for (const f of flashes) {
        if (f.life <= 0) continue;
        f.life -= dt;
        const k = 1 - f.life / 0.45;
        f.mesh.scale.setScalar(0.5 + k * 4.5);
        f.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
        if (f.life <= 0) f.mesh.visible = false;
      }
      if (flashLight.intensity > 0) {
        flashLight.intensity = Math.max(0, flashLight.intensity - dt * 220);
      }
      void tmpU;
    },
  };
}
