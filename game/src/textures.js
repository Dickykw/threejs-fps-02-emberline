// EMBERLINE procedural textures — every surface gets its detail from canvas,
// never from an external image or the network. All textures are drawn once from
// a fixed seed, so a screenshot with a given seed is byte-stable run to run.
import * as THREE from 'three';
import { mulberry32 } from './palette.js';

function makeTex(size, draw, seed = 1337) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size, mulberry32(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, size, rng, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.12 + rng() * 0.25;
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function blotch(ctx, size, rng, n, color, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = aMin + rng() * (aMax - aMin);
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(rng() * size, rng() * size, r, r * (0.5 + rng() * 0.7), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Warm poured concrete: light base, fine speckle, soft dark blotches, hairline cracks.
function concrete() {
  return makeTex(256, (ctx, s, rng) => {
    ctx.fillStyle = '#a08b6d';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rng, 900, ['#8a755a', '#b59d7d', '#7a6547', '#c2ab8a'], 0.5, 2.2);
    blotch(ctx, s, rng, 14, '#6f5b40', 0.05, 0.12, 12, 42);
    // Hairline cracks.
    ctx.strokeStyle = '#5d4a33';
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      let x = rng() * s;
      let y = rng() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rng() - 0.5) * 44;
        y += (rng() - 0.5) * 44;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// Big floor slab texture: concrete + expansion-joint grid + oil stains + wear.
function floorGrid() {
  return makeTex(512, (ctx, s, rng) => {
    ctx.fillStyle = '#9a8468';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rng, 2600, ['#857052', '#ab9578', '#74604a', '#bfae8f'], 0.6, 2.6);
    blotch(ctx, s, rng, 22, '#5f4f38', 0.06, 0.16, 18, 70);
    blotch(ctx, s, rng, 10, '#3d332a', 0.1, 0.22, 8, 26); // oil stains
    // Expansion joints: one slab per 128px, dark recessed lines + lighter lip.
    for (let i = 0; i <= 4; i++) {
      const p = i * 128;
      ctx.fillStyle = '#4a3b2a';
      ctx.fillRect(p - 2, 0, 4, s);
      ctx.fillRect(0, p - 2, s, 4);
      ctx.fillStyle = '#b39a78';
      ctx.fillRect(p + 2, 0, 1, s);
      ctx.fillRect(0, p + 2, s, 1);
    }
    // Wear: lighter centre where feet and crates pass.
    const g = ctx.createRadialGradient(s / 2, s / 2, 20, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255, 240, 210, 0.10)');
    g.addColorStop(1, 'rgba(60, 45, 30, 0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// Brushed steel wall panels: seams, rivets, vertical brush streaks.
function metalPanel() {
  return makeTex(256, (ctx, s, rng) => {
    ctx.fillStyle = '#8d979e';
    ctx.fillRect(0, 0, s, s);
    // Vertical brush streaks.
    for (let i = 0; i < 130; i++) {
      ctx.fillStyle = rng() > 0.5 ? '#9aa4ab' : '#7e888f';
      ctx.globalAlpha = 0.12 + rng() * 0.15;
      ctx.fillRect(rng() * s, 0, 1 + rng() * 2, s);
    }
    ctx.globalAlpha = 1;
    // Panel seams every 64px.
    for (let i = 0; i <= 4; i++) {
      const p = i * 64;
      ctx.fillStyle = '#5c646b';
      ctx.fillRect(p - 1, 0, 2, s);
      ctx.fillRect(0, p - 1, s, 2);
      ctx.fillStyle = '#aab4bb';
      ctx.fillRect(p + 1, 0, 1, s);
      ctx.fillRect(0, p + 1, s, 1);
    }
    // Rivets at panel corners.
    ctx.fillStyle = '#6a7278';
    for (let x = 8; x < s; x += 64) {
      for (let y = 8; y < s; y += 64) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8d2d8';
        ctx.beginPath();
        ctx.arc(x - 1, y - 1, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6a7278';
      }
    }
    speckle(ctx, s, rng, 160, ['#6f787e', '#a7b1b8'], 0.5, 1.6);
  });
}

// Yellow / black diagonal hazard stripes, for furnace base and dock edges.
function hazard() {
  return makeTex(128, (ctx, s) => {
    ctx.fillStyle = '#e8b400';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#191919';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s, s);
    ctx.clip();
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 - s, s);
      ctx.lineTo(i - s, s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Grime over the paint.
    ctx.fillStyle = '#3a2e18';
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// Rusty steel: orange-brown base eaten by dark rust blotches and pitting.
function rust() {
  return makeTex(256, (ctx, s, rng) => {
    ctx.fillStyle = '#7d5232';
    ctx.fillRect(0, 0, s, s);
    blotch(ctx, s, rng, 30, '#4a2c14', 0.15, 0.4, 8, 40);
    blotch(ctx, s, rng, 24, '#a86a34', 0.15, 0.35, 6, 30);
    blotch(ctx, s, rng, 12, '#2e1a0c', 0.2, 0.45, 4, 16);
    speckle(ctx, s, rng, 700, ['#c07a3e', '#3a2210', '#96603a'], 0.5, 2);
    // Drips running down.
    ctx.fillStyle = '#4a2c14';
    for (let i = 0; i < 12; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const len = 12 + rng() * 40;
      ctx.globalAlpha = 0.25 + rng() * 0.3;
      ctx.fillRect(x, y, 2 + rng() * 2, len);
    }
    ctx.globalAlpha = 1;
  });
}

// Wooden crate: horizontal planks, grain, gaps, nails, edge frame.
function crateWood() {
  return makeTex(256, (ctx, s, rng) => {
    ctx.fillStyle = '#a8763e';
    ctx.fillRect(0, 0, s, s);
    const plankH = 42;
    for (let y = 0; y < s; y += plankH) {
      // Plank base tone varies.
      ctx.fillStyle = ['#a8763e', '#9c6a36', '#b08148'][Math.floor(rng() * 3)];
      ctx.fillRect(0, y, s, plankH);
      // Grain lines.
      ctx.strokeStyle = '#7a5230';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = y + 6 + rng() * (plankH - 12);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(s * 0.3, gy + (rng() - 0.5) * 6, s * 0.7, gy + (rng() - 0.5) * 6, s, gy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Gap between planks + top highlight.
      ctx.fillStyle = '#5d3c1e';
      ctx.fillRect(0, y + plankH - 2, s, 2);
      ctx.fillStyle = '#c08d55';
      ctx.fillRect(0, y, s, 1);
      // Nails.
      ctx.fillStyle = '#3d2c1a';
      for (const nx of [10, s - 10]) {
        ctx.beginPath();
        ctx.arc(nx, y + plankH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Edge frame.
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, s - 10, s - 10);
    speckle(ctx, s, rng, 120, ['#8a5a2c', '#c08d55'], 0.5, 1.8);
  });
}

// Corrugated shipping container in a painted colour: vertical ridges,
// rivets, scuffs and a stencilled stripe.
function containerTex(base, dark, light) {
  return makeTex(256, (ctx, s, rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    // Corrugation: alternating ridge / valley vertical bands.
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, 0, 5, s);
      ctx.fillStyle = dark;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + 10, 0, 5, s);
    }
    ctx.globalAlpha = 1;
    // Horizontal weld line.
    ctx.fillStyle = dark;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, s / 2 - 2, s, 4);
    ctx.globalAlpha = 1;
    // Scuffs and grime near the bottom.
    blotch(ctx, s, rng, 16, '#241a12', 0.1, 0.3, 6, 26);
    speckle(ctx, s, rng, 200, [dark, light], 0.5, 1.8);
    // Stencilled stripe.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 26, s, 10);
  });
}

export function makeTextures() {
  return {
    concrete: concrete(),
    floorGrid: floorGrid(),
    metalPanel: metalPanel(),
    hazard: hazard(),
    rust: rust(),
    crateWood: crateWood(),
    containerA: containerTex('#c46a1e', '#7a3f0e', '#e08a3a'),
    containerB: containerTex('#2e7a9b', '#17495e', '#4a9ab8'),
    containerC: containerTex('#a83a3a', '#661f1f', '#c65a5a'),
  };
}
