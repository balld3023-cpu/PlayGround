import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const deg = d => d * Math.PI / 180;
export const now = () => performance.now() / 1000;

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angleDelta(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function formatNum(n) {
  return Math.round(n).toLocaleString('en-US');
}

/* ---------------- Canvas textures ---------------- */
export function canvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  return tex;
}

export function noiseTexture(base, spec, size = 256, opts = {}) {
  return canvasTexture(size, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    const rng = mulberry32(opts.seed || 1337);
    const n = opts.dots || 900;
    for (let i = 0; i < n; i++) {
      const r = rng() * (opts.dotMax || 2.4) + 0.3;
      ctx.globalAlpha = 0.12 + rng() * 0.35;
      ctx.fillStyle = spec[Math.floor(rng() * spec.length)];
      ctx.beginPath(); ctx.arc(rng() * s, rng() * s, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (opts.streaks) {
      for (let i = 0; i < opts.streaks; i++) {
        ctx.globalAlpha = 0.06 + rng() * 0.12;
        ctx.strokeStyle = spec[i % spec.length];
        ctx.lineWidth = rng() * 2 + 0.4;
        const x = rng() * s;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rng() - 0.5) * 20, s); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }, opts);
}

export function panelTexture(base, line, size = 256, rows = 8) {
  return canvasTexture(size, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = line; ctx.lineWidth = 2;
    for (let i = 0; i <= rows; i++) {
      const y = i * s / rows;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = i * s / 4;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
    }
    ctx.globalAlpha = 0.15; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const y = Math.random() * s; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.5)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.5;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.5;
    const r = size * (0.12 + Math.random() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- Geometry helpers ---------------- */
export function mergeGeometries(geoms) {
  const valid = geoms.filter(Boolean);
  if (!valid.length) return null;
  let total = 0;
  const nonIndexed = valid.map(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of nonIndexed) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal?.array;
    const u = g.attributes.uv?.array;
    pos.set(p, o * 3);
    if (n) nor.set(n, o * 3);
    if (u) uv.set(u, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export function transformGeom(geom, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
  m.compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale));
  const g = geom.clone();
  g.applyMatrix4(m);
  return g;
}

export function boxGeom(w, h, d, pos = [0, 0, 0], rot = [0, 0, 0]) {
  return transformGeom(new THREE.BoxGeometry(w, h, d), pos, rot);
}
export function cylGeom(rt, rb, h, seg, pos = [0, 0, 0], rot = [0, 0, 0]) {
  return transformGeom(new THREE.CylinderGeometry(rt, rb, h, seg), pos, rot);
}

export function disposeObject(root) {
  if (!root) return;
  root.traverse(o => {
    if (o.geometry && !o.userData.sharedGeom) o.geometry.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m.userData?.shared) {
          m.map?.dispose?.();
          m.dispose?.();
        }
      }
    }
  });
}

/* ---------------- Ray / AABB ---------------- */
const _v = new THREE.Vector3();
export function rayAABB(origin, dir, box, maxDist = Infinity) {
  let tmin = 0, tmax = maxDist;
  const lo = box.min || { x: box.minX, y: box.minY, z: box.minZ };
  const hi = box.max || { x: box.maxX, y: box.maxY, z: box.maxZ };
  for (const axis of ['x', 'y', 'z']) {
    const inv = 1 / (dir[axis] || 1e-9);
    let t1 = (lo[axis] - origin[axis]) * inv;
    let t2 = (hi[axis] - origin[axis]) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return -1;
  }
  return tmin;
}

export function pointInBox2D(x, z, b) {
  return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
}

