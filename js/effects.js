import * as THREE from 'three';
import { radialTexture, smokeTexture, rand } from './utils.js';

const flashTex = radialTexture('rgba(255,232,180,1)', 'rgba(255,110,20,0)', 128);
const sparkTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,160,60,0)', 64);
const bloodTex = radialTexture('rgba(255,72,52,1)', 'rgba(120,0,0,0)', 64);
const dustTex = smokeTexture(128);

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.tracers = [];
    this.flashes = [];
    this.sparks = [];
    this.smokes = [];
    this.dmgNums = [];
    this.container = document.getElementById('dmg-layer');
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

    // tracers
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, this.tracerMat.clone());
      line.visible = false; line.frustumCulled = false; scene.add(line);
      this.tracers.push({ line, life: 0, max: 0.09 });
    }
    // flashes / sparks
    const addSpritePool = (n, tex, blending) => {
      const arr = [];
      for (let i = 0; i < n; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending, depthWrite: false, depthTest: true });
        const s = new THREE.Sprite(mat); s.visible = false; scene.add(s);
        arr.push({ sprite: s, life: 0, max: 0.2, vel: new THREE.Vector3(), grow: 1 });
      }
      return arr;
    };
    this.flashes = addSpritePool(24, flashTex, THREE.AdditiveBlending);
    this.sparks = addSpritePool(60, sparkTex, THREE.AdditiveBlending);
    this.smokes = addSpritePool(40, dustTex, THREE.NormalBlending);
    this.smokes.forEach(p => { p.sprite.material.color.set(0xb9b2a6); p.grow = 1.8; });
  }

  _get(pool, tex) {
    let p = pool.find(x => x.life <= 0);
    if (!p) p = pool[0];
    p.sprite.visible = true; p.life = p.max = 0.16; p.vel.set(0, 0, 0); p.sprite.material.map = tex;
    return p;
  }

  muzzle(pos, color = '#ffbb66', scale = 1) {
    const p = this._get(this.flashes, flashTex);
    p.sprite.position.copy(pos);
    p.sprite.material.color.set(color);
    p.sprite.material.opacity = 1;
    p.sprite.scale.setScalar(0.55 * scale * rand(0.85, 1.2));
    p.life = p.max = 0.07;
    p.grow = 0.4;
  }

  tracer(from, to, color = 0xffc06a, width = 1) {
    const t = this.tracers.find(x => x.life <= 0) || this.tracers[0];
    const arr = t.line.geometry.attributes.position.array;
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = t.max = 0.09;
    t.line.computeLineDistances?.();
  }

  impact(pos, normal = null, color = '#ffca7a', blood = false) {
    const p = this._get(this.sparks, blood ? bloodTex : sparkTex);
    p.sprite.position.copy(pos);
    p.sprite.material.color.set(blood ? '#ff4a3a' : color);
    p.sprite.material.opacity = 0.95;
    p.sprite.material.blending = blood ? THREE.NormalBlending : THREE.AdditiveBlending;
    p.sprite.scale.setScalar(blood ? 0.5 : 0.32);
    p.life = p.max = 0.22; p.grow = 0.1;
    // sparks
    for (let i = 0; i < 3; i++) {
      const s = this._get(this.sparks, blood ? bloodTex : sparkTex);
      s.sprite.position.copy(pos);
      s.sprite.material.color.set(blood ? '#d42618' : color);
      s.sprite.material.opacity = 1;
      s.sprite.scale.setScalar(rand(0.06, 0.14));
      s.vel.set(rand(-1.4, 1.4), rand(0.3, 2), rand(-1.4, 1.4));
      if (normal) s.vel.addScaledVector(normal, rand(0.5, 1.5));
      s.life = s.max = rand(0.18, 0.35); s.grow = -0.3;
    }
    if (!blood && Math.random() > 0.5) {
      const s = this._get(this.smokes, dustTex);
      s.sprite.position.copy(pos);
      s.sprite.material.color.set('#b7ac9a');
      s.sprite.material.opacity = 0.22;
      s.sprite.scale.setScalar(0.5);
      s.vel.set(rand(-0.2, 0.2), rand(0.3, 0.8), rand(-0.2, 0.2));
      s.life = s.max = 0.7; s.grow = 1.2;
    }
  }

  explosion(pos, scale = 1) {
    for (let i = 0; i < 6; i++) {
      const p = this._get(this.flashes, flashTex);
      p.sprite.position.set(pos.x + rand(-1, 1), pos.y + rand(0, 1), pos.z + rand(-1, 1));
      p.sprite.material.color.set(i < 2 ? '#fff2c0' : '#ff7a1a');
      p.sprite.material.opacity = 0.9;
      p.sprite.scale.setScalar((1 + i * 0.5) * scale);
      p.life = p.max = 0.4 + i * 0.08; p.grow = 3;
    }
    for (let i = 0; i < 10; i++) {
      const s = this._get(this.smokes, dustTex);
      s.sprite.position.set(pos.x + rand(-1.5, 1.5), pos.y + rand(0, 1.5), pos.z + rand(-1.5, 1.5));
      s.sprite.material.color.set(i < 3 ? '#ff9a3a' : '#2e2a27');
      s.sprite.material.opacity = 0.5;
      s.sprite.scale.setScalar(rand(0.8, 1.8) * scale);
      s.vel.set(rand(-1, 1), rand(0.4, 1.6), rand(-1, 1));
      s.life = s.max = rand(0.9, 1.8); s.grow = 2.2;
    }
  }

  smoke(pos, color = '#c7bda9', opacity = 0.25, scale = 1.4, life = 1.4) {
    const s = this._get(this.smokes, dustTex);
    s.sprite.position.copy(pos);
    s.sprite.material.color.set(color);
    s.sprite.material.opacity = opacity;
    s.sprite.scale.setScalar(scale);
    s.vel.set(rand(-0.1, 0.1), rand(0.5, 1.1), rand(-0.1, 0.1));
    s.life = s.max = life; s.grow = 1.5;
  }

  damageNumber(worldPos, amount, crit = false, kill = false) {
    if (!this.container) return;
    if (this.dmgNums.length > 14) {
      const old = this.dmgNums.shift();
      old.el.remove();
    }
    const div = document.createElement('div');
    div.className = 'dmg-num' + (crit ? ' crit' : '') + (kill ? ' kill' : '');
    div.textContent = kill ? 'ELIMINATED' : (crit ? amount + '!' : amount);
    if (kill) div.style.fontSize = '15px';
    this.container.appendChild(div);
    this.dmgNums.push({ el: div, world: worldPos.clone(), life: 0.75, max: 0.75, randX: rand(-14, 14) });
  }

  update(dt) {
    const v = new THREE.Vector3();
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / t.max) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const pool of [this.flashes, this.sparks, this.smokes]) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.sprite.visible = false; continue; }
        const k = p.life / p.max;
        p.sprite.material.opacity = k * (pool === this.smokes ? 0.5 : 1);
        p.sprite.position.addScaledVector(p.vel, dt);
        p.sprite.scale.x += (p.grow > 0 ? p.grow : p.grow) * dt * 0.6;
        p.sprite.scale.y = p.sprite.scale.x;
      }
    }
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.life -= dt;
      if (d.life <= 0) { d.el.remove(); this.dmgNums.splice(i, 1); continue; }
      v.copy(d.world).project(this.camera);
      if (v.z > 1 || v.z < -1) { d.el.style.display = 'none'; continue; }
      d.el.style.display = '';
      d.el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%';
      d.el.style.top = ((-v.y * 0.5 + 0.5) * 100 + d.randX * 0.01) + '%';
    }
  }

  clear() {
    for (const t of this.tracers) { t.life = 0; t.line.visible = false; }
    for (const pool of [this.flashes, this.sparks, this.smokes]) for (const p of pool) { p.life = 0; p.sprite.visible = false; }
    for (const d of this.dmgNums) d.el.remove();
    this.dmgNums.length = 0;
  }
}
