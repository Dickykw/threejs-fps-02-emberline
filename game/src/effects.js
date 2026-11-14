// Transient effects: bullet tracers, impact sparks and the explosion flash. One pool
// of line and point objects, reused, so firing never allocates in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.35;
const SPARK_COUNT = 10;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));

  for (let i = 0; i < 12; i += 1) {
    const line = new THREE.Line(
      tracerGeo.clone(),
      new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  for (let i = 0; i < 6; i += 1) {
    const points = new THREE.Points(
      sparkGeo.clone(),
      new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.gold), size: 0.09, transparent: true, opacity: 0.95 }),
    );
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocities: new Float32Array(SPARK_COUNT * 3) });
  }
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22, 1.4);
  scene.add(flashLight);
  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  flashSphere.visible = false;
  scene.add(flashSphere);
  let flashLife = 0;

  function tracer(from, to, team) {
    for (const t of tracers) {
      if (t.life > 0) continue;
      const attr = t.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      t.line.material.color.set(team === 'slate' ? PALETTE.foe : PALETTE.accent);
      t.line.visible = true;
      t.life = TRACER_LIFE;
      return;
    }
  }

  function spark(at) {
    for (const s of sparks) {
      if (s.life > 0) continue;
      const attr = s.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        attr.setXYZ(i, at.x, at.y, at.z);
        s.velocities[i * 3] = (Math.random() * 2 - 1) * 3;
        s.velocities[i * 3 + 1] = Math.random() * 3;
        s.velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 3;
      }
      attr.needsUpdate = true;
      s.points.visible = true;
      s.life = SPARK_LIFE;
      return;
    }
  }

  function explosion(at) {
    flashLight.position.copy(at);
    flashLight.position.y += 0.5;
    flashLight.intensity = 120;
    flashSphere.position.copy(at);
    flashSphere.scale.setScalar(0.5);
    flashSphere.visible = true;
    flashLife = 0.5;
    spark(at);
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const attr = s.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        attr.setXYZ(
          i,
          attr.getX(i) + s.velocities[i * 3] * dt,
          Math.max(0.02, attr.getY(i) + s.velocities[i * 3 + 1] * dt),
          attr.getZ(i) + s.velocities[i * 3 + 2] * dt,
        );
        s.velocities[i * 3 + 1] -= 9 * dt;
      }
      attr.needsUpdate = true;
      s.points.material.opacity = Math.max(0, s.life / SPARK_LIFE);
      if (s.life <= 0) s.points.visible = false;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = Math.max(0, flashLife * 240);
      flashSphere.scale.setScalar(0.5 + (0.5 - flashLife) * 9);
      flashSphere.material.opacity = Math.max(0, flashLife * 1.4);
      if (flashLife <= 0) {
        flashSphere.visible = false;
        flashLight.intensity = 0;
      }
    }
  }

  return { tracer, spark, explosion, step };
}