/* ---------------- DOM ---------------- */
export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/* ---------------- Weapon / map canvas thumbnails ---------------- */
export function drawWeaponIcon(canvas, weapon) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const c = weapon.color || '#d9a05a';
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = 'round';
  const x = w * 0.1, y = h * 0.52, s = w * 0.8;
  ctx.lineWidth = Math.max(2, h * 0.07);
  switch (weapon.model) {
    case 'ar':
      ctx.fillRect(x + s * 0.08, y - h * 0.08, s * 0.55, h * 0.14);
      ctx.fillRect(x + s * 0.6, y - h * 0.03, s * 0.27, h * 0.05);
      ctx.fillRect(x + s * 0.05, y + h * 0.02, s * 0.12, h * 0.2);
      ctx.fillRect(x + s * 0.18, y + h * 0.05, s * 0.11, h * 0.16);
      ctx.fillRect(x + s * 0.3, y - h * 0.16, s * 0.14, h * 0.07);
      break;
    case 'smg':
      ctx.fillRect(x + s * 0.15, y - h * 0.09, s * 0.48, h * 0.16);
      ctx.fillRect(x + s * 0.6, y - h * 0.04, s * 0.23, h * 0.06);
      ctx.fillRect(x + s * 0.2, y + h * 0.05, s * 0.1, h * 0.22);
      ctx.fillRect(x + s * 0.42, y + h * 0.06, s * 0.07, h * 0.18);
      ctx.fillRect(x + s * 0.05, y - h * 0.03, s * 0.14, h * 0.07);
      break;
    case 'shotgun':
      ctx.fillRect(x + s * 0.05, y - h * 0.07, s * 0.72, h * 0.1);
      ctx.fillRect(x + s * 0.62, y - h * 0.02, s * 0.18, h * 0.04);
      ctx.fillRect(x + s * 0.22, y + h * 0.02, s * 0.17, h * 0.08);
      ctx.fillRect(x + s * 0.42, y + h * 0.04, s * 0.09, h * 0.05);
      break;
    case 'sniper':
      ctx.fillRect(x + s * 0.05, y - h * 0.06, s * 0.8, h * 0.08);
      ctx.fillRect(x + s * 0.78, y - h * 0.03, s * 0.15, h * 0.035);
      ctx.fillRect(x + s * 0.28, y - h * 0.2, s * 0.22, h * 0.08);
      ctx.fillRect(x + s * 0.13, y + h * 0.02, s * 0.1, h * 0.22);
      ctx.fillRect(x + s * 0.42, y + h * 0.02, s * 0.06, h * 0.12);
      break;
    case 'lmg':
      ctx.fillRect(x + s * 0.08, y - h * 0.1, s * 0.58, h * 0.18);
      ctx.fillRect(x + s * 0.62, y - h * 0.04, s * 0.26, h * 0.06);
      ctx.beginPath(); ctx.arc(x + s * 0.3, y + h * 0.17, h * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x + s * 0.03, y - h * 0.04, s * 0.16, h * 0.09);
      break;
    case 'pistol':
      ctx.fillRect(x + s * 0.35, y - h * 0.13, s * 0.38, h * 0.16);
      ctx.fillRect(x + s * 0.68, y - h * 0.09, s * 0.12, h * 0.04);
      ctx.save(); ctx.translate(x + s * 0.42, y + h * 0.02); ctx.rotate(0.24);
      ctx.fillRect(0, 0, s * 0.16, h * 0.3); ctx.restore();
      break;
  }
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y - h * 0.23, s, h * 0.5);
}

export function drawMapPreview(canvas, map, selected) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const rng = mulberry32(map.id.length * 3331 + 17);
  ctx.fillStyle = map.minimapWater; ctx.fillRect(0, 0, w, h);
  // land mass
  ctx.save();
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.47;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const rr = R * (0.82 + 0.16 * Math.sin(a * 3 + 1.2) + 0.05 * Math.sin(a * 7));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.92;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = map.minimap; ctx.fill();
  ctx.clip();
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = i % 3 === 0 ? map.minimapSand : (i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)');
    const x = rng() * w, y = rng() * h, r = rng() * w * 0.08 + 3;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, rng() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    ctx.beginPath(); ctx.moveTo(i * w / 7, 0); ctx.lineTo(i * w / 7, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * h / 7); ctx.lineTo(w, i * h / 7); ctx.stroke();
  }
  // roads between pois
  ctx.strokeStyle = 'rgba(230,220,190,.3)'; ctx.lineWidth = Math.max(2, w * 0.008);
  const scale = Math.min(w, h) / 600;
  for (let i = 1; i < map.pois.length; i++) {
    const a = map.pois[i - 1], b = map.pois[i];
    ctx.beginPath(); ctx.moveTo(cx + a.x * scale, cy + a.z * scale);
    ctx.lineTo(cx + b.x * scale, cy + b.z * scale); ctx.stroke();
  }
  // poi dots
  for (const p of map.pois) {
    const x = cx + p.x * scale, y = cy + p.z * scale;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = selected ? '#ffd08a' : '#e7eef3'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
  }
  ctx.restore();
  // vignette
  const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // frame marks
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(6, 14); ctx.lineTo(6, 6); ctx.lineTo(14, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 6, h - 14); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 14, h - 6); ctx.stroke();
  if (selected) {
    ctx.strokeStyle = 'rgba(255,122,26,.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }
}
