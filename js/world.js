import * as THREE from 'three';
import { mulberry32, clamp, lerp, noiseTexture, panelTexture, smokeTexture, canvasTexture, mergeGeometries, transformGeom, deg, rayAABB } from './utils.js';

const SIZE = 600;
const HALF = SIZE / 2;
const SEA = 0.25;

/* =========================================================================
   Static batchers — every box/cylinder in a material group is one draw call
   ========================================================================= */
class BoxBatch {
  constructor(material, opts = {}) {
    this.material = material; this.items = []; this.opts = opts;
  }
  add(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    this.items.push({ w, h, d, x, y, z, color, rx, ry, rz });
  }
  build(parent, shadows = true) {
    if (!this.items.length) return null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, this.material, this.items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();
    this.items.forEach((it, i) => {
      e.set(it.rx, it.ry, it.rz); q.setFromEuler(e);
      v.set(it.x, it.y, it.z); s.set(it.w, it.h, it.d);
      m.compose(v, q, s); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(it.color || '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows && this.opts.shadow !== false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }
}
class CylBatch {
  constructor(material, opts = {}) { this.material = material; this.items = []; this.opts = opts; }
  add(r, h, x, y, z, color, rx = 0, rz = 0, ry = 0) { this.items.push({ r, h, x, y, z, color, rx, ry, rz }); }
  build(parent, shadows = true, seg = 10) {
    if (!this.items.length) return null;
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, seg);
    const mesh = new THREE.InstancedMesh(geo, this.material, this.items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();
    this.items.forEach((it, i) => {
      e.set(it.rx, it.ry, it.rz); q.setFromEuler(e);
      v.set(it.x, it.y, it.z); s.set(it.r * 2, it.h, it.r * 2);
      m.compose(v, q, s); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(it.color || '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows && this.opts.shadow !== false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }
}

function skyMaterial(map) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(map.skyTop) },
      horizon: { value: new THREE.Color(map.skyHorizon) },
      sunColor: { value: new THREE.Color(map.sunColor) },
      sunDir: { value: new THREE.Vector3(...map.sunDir).normalize() },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float uTime;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y*0.5+0.5, 0., 1.);
        vec3 col = mix(horizon, top, pow(smoothstep(0.46, 0.95, h), 0.8));
        float sun = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(sun, 90.0) * 0.9;
        col += sunColor * pow(sun, 8.0) * 0.16;
        float band = sin(d.y*28.0 + d.x*5.0 + uTime*0.015)*0.5+0.5;
        col += horizon * 0.035 * band * smoothstep(0.5,0.0,d.y);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}

export function buildWorld(scene, map, quality = 'medium') {
  const rng = mulberry32(map.id.split('').reduce((a, c) => a + c.charCodeAt(0), 77) * 97);
  const group = new THREE.Group(); group.name = 'world'; scene.add(group);
  const colliders = [];
  const lootSpots = [];
  const vehicleSpots = [];
  const spawnPoints = [];
  const poiCenters = [];
  const lowQ = quality === 'low';
  const propScale = quality === 'low' ? 0.55 : quality === 'medium' ? 0.8 : 1;

  /* ---------------- terrain height field ---------------- */
  const seed = map.id.length * 1.7 + map.id.charCodeAt(1);
  const baseHeight = (x, z) => {
    let h = 2.6 * Math.sin(x * 0.011 + seed) + 2.0 * Math.cos(z * 0.014 + seed * 2.2)
      + 1.5 * Math.sin((x + z) * 0.026 + seed) + 3.2 * Math.sin(x * 0.004 + seed) * Math.cos(z * 0.005 - seed);
    h += 0.55 * Math.sin(x * 0.09) * Math.cos(z * 0.08);
    return h * 0.72;
  };
  const shore = d => 1 - THREE.MathUtils.smoothstep(d, 236, 292);
  const poiHeights = map.pois.map(p => baseHeight(p.x, p.z) * shore(Math.hypot(p.x, p.z)) + 0.9);
  const heightAt = (x, z) => {
    let h = baseHeight(x, z);
    for (let i = 0; i < map.pois.length; i++) {
      const p = map.pois[i];
      const d = Math.hypot(x - p.x, z - p.z);
      const rr = p.r + 30;
      if (d < rr) {
        const t = THREE.MathUtils.smoothstep(d, p.r * 0.65, rr);
        h = lerp(poiHeights[i], h, t);
      }
    }
    const sh = shore(Math.hypot(x, z));
    h = h * sh - (1 - sh) * 8;
    return h;
  };
  const groundAt = (x, z) => Math.max(0.12, heightAt(x, z));

  const addCollider = (x, z, w, d, y0, h, ry = 0) => {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, minY: y0, maxY: y0 + h });
  };

  /* ---------------- materials ---------------- */
  const mkTex = (fn) => { const t = fn(); t.anisotropy = quality === 'high' ? 4 : 1; return t; };
  const concreteTex = mkTex(() => noiseTexture('#a9a9a4', ['#8f8f89', '#c0c0ba', '#7b7b76', '#b5b5ae'], 256, { dots: 1500, dotMax: 2.6, streaks: 20 }));
  const metalTex = mkTex(() => panelTexture('#a7adb2', 'rgba(60,66,70,.35)', 256, 6));
  const woodTex = mkTex(() => canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b59a74'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#a88a63' : '#c0a57f';
      ctx.fillRect(0, i * s / 10, s, s / 10 - 2);
      ctx.strokeStyle = 'rgba(80,55,30,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, i * s / 10); ctx.lineTo(s, i * s / 10); ctx.stroke();
    }
    for (let i = 0; i < 40; i++) { ctx.strokeStyle = 'rgba(90,62,35,.14)'; ctx.beginPath(); ctx.moveTo(0, Math.random() * s); ctx.lineTo(s, Math.random() * s); ctx.stroke(); }
  }));
  const stoneTex = mkTex(() => noiseTexture('#8f8b80', ['#6d6a61', '#aaa69a', '#7d7a70'], 256, { dots: 1800, dotMax: 4 }));
  const matte = (tex, rough = 0.85, metal = 0.06) => new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: rough, metalness: metal });
  const matConcrete = matte(concreteTex, 0.9, 0.03);
  const matMetal = matte(metalTex, 0.55, 0.5);
  const matWood = matte(woodTex, 0.85, 0.02);
  const matStone = matte(stoneTex, 0.95, 0.02);
  const matDark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.65, metalness: 0.4 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x16303f, roughness: 0.15, metalness: 0.6, emissive: 0x0d2430, emissiveIntensity: 0.8 });
  const matCloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });

  for (const m of [matConcrete, matMetal, matWood, matStone, matDark, matCloth]) m.vertexColors = false;

  const bat = {
    concrete: new BoxBatch(matConcrete),
    metal: new BoxBatch(matMetal),
    wood: new BoxBatch(matWood),
    stone: new BoxBatch(matStone),
    dark: new BoxBatch(matDark),
    glass: new BoxBatch(matGlass, { shadow: false }),
    cloth: new BoxBatch(matCloth),
    paint: new BoxBatch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.15 }), { shadow: false }),
    cyl: new CylBatch(matMetal),
    cylDark: new CylBatch(matDark),
    cylWood: new CylBatch(matWood),
    cylStone: new CylBatch(matStone)
  };

  const G = (x, z) => heightAt(x, z);
  const box = (cat, w, h, d, x, y, z, color, opts = {}) => {
    bat[cat].add(w, h, d, x, y, z, color, opts.ry || 0, opts.rx || 0, opts.rz || 0);
    if (opts.solid) addCollider(x, z, w, d, y - h / 2, h, opts.ry || 0);
  };
  const wall = (x, z, w, d, h, cat, color, opts = {}) => {
    const gy = opts.baseY != null ? opts.baseY : G(x, z);
    box(cat, w, h, d, x, gy + h / 2, z, color, { ...opts, solid: opts.solid !== false });
    return gy;
  };

  /* ---------------- ground ---------------- */
  const terraSeg = lowQ ? 80 : 128;
  const tGeo = new THREE.PlaneGeometry(SIZE + 40, SIZE + 40, terraSeg, terraSeg);
  tGeo.rotateX(-Math.PI / 2);
  const pos = tGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(map.groundA), cB = new THREE.Color(map.groundB), cC = new THREE.Color(map.groundC);
  const cSand = new THREE.Color(map.sand), cRock = new THREE.Color(map.rock);
  const tmpC = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const d = Math.hypot(x, z);
    const n = 0.5 + 0.5 * Math.sin(x * 0.09 + Math.cos(z * 0.07) * 3) * Math.cos(z * 0.05);
    tmpC.copy(cA).lerp(cB, clamp(n + (h < 1.2 ? 0.2 : 0), 0, 1));
    if (h < 1.7) tmpC.lerp(cSand, clamp((1.7 - h) / 2.4, 0, 0.85));
    if (h > 4.2) tmpC.lerp(cC, clamp((h - 4.2) / 4, 0, 0.65));
    const sl = Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3));
    if (sl > 2.4) tmpC.lerp(cRock, clamp((sl - 2.4) / 3, 0, 0.5));
    if (map.id === 'frost') tmpC.lerp(new THREE.Color('#f2f7fa'), clamp((h - 1.4) / 5, 0, 0.35));
    const v = 0.94 + n * 0.1;
    colors[i * 3] = tmpC.r * v; colors[i * 3 + 1] = tmpC.g * v; colors[i * 3 + 2] = tmpC.b * v;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tGeo.computeVertexNormals();
  const groundTex = mkTex(() => noiseTexture('#d8d8d4', ['#ffffff', '#b8b8b2', '#94948e', '#e2e2dd'], 256, { dots: 1800, dotMax: 1.9, streaks: 30 }));
  groundTex.repeat.set(32, 32);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, roughness: 0.96, metalness: 0.02 });
  const terrain = new THREE.Mesh(tGeo, groundMat);
  terrain.receiveShadow = true; terrain.castShadow = false;
  terrain.userData.terrain = true;
  group.add(terrain);

  /* ---------------- water ---------------- */
  const wTex = mkTex(() => canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7f9fa6'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * s, x = Math.random() * s, w = 20 + Math.random() * 80;
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y + 4, x + w, y); ctx.stroke();
    }
  }));
  wTex.repeat.set(26, 26);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1900, 1900), new THREE.MeshStandardMaterial({
    map: wTex, color: new THREE.Color(map.water), roughness: 0.17, metalness: 0.55, transparent: true, opacity: 0.93
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = SEA;
  water.receiveShadow = false;
  group.add(water);

  /* ---------------- sky & lighting ---------------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMaterial(map));
  sky.frustumCulled = false;
  group.add(sky);
  scene.fog = new THREE.Fog(map.fogColor, map.fogNear, map.fogFar);
  scene.background = new THREE.Color(map.fogColor);

  const sun = new THREE.DirectionalLight(map.sunColor, map.sunIntensity);
  const sunDir = new THREE.Vector3(...map.sunDir).normalize();
  sun.position.copy(sunDir).multiplyScalar(180);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
  const sc = quality === 'low' ? 80 : 110;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.bias = -0.0009;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(map.skyHorizon, map.groundB, 0.65);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(0x8fb7c8, 0.35);
  fill.position.set(-sunDir.x * 90, 60, -sunDir.z * 90);
  group.add(fill);

  /* ---------------- POI ground pads ---------------- */
  const padVerts = [], padIndices = [];
  for (const p of map.pois) {
    const rad = p.r * 0.78;
    const segs = 28;
    const start = padVerts.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI * 2;
      const x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
      padVerts.push(x, heightAt(x, z) + 0.05, z);
    }
    padVerts.push(p.x, heightAt(p.x, p.z) + 0.06, p.z);
    const center = start + segs + 1;
    for (let i = 0; i < segs; i++) padIndices.push(center, start + i, start + i + 1);
  }
  const padGeo = new THREE.BufferGeometry();
  padGeo.setAttribute('position', new THREE.Float32BufferAttribute(padVerts, 3));
  padGeo.setIndex(padIndices);
  padGeo.computeVertexNormals();
  const padMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(map.road), roughness: 1, metalness: 0, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const pads = new THREE.Mesh(padGeo, padMat); pads.receiveShadow = true; group.add(pads);

  /* ---------------- roads between POIs ---------------- */
  const roadVerts = [], roadIdx = [], roadUvs = [];
  const roadPairs = [];
  for (let i = 1; i < map.pois.length; i++) roadPairs.push([map.pois[i - 1], map.pois[i]]);
  roadPairs.push([map.pois[0], map.pois[3] || map.pois[1]]);
  let vi = 0;
  for (const [a, b] of roadPairs) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(3, Math.floor(dist / 12));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const p0 = { x: lerp(a.x, b.x, t0), z: lerp(a.z, b.z, t0) };
      const p1 = { x: lerp(a.x, b.x, t1), z: lerp(a.z, b.z, t1) };
      const ang = Math.atan2(p1.z - p0.z, p1.x - p0.x);
      const nx = Math.cos(ang + Math.PI / 2) * 3.6, nz = Math.sin(ang + Math.PI / 2) * 3.6;
      const pts = [[p0.x - nx, p0.z - nz], [p0.x + nx, p0.z + nz], [p1.x - nx, p1.z - nz], [p1.x + nx, p1.z + nz]];
      for (const [x, z] of pts) roadVerts.push(x, heightAt(x, z) + 0.04, z);
      roadUvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      roadIdx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
      vi += 4;
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIdx); roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(map.road), roughness: 0.98, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  road.receiveShadow = true;
  group.add(road);

  /* ---------------- prop & building helpers ---------------- */
  const addLoot = (x, z, kind = 'random', yOffset = 0) => {
    lootSpots.push({ x, z, y: heightAt(x, z) + 0.05 + yOffset, kind });
  };
  const addVehicleSpot = (x, z, yaw = 0) => {
    if (Math.hypot(x, z) > 250) return;
    vehicleSpots.push({ x, z, y: heightAt(x, z), yaw });
  };
  const addSpawn = (x, z) => { if (Math.hypot(x, z) < 270) spawnPoints.push({ x, z, y: heightAt(x, z) }); };

  const crate = (x, z, size = 1.2, color = '#8a6b43', baseY = null) => {
    const gy = baseY != null ? baseY : G(x, z);
    box('wood', size, size, size, x, gy + size / 2, z, color, { solid: true });
    box('dark', size * 1.02, 0.06, size * 0.2, x, gy + size - 0.03, z, '#4a3b2a');
    addLoot(x + size * 0.8, z, 'random', 0);
  };
  const barrel = (x, z, color = '#b55335', baseY = null) => {
    const gy = baseY != null ? baseY : G(x, z);
    bat.cylDark.add(0.35, 0.95, x, gy + 0.475, z, color, 0, 0, 0);
    addCollider(x, z, 0.7, 0.7, gy, 0.95);
  };
  const sandbag = (x, z, y, ry = 0, color = '#b6a578') => {
    box('cloth', 0.9, 0.32, 0.55, x, y + 0.16, z, color, { ry, solid: true });
  };
  const container = (x, z, color = '#4f6b78', ry = 0, stack = 0) => {
    const gy = baseYAt(x, z);
    const w = 6.2, h = 2.55, d = 2.5;
    for (let s = 0; s <= stack; s++) {
      const y = gy + 0.08 + s * (h + 0.02) + h / 2;
      box('metal', w, h, d, x, y, z, color, { ry, solid: true });
      for (let i = -1; i <= 1; i++) {
        box('dark', w * 0.9, 0.05, 0.03, x + Math.sin(ry) * (d / 2 + 0.01) + Math.cos(ry) * i * 2, y + 0.6, z + Math.cos(ry) * (d / 2 + 0.01) - Math.sin(ry) * i * 2, '#20262b', { ry });
      }
      box('paint', w * 0.35, 0.16, 0.02, x + Math.sin(ry) * (d / 2 + 0.02), y + 0.3, z + Math.cos(ry) * (d / 2 + 0.02), '#e0e6ea', { ry });
    }
  };
  const baseYAt = (x, z) => Math.max(0.15, heightAt(x, z));

  const addWindow = (x, y, z, w, h, ry = 0) => {
    box('glass', w, h, 0.08, x, y, z, '#8fd7ff', { ry });
    box('dark', w + 0.18, 0.07, 0.12, x, y + h / 2 + 0.04, z, '#252a2e', { ry });
    box('dark', w + 0.18, 0.07, 0.12, x, y - h / 2 - 0.04, z, '#252a2e', { ry });
  };

  function house(cx, cz, w = 9, d = 7, h = 3.2, ry = 0, color = '#c8c3b4', roofColor = '#7b4a36', door = 1.8) {
    const gy = G(cx, cz);
    const hw = w / 2, hd = d / 2;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const L = (lx, lz) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos];
    const wallA = '#cfc9b8';
    box('concrete', w + 0.6, 0.35, d + 0.6, cx, gy + 0.17, cz, '#8d897d', { ry, solid: true });
    // front & back walls (door gap in front at -z)
    const side = (w - door) / 2;
    for (const s of [-1, 1]) {
      const [x1, z1] = L(s * (door / 2 + side / 2), -hd);
      wall(x1, z1, side, 0.28, h, 'concrete', wallA, { baseY: gy + 0.3, ry });
      const [x2, z2] = L(0, -hd);
      box('concrete', door, 0.55, 0.28, x2, gy + 0.3 + h - 0.27, z2, wallA, { ry, solid: true });
    }
    const [bx, bz] = L(0, hd);
    wall(bx, bz, w, 0.28, h, 'concrete', wallA, { baseY: gy + 0.3, ry });
    for (const s of [-1, 1]) {
      const [sx, sz] = L(s * hw, 0);
      wall(sx, sz, 0.28, d, h, 'concrete', wallA, { baseY: gy + 0.3, ry });
      const [wx, wz] = L(s * (hw + 0.05), 0.8);
      addWindow(wx, gy + 2.0, wz, 1.5, 0.9, ry);
    }
    // roof
    for (const s of [-1, 1]) {
      const [rx, rz] = L(0, s * d * 0.255);
      box('wood', w + 1.3, 0.18, d * 0.58, rx, gy + h + 0.75, rz, roofColor, { ry, rx: s * 0.38 });
    }
    box('dark', w + 1.4, 0.12, 0.22, cx, gy + h + 1.47, cz, '#3a2b22', { ry });
    // interior floor + loot
    box('wood', w - 0.9, 0.08, d - 0.9, cx, gy + 0.34, cz, '#977c58', { ry });
    addLoot(cx - w * 0.2, cz + d * 0.12, 'weapon');
    addLoot(cx + w * 0.22, cz - d * 0.15, 'random');
    addWindow(cx, gy + 2.0, cz + hd + 0.02, 1.4, 0.9, ry);
    // exterior crates
    if (rng() > 0.4) crate(cx + (rng() - 0.5) * w * 1.6, cz + (rng() > 0.5 ? hd + 2 : -hd - 2), 1.05);
  }

  function warehouse(cx, cz, w = 22, d = 14, h = 5.6, color = '#7b8388', ry = 0) {
    const gy = G(cx, cz);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const L = (lx, lz) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos];
    box('concrete', w + 1, 0.4, d + 1, cx, gy + 0.2, cz, '#8b877b', { ry, solid: true });
    const door = 4.6;
    const side = (w - door) / 2;
    for (const s of [-1, 1]) {
      const [x, z] = L(s * (door / 2 + side / 2), -d / 2);
      wall(x, z, side, 0.32, h, 'metal', color, { baseY: gy + 0.4, ry });
      const [lx, lz] = L(0, -d / 2);
      box('metal', door, 1.1, 0.32, lx, gy + 0.4 + h - 0.55, lz, color, { ry, solid: true });
    }
    const [bx, bz] = L(0, d / 2);
    wall(bx, bz, w, 0.32, h, 'metal', color, { baseY: gy + 0.4, ry });
    for (const s of [-1, 1]) {
      const [sx, sz] = L(s * w / 2, 0);
      wall(sx, sz, 0.32, d, h, 'metal', color, { baseY: gy + 0.4, ry });
      const [wx, wz] = L(s * (w / 2 + 0.02), 0);
      for (let i = -1; i <= 1; i++) {
        const [x, z] = L(s * (w / 2 + 0.02), i * 3.4);
        addWindow(x, gy + 3.8, z, 1.6, 1.0, ry);
      }
    }
    // roof
    for (let i = 0; i < Math.ceil(w / 5); i++) {
      const lx = -w / 2 + 2.6 + i * 5;
      const [x, z] = L(lx, 0);
      box('metal', 5.2, 0.22, d + 1.4, x, gy + h + 0.6, z, '#596166', { ry });
      box('dark', 0.25, 0.6, 0.25, x, gy + h + 0.3, z, '#2f353a', { ry });
    }
    box('dark', w, 0.35, 0.28, cx, gy + h + 0.15, cz - d / 2, '#3a4045', { ry });
    // interior
    box('concrete', w - 1.5, 0.1, d - 1.5, cx, gy + 0.45, cz, '#96938a', { ry });
    const [ix, iz] = L(-w * 0.2, 0.6);
    crate(ix, iz, 1.5, '#806444', gy + 0.5);
    const [ix2, iz2] = L(w * 0.24, -d * 0.2);
    barrel(ix2, iz2, '#a35438', gy + 0.5);
    addLoot(...L(-w * 0.05, -d * 0.18), 'weapon');
    addLoot(...L(w * 0.15, d * 0.2), 'random');
    addLoot(...L(-w * 0.3, d * 0.3), 'random');
    // containers behind
    if (rng() > 0.3) container(cx + (rng() - 0.5) * (w + 10), cz + d / 2 + 3.6, rng() > 0.5 ? '#7a4a3a' : '#3f5c6b', 0, rng() > 0.7 ? 1 : 0);
    addVehicleSpot(...L(-w / 2 - 5, -d / 2 - 3), ry + 0.4);
  }

  function bunker(cx, cz, w = 13, d = 10, h = 2.9, color = '#8b8c80') {
    const gy = G(cx, cz);
    box('concrete', w + 1.2, 0.5, d + 1.2, cx, gy + 0.25, cz, '#77776d', { solid: true });
    wall(cx, cz - d / 2, w, 0.45, h, 'concrete', color, { baseY: gy + 0.5 });
    wall(cx, cz + d / 2, w, 0.45, h, 'concrete', color, { baseY: gy + 0.5 });
    wall(cx - w / 2, cz, 0.45, d, h, 'concrete', color, { baseY: gy + 0.5 });
    wall(cx + w / 2, cz, 0.45, d, h, 'concrete', color, { baseY: gy + 0.5 });
    box('concrete', w + 1.6, 0.4, d + 1.6, cx, gy + h + 0.6, cz, '#6d6d63');
    box('concrete', w + 1.7, 0.25, 0.7, cx, gy + h + 0.95, cz - d / 2, '#5e5e55');
    for (let i = -1; i <= 1; i++) addWindow(cx + i * 3.2, gy + 1.9, cz - d / 2 - 0.24, 1.2, 0.45);
    addLoot(cx, cz + 1.4, 'weapon');
    addLoot(cx - 2.6, cz - 1.2, 'random');
    // sandbags
    for (let i = 0; i < 5; i++) sandbag(cx - w / 2 - 2.6, cz - 2 + i * 1.2, gy, 0);
    for (let i = 0; i < 4; i++) sandbag(cx + 2 + i * 1.1, cz - d / 2 - 2, gy, Math.PI / 2);
  }

  function watchtower(cx, cz, h = 7, color = '#6c6a5c') {
    const gy = G(cx, cz);
    for (const [sx, sz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      bat.cylDark.add(0.14, h, cx + sx, gy + h / 2, cz + sz, color, 0, 0, 0);
      addCollider(cx + sx, cz + sz, 0.4, 0.4, gy, h);
    }
    box('wood', 5, 0.3, 5, cx, gy + h, cz, '#8b7656', { solid: true });
    box('wood', 0.2, 1.0, 5, cx - 2.4, gy + h + 0.65, cz, '#7a6749');
    box('wood', 0.2, 1.0, 5, cx + 2.4, gy + h + 0.65, cz, '#7a6749');
    box('wood', 5, 1.0, 0.2, cx, gy + h + 0.65, cz - 2.4, '#7a6749');
    box('metal', 5.8, 0.16, 5.8, cx, gy + h + 1.5, cz, '#4b5052');
    box('metal', 0.18, 1.4, 0.18, cx - 2.4, gy + h + 0.8, cz - 2.4, '#3e4345');
    box('metal', 0.18, 1.4, 0.18, cx + 2.4, gy + h + 0.8, cz + 2.4, '#3e4345');
    addLoot(cx, cz, 'weapon', h);
    addLoot(cx + 0.8, cz + 0.6, 'ammo', h);
  }

  function tents(cx, cz, count = 3) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, ra = 4 + rng() * 8;
      const x = cx + Math.cos(a) * ra, z = cz + Math.sin(a) * ra;
      const gy = G(x, z);
      bat.cylStone.add(1.9, 1.5, x, gy + 0.75, z, i % 2 ? '#b99a63' : '#7d8a55', 0, 0, 0);
      addCollider(x, z, 2.6, 2.6, gy, 1.5);
      addLoot(x + 1.2, z, 'random');
    }
  }

  function fences(cx, cz, rad, color = '#9c825d') {
    const segs = Math.floor(rad * 1.2);
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2;
      if (i % 5 === 0) continue;
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      const gy = G(x, z);
      box('wood', 2.8, 0.13, 0.11, x, gy + 0.9, z, color, { ry: -a, solid: true });
      box('wood', 2.8, 0.13, 0.11, x, gy + 0.5, z, color, { ry: -a });
    }
  }

  const treePositions = [];
  function addPalmAt(x, z, scale = 1) { treePositions.push({ x, z, scale, pine: false }); }
  function addPineAt(x, z, scale = 1) { treePositions.push({ x, z, scale, pine: true }); }

  /* ---------------- POI builders ---------------- */
  for (const p of map.pois) {
    poiCenters.push({ ...p, y: heightAt(p.x, p.z) });
    switch (p.type) {
      case 'town': {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.5;
          const rad = p.r * (0.42 + (i % 2) * 0.08);
          const hx = p.x + Math.cos(a) * rad, hz = p.z + Math.sin(a) * rad;
          const rot = i % 2 ? Math.PI / 2 : 0;
          const palette = rng() > 0.6 ? ['#b7ada0', '#6d4a3c'] : rng() > 0.4 ? ['#c7beac', '#7a5745'] : ['#a6a89e', '#4f5c5c'];
          house(hx, hz, 8.5 + (i % 2) * 1.4, 7 + (i % 3), 3.1, rot, palette[0], palette[1]);
        }
        crate(p.x + 4, p.z + 5, 1.2, '#8b6b45');
        crate(p.x - 3, p.z + 6, 1.0, '#755b3d');
        addLoot(p.x + 1.5, p.z - 2, 'weapon');
        addLoot(p.x - 1.5, p.z + 2, 'random');
        addVehicleSpot(p.x - p.r * 0.7, p.z + 2, 1.4);
        addSpawn(p.x + 6, p.z + 8);
        for (let i = 0; i < 8; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.7, p.z + (rng() - 0.5) * p.r * 1.7);
        break;
      }
      case 'industrial': {
        warehouse(p.x, p.z, 21, 13, 5.4, rng() > 0.5 ? '#788087' : '#6c756f');
        for (let i = 0; i < 3; i++) {
          const a = rng() * Math.PI * 2;
          container(p.x + Math.cos(a) * (p.r * 0.7), p.z + Math.sin(a) * (p.r * 0.7), ['#7a4a3a', '#3f5c6b', '#5c6b4b'][i], a > 2 ? Math.PI / 2 : 0, i % 3 === 0 ? 1 : 0);
        }
        for (let i = 0; i < 5; i++) barrel(p.x + (rng() - 0.5) * p.r, p.z + (rng() - 0.5) * p.r, rng() > 0.5 ? '#a35438' : '#3f5a68');
        bat.cylDark.add(0.5, 9, p.x - p.r * 0.55, G(p.x - p.r * 0.55, p.z) + 4.5, p.z - p.r * 0.4, '#6d7377');
        addVehicleSpot(p.x + p.r * 0.55, p.z + p.r * 0.3, 0.4);
        addSpawn(p.x, p.z + p.r * 0.8);
        for (let i = 0; i < 7; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.8, p.z + (rng() - 0.5) * p.r * 1.8);
        break;
      }
      case 'military': {
        bunker(p.x, p.z, 12, 9, 2.9, '#7e8175');
        watchtower(p.x + p.r * 0.55, p.z - p.r * 0.42, 6.4);
        for (let i = 0; i < 7; i++) {
          const a = rng() * Math.PI * 2, ra = 8 + rng() * p.r * 0.6;
          sandbag(p.x + Math.cos(a) * ra, p.z + Math.sin(a) * ra, G(p.x + Math.cos(a) * ra, p.z + Math.sin(a) * ra), a);
        }
        for (let i = 0; i < 3; i++) crate(p.x - 7 + i * 2.4, p.z + 5.5, 1.15, '#5f6b4a');
        addVehicleSpot(p.x + 8, p.z + 6, 0.9);
        for (let i = 0; i < 7; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.7, p.z + (rng() - 0.5) * p.r * 1.7);
        break;
      }
      case 'ruins': {
        const gy = G(p.x, p.z);
        box('stone', 14, 0.4, 12, p.x, gy + 0.2, p.z, '#9d9687', { solid: true });
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          const x = p.x + Math.cos(a) * 5.4, z = p.z + Math.sin(a) * 5.4;
          const hh = 2.4 + rng() * 3.5;
          wall(x, z, 4.2, 0.55, hh, 'stone', i % 2 ? '#a39a87' : '#8f8776', { baseY: gy, ry: a });
        }
        for (let i = 0; i < 6; i++) {
          const a = rng() * Math.PI * 2, ra = 8 + rng() * p.r * 0.6;
          const x = p.x + Math.cos(a) * ra, z = p.z + Math.sin(a) * ra;
          const hh = 2.5 + rng() * 3;
          bat.cylStone.add(0.5, hh, x, G(x, z) + hh / 2, z, '#aaa08c');
          addCollider(x, z, 1, 1, G(x, z), hh);
        }
        crate(p.x + 2, p.z + 2, 1.2, '#7d6646');
        addLoot(p.x - 2, p.z, 'weapon');
        addLoot(p.x + 2.5, p.z - 1, 'random');
        addSpawn(p.x + 7, p.z - 5);
        for (let i = 0; i < 8; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 2, p.z + (rng() - 0.5) * p.r * 2);
        break;
      }
      case 'docks': {
        warehouse(p.x, p.z, 18, 12, 4.8, '#6f777a');
        container(p.x + p.r * 0.7, p.z - 4, '#3f5c6b', 0, 1);
        container(p.x + p.r * 0.7, p.z + 4, '#7a4a3a', 0, 0);
        for (let i = 0; i < 4; i++) crate(p.x - p.r * 0.7, p.z - 6 + i * 3.2, 1.3, '#886a47');
        addVehicleSpot(p.x + 4, p.z + p.r * 0.6, 0.2);
        addSpawn(p.x + 8, p.z + 4);
        for (let i = 0; i < 6; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.9, p.z + (rng() - 0.5) * p.r * 1.9);
        break;
      }
      case 'farm': {
        const gy = G(p.x, p.z);
        house(p.x, p.z, 14, 18, 5, 0, '#9e4b38', '#4a2b24', 3.2);
        const sx = p.x + 10, sz = p.z - 7;
        bat.cylDark.add(2.1, 8, sx, G(sx, sz) + 4, sz, '#a5a59a');
        bat.cylDark.add(2.3, 0.6, sx, G(sx, sz) + 8.3, sz, '#7b7b71');
        addCollider(sx, sz, 4.2, 4.2, G(sx, sz), 8.3);
        for (let i = 0; i < 6; i++) {
          const a = rng() * Math.PI;
          const x = p.x - 8 + Math.cos(a) * 6, z = p.z + 10 + Math.sin(a) * 6;
          bat.cylWood.add(0.7, 1.2, x, G(x, z) + 0.7, z, '#c9ab63', Math.PI / 2, 0, 0);
        }
        fences(p.x, p.z, p.r * 0.9, '#9c825d');
        addLoot(p.x - 2, p.z + 3, 'weapon');
        addVehicleSpot(p.x + 8, p.z + 7, 1.1);
        for (let i = 0; i < 7; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.8, p.z + (rng() - 0.5) * p.r * 1.8);
        break;
      }
      case 'oasis': {
        const gy = G(p.x, p.z);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.45, 24), new THREE.MeshStandardMaterial({ color: 0x2c8b9e, roughness: 0.15, metalness: 0.55, transparent: true, opacity: 0.9 }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, gy + 0.08, p.z); group.add(pool);
        tents(p.x - p.r * 0.55, p.z + p.r * 0.3, 3);
        for (let i = 0; i < 5; i++) {
          const a = rng() * Math.PI * 2, ra = p.r * 0.7;
          addPalmAt(p.x + Math.cos(a) * ra, p.z + Math.sin(a) * ra, 1.1);
        }
        addLoot(p.x + 2, p.z + 2, 'weapon');
        addVehicleSpot(p.x + p.r * 0.7, p.z - p.r * 0.3, 2);
        for (let i = 0; i < 7; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.7, p.z + (rng() - 0.5) * p.r * 1.7);
        break;
      }
      case 'lake': {
        const gy = G(p.x, p.z);
        const ice = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.78, 30), new THREE.MeshStandardMaterial({ color: 0xa8d6e2, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.85 }));
        ice.rotation.x = -Math.PI / 2; ice.position.set(p.x, gy + 0.07, p.z); group.add(ice);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          house(p.x + Math.cos(a) * p.r * 0.8, p.z + Math.sin(a) * p.r * 0.8, 7.5, 6.5, 2.9, a, '#7a5d47', '#6e3d2f');
        }
        addLoot(p.x, p.z, 'weapon');
        addVehicleSpot(p.x + 10, p.z + 4, 0.6);
        for (let i = 0; i < 7; i++) addSpawn(p.x + (rng() - 0.5) * p.r * 1.8, p.z + (rng() - 0.5) * p.r * 1.8);
        break;
      }
    }
    // central loot table for every POI
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, ra = p.r * (0.15 + rng() * 0.45);
      addLoot(p.x + Math.cos(a) * ra, p.z + Math.sin(a) * ra, rng() > 0.72 ? 'weapon' : rng() > 0.5 ? 'ammo' : rng() > 0.45 ? 'med' : 'shield');
    }
  }

  /* ---------------- road-side vehicle spots & spawns ---------------- */
  for (let i = 0; i < map.pois.length; i++) {
    const p = map.pois[i], q = map.pois[(i + 1) % map.pois.length];
    const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
    addVehicleSpot(mx + (rng() - 0.5) * 10, mz + (rng() - 0.5) * 10, rng() * 3);
    for (let k = 0; k < 3; k++) addSpawn(p.x + (rng() - 0.5) * 60, p.z + (rng() - 0.5) * 60);
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 230;
    addSpawn(Math.cos(a) * r, Math.sin(a) * r);
  }

  /* ---------------- foliage ---------------- */
  function makePalmGeometry() {
    const parts = [];
    parts.push(transformGeom(new THREE.CylinderGeometry(0.16, 0.28, 5.5, 7), [0, 2.7, 0]));
    parts.push(transformGeom(new THREE.CylinderGeometry(0.12, 0.17, 3, 6), [0.18, 5.4, 0], [0, 0, -0.12]));
    return mergeGeometries(parts);
  }
  function makeFrondsGeometry() {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      const len = 2.8 + (i % 3) * 0.3;
      const frond = new THREE.BoxGeometry(0.3, 0.06, len);
      const g = transformGeom(frond, [Math.sin(a) * len * 0.42, 6.4 - (i % 2) * 0.2, Math.cos(a) * len * 0.42], [0.28 * (i % 2 ? 1 : -1) + 0.15, a, 0]);
      parts.push(g);
    }
    return mergeGeometries(parts);
  }
  function makePineGeometry() {
    const parts = [transformGeom(new THREE.CylinderGeometry(0.14, 0.26, 4, 7), [0, 2, 0])];
    parts.push(transformGeom(new THREE.ConeGeometry(2.2, 4, 8), [0, 4.3, 0]));
    parts.push(transformGeom(new THREE.ConeGeometry(1.7, 3.4, 8), [0, 6, 0]));
    parts.push(transformGeom(new THREE.ConeGeometry(1.15, 2.6, 8), [0, 7.6, 0]));
    return mergeGeometries(parts);
  }

  const palmTrunkGeo = makePalmGeometry();
  const palmCrownGeo = makeFrondsGeometry();
  const pineGeo = makePineGeometry();

  // extra palms for oasis are added during POI build; place the rest
  const treeCount = Math.floor((map.tree === 'pine' ? 170 : 145) * propScale);
  for (let i = 0; i < treeCount; i++) {
    const a = rng() * Math.PI * 2, r = 30 + Math.sqrt(rng()) * 230;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.9) continue;
    if (map.pois.some(p => Math.hypot(x - p.x, z - p.z) < p.r * 0.7)) continue;
    const pine = map.tree === 'pine';
    (pine ? addPineAt : addPalmAt)(x, z, 0.75 + rng() * 0.7);
  }
  // cluster trees near POIs edges
  for (const p of map.pois) {
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, r = p.r * (0.9 + rng() * 0.5);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (heightAt(x, z) < 0.8) continue;
      (map.tree === 'pine' ? addPineAt : addPalmAt)(x, z, 0.85 + rng() * 0.5);
    }
  }
  const palmTrunks = treePositions.filter(t => !t.pine);
  const pines = treePositions.filter(t => t.pine);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  if (palmTrunks.length) {
    const trunkMesh = new THREE.InstancedMesh(palmTrunkGeo, treeMat, palmTrunks.length);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const crownMesh = new THREE.InstancedMesh(palmCrownGeo, crownMat, palmTrunks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    palmTrunks.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.1));
      const gy = heightAt(t.x, t.z);
      m.compose(new THREE.Vector3(t.x, gy, t.z), q, new THREE.Vector3(t.scale, t.scale, t.scale));
      trunkMesh.setMatrixAt(i, m); crownMesh.setMatrixAt(i, m);
      trunkMesh.setColorAt(i, col.set('#8a7355'));
      crownMesh.setColorAt(i, col.set(rng() > 0.5 ? map.treeColor : map.treeColor2));
    });
    trunkMesh.castShadow = true; crownMesh.castShadow = true;
    trunkMesh.receiveShadow = crownMesh.receiveShadow = true;
    group.add(trunkMesh, crownMesh);
  }
  if (pines.length) {
    const pineMesh = new THREE.InstancedMesh(pineGeo, treeMat, pines.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    pines.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.06));
      const gy = heightAt(t.x, t.z);
      m.compose(new THREE.Vector3(t.x, gy, t.z), q, new THREE.Vector3(t.scale, t.scale, t.scale));
      pineMesh.setMatrixAt(i, m);
      pineMesh.setColorAt(i, col.set(rng() > 0.5 ? map.treeColor : map.treeColor2));
    });
    pineMesh.castShadow = true; pineMesh.receiveShadow = true;
    group.add(pineMesh);
  }

  // bushes
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const bushes = [];
  for (let i = 0; i < 90 * propScale; i++) {
    const a = rng() * Math.PI * 2, r = 20 + Math.sqrt(rng()) * 245;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.7) continue;
    bushes.push({ x, z, s: 0.5 + rng() * 1.1 });
  }
  if (bushes.length) {
    const bm = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    bushes.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(0, rng() * 6, 0));
      m.compose(new THREE.Vector3(b.x, heightAt(b.x, b.z) + 0.3 * b.s, b.z), q, new THREE.Vector3(b.s, b.s * 0.8, b.s));
      bm.setMatrixAt(i, m);
      bm.setColorAt(i, col.set(map.id === 'frost' ? '#6d8579' : map.id === 'dune' ? '#8d8a4e' : '#4e6f3d'));
    });
    bm.castShadow = true; bm.receiveShadow = true; group.add(bm);
  }

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const rocks = [];
  for (let i = 0; i < 46 * propScale; i++) {
    const a = rng() * Math.PI * 2, r = 40 + Math.sqrt(rng()) * 220;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.4) continue;
    const s = 0.8 + rng() * 2.4;
    rocks.push({ x, z, s, y: heightAt(x, z) });
    if (s > 2.1) addCollider(x, z, s * 1.4, s * 1.4, heightAt(x, z), s * 1.2);
  }
  if (rocks.length) {
    const rm = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    rocks.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
      m.compose(new THREE.Vector3(r.x, r.y + r.s * 0.25, r.z), q, new THREE.Vector3(r.s, r.s * 0.7, r.s));
      rm.setMatrixAt(i, m);
      rm.setColorAt(i, col.set(map.id === 'frost' ? '#b6c1c7' : map.id === 'dune' ? '#a9895f' : map.rock));
    });
    rm.castShadow = true; rm.receiveShadow = true; group.add(rm);
  }

  // grass
  if (map.id !== 'dune' && quality !== 'low') {
    const grassTex = canvasTexture(64, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      for (let i = 0; i < 18; i++) {
        const x = 6 + Math.random() * (s - 12);
        ctx.strokeStyle = `rgba(${map.id === 'frost' ? '220,235,240' : '138,175,100'},${0.5 + Math.random() * 0.5})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath(); ctx.moveTo(x, s); ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 12, s * 0.5, x + (Math.random() - 0.5) * 18, Math.random() * s * 0.4); ctx.stroke();
      }
    });
    grassTex.colorSpace = THREE.SRGBColorSpace;
    const grassMat = new THREE.MeshBasicMaterial({ map: grassTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
    const gGeo = new THREE.PlaneGeometry(1.3, 0.9);
    const count = quality === 'high' ? 1100 : 500;
    const gm = new THREE.InstancedMesh(gGeo, grassMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const a = rng() * Math.PI * 2, r = 15 + Math.sqrt(rng()) * 250;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 0.8) continue;
      q.setFromEuler(new THREE.Euler(0, rng() * 6, 0));
      m.compose(new THREE.Vector3(x, heightAt(x, z) + 0.4, z), q, new THREE.Vector3(1, 1, 1));
      gm.setMatrixAt(placed++, m);
    }
    gm.count = placed; gm.frustumCulled = false;
    group.add(gm);
  }

  /* ---------------- clouds & atmosphere ---------------- */
  const cloudTex = smokeTexture(128);
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.14, depthWrite: false, color: new THREE.Color(map.skyHorizon) });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(cloudMat.clone());
    s.position.set((rng() - 0.5) * 800, 75 + rng() * 50, (rng() - 0.5) * 800);
    s.scale.set(90 + rng() * 120, 26 + rng() * 20, 1);
    s.material.opacity = 0.07 + rng() * 0.1;
    group.add(s); clouds.push(s);
  }

  // weather particles
  let particles = null, particleData = null;
  const pCount = quality === 'high' ? 900 : quality === 'medium' ? 500 : 0;
  if (pCount) {
    const pg = new THREE.BufferGeometry();
    const p = new Float32Array(pCount * 3);
    particleData = [];
    for (let i = 0; i < pCount; i++) {
      const x = (rng() - 0.5) * 80, y = rng() * 30, z = (rng() - 0.5) * 80;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      particleData.push({ x, y, z, v: 0.4 + rng() * 1.2 });
    }
    pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pMat = new THREE.PointsMaterial({
      color: map.id === 'dune' ? 0xe8d4a8 : map.id === 'frost' ? 0xffffff : 0xd8e8a8,
      size: map.id === 'frost' ? 0.22 : 0.16, transparent: true, opacity: map.id === 'dune' ? 0.35 : 0.6,
      depthWrite: false, sizeAttenuation: true
    });
    particles = new THREE.Points(pg, pMat);
    particles.frustumCulled = false;
    group.add(particles);
  }

  /* ---------------- build batches ---------------- */
  bat.concrete.build(group);
  bat.metal.build(group);
  bat.wood.build(group);
  bat.stone.build(group);
  bat.dark.build(group);
  bat.glass.build(group, false);
  bat.cloth.build(group);
  bat.paint.build(group, false);
  bat.cyl.build(group);
  bat.cylDark.build(group);
  bat.cylWood.build(group);
  bat.cylStone.build(group);

  /* ---------------- minimap base ---------------- */
  const mini = document.createElement('canvas'); mini.width = mini.height = 512;
  const mctx = mini.getContext('2d');
  const mapScale = 512 / SIZE;
  const img = mctx.createImageData(512, 512);
  for (let py = 0; py < 512; py++) {
    for (let px = 0; px < 512; px++) {
      const wx = (px / 512) * SIZE - HALF, wz = (py / 512) * SIZE - HALF;
      const h = heightAt(wx, wz);
      let r, g, b;
      if (h < SEA + 0.3) {
        const deep = clamp(-h / 8, 0, 1);
        const wc = new THREE.Color(map.waterDeep).lerp(new THREE.Color(map.water), 1 - deep);
        r = wc.r * 255; g = wc.g * 255; b = wc.b * 255;
      } else if (h < 1.6) {
        const c = new THREE.Color(map.sand); r = c.r * 255; g = c.g * 255; b = c.b * 255;
      } else {
        const n = 0.5 + 0.5 * Math.sin(wx * 0.09 + Math.cos(wz * 0.07) * 3) * Math.cos(wz * 0.05);
        const c = new THREE.Color(map.minimap).lerp(new THREE.Color(map.groundB), n * 0.5);
        const shade = 0.85 + (h / 20);
        r = c.r * 255 * shade; g = c.g * 255 * shade; b = c.b * 255 * shade;
      }
      const i = (py * 512 + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  // roads on minimap
  mctx.strokeStyle = 'rgba(225,214,184,.55)'; mctx.lineWidth = 2.2;
  for (const [a, b] of roadPairs) {
    mctx.beginPath(); mctx.moveTo((a.x + HALF) * mapScale, (a.z + HALF) * mapScale);
    mctx.lineTo((b.x + HALF) * mapScale, (b.z + HALF) * mapScale); mctx.stroke();
  }
  // grid
  mctx.strokeStyle = 'rgba(255,255,255,.1)'; mctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    mctx.beginPath(); mctx.moveTo(i * 64, 0); mctx.lineTo(i * 64, 512); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(0, i * 64); mctx.lineTo(512, i * 64); mctx.stroke();
  }
  for (const p of map.pois) {
    const x = (p.x + HALF) * mapScale, y = (p.z + HALF) * mapScale;
    mctx.fillStyle = 'rgba(0,0,0,.55)'; mctx.beginPath(); mctx.arc(x, y, 4, 0, 7); mctx.fill();
    mctx.fillStyle = '#f4efe2'; mctx.beginPath(); mctx.arc(x, y, 2.2, 0, 7); mctx.fill();
    mctx.font = '600 11px "Chakra Petch", sans-serif';
    mctx.fillStyle = 'rgba(245,250,252,.88)';
    mctx.textAlign = 'center';
    mctx.fillText(p.name, x, y - 9);
  }
  const miniTex = new THREE.CanvasTexture(mini);
  miniTex.colorSpace = THREE.SRGBColorSpace;

  /* ---------------- ray queries ---------------- */
  const occluders = colliders;
  function rayBlock(origin, dir, maxDist) {
    let best = maxDist;
    for (let i = 0; i < occluders.length; i++) {
      const t = rayAABB(origin, dir, occluders[i], best);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
  function collide(pos, radius, feetY) {
    // returns corrected x/z through pos mutation
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (feetY > c.maxY - 0.25 || feetY + 1.7 < c.minY) continue;
      const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
      let dx = pos.x - cx, dz = pos.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 0.000001) {
          // inside: push toward nearest edge
          const dl = pos.x - c.minX, dr = c.maxX - pos.x, dt = pos.z - c.minZ, db = c.maxZ - pos.z;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) pos.x = c.minX - radius;
          else if (m === dr) pos.x = c.maxX + radius;
          else if (m === dt) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        } else {
          const d = Math.sqrt(d2);
          pos.x = cx + dx / d * radius;
          pos.z = cz + dz / d * radius;
        }
      }
    }
    const r = Math.hypot(pos.x, pos.z);
    if (r > 276) { pos.x *= 276 / r; pos.z *= 276 / r; }
    return pos;
  }
  function isSolidAt(x, z, y) {
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y > c.minY - 0.2 && y < c.maxY) return true;
    }
    return false;
  }

  /* ---------------- update ---------------- */
  let time = 0;
  function update(dt, playerPos) {
    time += dt;
    wTex.offset.x += dt * 0.004;
    wTex.offset.y += dt * 0.0022;
    sky.material.uniforms.uTime.value = time;
    if (playerPos) {
      sky.position.set(playerPos.x, 0, playerPos.z);
      sun.position.set(playerPos.x + sunDir.x * 170, 90 + sunDir.y * 90, playerPos.z + sunDir.z * 170);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      if (particles) {
        particles.position.set(playerPos.x, 0, playerPos.z);
        const arr = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleData.length; i++) {
          const d = particleData[i];
          if (map.id === 'dune') {
            d.x += dt * (1.2 + d.v * 0.5); d.z += dt * 0.4;
            if (d.x > 40) d.x -= 80;
          } else {
            d.y -= dt * (1.4 + d.v);
            if (d.y < 0) { d.y = 30; d.x = (Math.random() - 0.5) * 80; d.z = (Math.random() - 0.5) * 80; }
            if (d.x > 40) d.x = -40;
          }
          arr[i * 3] = d.x; arr[i * 3 + 1] = d.y; arr[i * 3 + 2] = d.z;
        }
        particles.geometry.attributes.position.needsUpdate = true;
      }
    }
    for (const c of clouds) {
      c.position.x += dt * 1.4;
      if (c.position.x > 420) c.position.x = -420;
    }
  }

  function dispose() {
    scene.remove(group);
    scene.fog = null;
    group.traverse(o => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
      if (o.isInstancedMesh) o.dispose?.();
    });
    miniTex.dispose();
  }

  return {
    group, map, scene, heightAt, groundAt, colliders, lootSpots, vehicleSpots, spawnPoints,
    poiCenters, terrain, sun, sky, miniCanvas: mini, update, dispose, rayBlock, collide,
    isSolidAt, size: SIZE, half: HALF, sea: SEA,
    toMap: (x, z) => ({ x: (x + HALF) * mapScale, y: (z + HALF) * mapScale }),
    sunDir
  };
}
