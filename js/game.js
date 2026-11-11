import * as THREE from 'three';
import { clamp, damp, lerp, rand, pick, formatTime } from './utils.js';
import { WEAPONS, MODES } from './config.js';
import { buildWorld } from './world.js';
import { createHumanoid, createParachute, createVehicle, createPickupModel } from './models.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { BotManager } from './bots.js';
import { audio } from './audio.js';
import { outfitOf, skinOf, helmetOf, backpackOf } from './profile.js';

const DROP_ALT = 155;

export class Game {
  constructor(app) {
    this.app = app;
    this.renderer = app.renderer;
    this.profile = app.profile;
    this.map = app.map;
    this.mode = app.mode;
    this.hud = app.hud;
    this.input = app.input;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.profile.settings.fov || 74, innerWidth / innerHeight, 0.04, 900);
    this.scene.add(this.camera);
    this.world = buildWorld(this.scene, this.map, app.quality);
    this.effects = null;
    this.vehicles = [];
    this.pickups = [];
    this.airdrop = null;
    this.airdropPos = null;
    this.vehicle = null;
    this.time = 0;
    this.matchTime = 0;
    this.active = true;
    this.paused = false;
    this.over = false;
    this.dropDone = false;
    this.zone = null;
    this.deathTimer = 0;
    this.respawnTimer = 0;
    this.airdropTimer = 55;
    this.zoneTick = 0;
    this.introTimer = 2.5;
    this.phase = 'intro';
    this.lastHud = 0;
    this.boundActions = false;
    this.input.clearListeners();
    this.bindInput();
    this.hud.bind(this);
    this.hud.show();
    this.renderer.domElement.classList.add('in-game');
    document.getElementById('lobby').classList.add('hidden');
    this.effects = new Effects(this.scene, this.camera);

    this.player = new Player(this, this.profile);
    this.target = null;
    this.playerModel = null;
    this.parachute = null;
    this.setupSpawn();
    this.bots = new BotManager(this);
    this.spawnPickups();
    this.spawnVehicles();
    this.setupZone();
    this.setupAtmosphere();
    audio.init();
    if (this.mode.id === 'br') this.hud.showDrop(this.world, this.mode);
    this.hud.showIntro(this.mode, this.map);
    this.hud.setObjective(this.mode);
    if (this.mode.id === 'tdm') {
      document.getElementById('obj-score').classList.remove('hidden');
      this.hud.updateScore(0, 0);
    }
    this.player.baseFov = this.profile.settings.fov || 74;
    this.camera.fov = this.player.baseFov;
    this.camera.updateProjectionMatrix();
    this.hud.root.classList.add(this.mode.id === 'br' ? 'dropping' : 'grounded');
    if (this.mode.id !== 'br') this.beginGroundMatch();
    this.updateCameraDrop(0);
    // HUD.bind ran before the player and bots existed; refresh now so the
    // first frame already shows correct ammo, vitals and squad counts.
    this.hud.updateVitals();
    this.hud.updateAmmo();
    this.hud.updateAlive();
    this.app.setGame(this);
  }

  /* ---------------- setup ---------------- */
  setupSpawn() {
    const w = this.world;
    if (this.mode.id === 'br') {
      const target = pick(w.poiCenters.filter(p => p.type !== 'lake')) || w.poiCenters[0];
      this.target = target;
      const ang = rand(0, Math.PI * 2), r = rand(0, 22);
      const x = target.x + Math.cos(ang) * r, z = target.z + Math.sin(ang) * r;
      this.player.pos.set(x, DROP_ALT, z);
      this.player.yaw = rand(0, Math.PI * 2);
      this.player.pitch = -0.08;
      this.player.mode = 'drop';
      this.playerModel = createHumanoid({
        outfit: this.outfitData(), skin: skinOf(this.profile.skin).color, helmet: this.profile.helmet,
        backpack: this.profile.backpack, weapon: this.profile.primary, accent: this.outfitData().accent
      });
      this.playerModel.position.copy(this.player.pos);
      this.playerModel.rotation.y = this.player.yaw;
      this.scene.add(this.playerModel);
      this.parachute = createParachute(this.outfitData().accent);
      this.playerModel.add(this.parachute);
      // skydive pose
      const parts = this.playerModel.userData.parts;
      parts.leftArm.rotation.set(-2.5, 0, -0.5);
      parts.rightArm.rotation.set(-2.5, 0, 0.5);
      parts.leftLeg.rotation.x = 0.35;
      parts.rightLeg.rotation.x = -0.2;
      parts.leftLeg.rotation.z = 0.15;
      parts.rightLeg.rotation.z = -0.1;
    } else {
      const sp = this.pickSafeSpawn();
      const x = sp?.x ?? 0, z = sp?.z ?? 0;
      this.player.spawn(x, z);
      this.player.yaw = rand(0, Math.PI * 2);
      this.playerModel = createHumanoid({
        outfit: this.outfitData(), skin: skinOf(this.profile.skin).color, helmet: this.profile.helmet,
        backpack: this.profile.backpack, weapon: this.profile.primary, accent: this.outfitData().accent
      });
      this.playerModel.visible = false;
      this.scene.add(this.playerModel);
    }
    this.player.health = 100;
    this.player.shield = this.mode.armor || 0;
  }

  outfitData() {
    const o = outfitOf(this.profile.outfit);
    return { top: o.top, pants: o.pants, accent: o.accent, vest: o.vest };
  }

  isSpotClear(x, z, radius = 1.2) {
    const gy = this.world.heightAt(x, z);
    if (gy < this.world.sea + 0.55) return false;
    for (const ox of [-radius, 0, radius]) {
      for (const oz of [-radius, 0, radius]) {
        if (this.world.isSolidAt(x + ox, z + oz, gy + 0.9)) return false;
      }
    }
    return true;
  }

  pickSafeSpawn() {
    const spots = [...this.world.spawnPoints];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    for (const sp of spots) if (this.isSpotClear(sp.x, sp.z, 1.6)) return sp;
    return spots[0];
  }

  findClearNear(x, z, maxRadius = 20) {
    if (this.isSpotClear(x, z, 1.4)) return { x, z };
    for (let r = 2; r <= maxRadius; r += 2) {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (this.isSpotClear(nx, nz, 1.4)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  beginGroundMatch() {
    this.phase = 'play';
    this.dropDone = true;
    this.input.setEnabled(true);
    this.hud.root.classList.remove('dropping');
    this.hud.root.classList.add('grounded');
    this.hud.hideDrop();
    if (this.playerModel) this.playerModel.visible = false;
    if (this.parachute) this.parachute.visible = false;
    this.player.mode = 'fps';
    this.player.eyeHeight = 1.62;
    this.player.syncCamera(0.016);
    this.player.buildViewModel();
    this.hud.show();
    if (!this.input.isTouch) this.app.showLockHint?.();
    this.bots && (this.bots.active = true);
  }

  bindInput() {
    this.input.on('jump', () => { if (this.paused || this.over) return; if (this.vehicle) return; this.player.jump(); });
    this.input.on('reload', () => { if (!this.paused && !this.vehicle) this.player.startReload(); });
    this.input.on('interact', () => { if (!this.paused) this.interact(); });
    this.input.on('med', () => { if (!this.paused && !this.vehicle) this.player.heal(50); });
    this.input.on('shield', () => { if (!this.paused && !this.vehicle) this.player.useShield(50); });
    this.input.on('slot', i => { if (!this.paused && !this.vehicle) this.player.equip(i); });
    this.input.on('swap', dir => {
      if (this.paused || this.vehicle) return;
      const n = this.player.weapons.length;
      const i = typeof dir === 'number' ? (this.player.weaponIndex + (dir < 0 ? -1 : 1) + n) % n : (this.player.weaponIndex + 1) % n;
      this.player.equip(i);
    });
    this.input.on('scoreboard', open => { if (!this.over) this.hud.toggleScoreboard(open); });
    this.input.on('pause', () => { if (this.over) return; this.paused ? this.resume() : this.pause(); });
    this.input.on('unlock', () => { if (!this.over && !this.paused && this.dropDone && !this.input.isTouch) this.pause(); });
    this.input.on('crouch', () => {});
  }

  setupAtmosphere() {
    // match ambience: distant birds / wind handled by audio ambient
  }

  /* ---------------- zone ---------------- */
  setupZone() {
    if (!this.mode.zone) { this.zone = { active: false }; this.hud.setZone(this.zone); return; }
    const phases = [
      { wait: 22, shrink: 14, radius: 160 },
      { wait: 18, shrink: 13, radius: 105 },
      { wait: 16, shrink: 12, radius: 62 },
      { wait: 14, shrink: 11, radius: 32 },
      { wait: 12, shrink: 10, radius: 12 }
    ];
    this.zone = {
      active: true, phase: 0, phases, center: { x: 0, z: 0 }, radius: 255,
      nextCenter: { x: 0, z: 0 }, nextRadius: 160, startRadius: 255, startCenter: { x: 0, z: 0 },
      timeLeft: phases[0].wait, shrinking: false, damage: 3, outside: false, tick: 0
    };
    this.zone.nextCenter = this.pickZoneCenter(255, 160, { x: 0, z: 0 });
    this.zone.nextRadius = phases[0].radius;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff5a1f) }, uOpacity: { value: 0.34 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){
          float band = smoothstep(0.45,0.5,abs(sin(vUv.x*70.0+uTime*0.6)));
          float scan = smoothstep(0.2,1.0,sin(vUv.y*24.0-uTime*1.3)*0.5+0.5);
          float vertical = smoothstep(0.0,0.35,vUv.y)*(1.0-smoothstep(0.85,1.0,vUv.y));
          float a = (0.06 + band*0.12 + scan*0.1) * vertical * uOpacity * 1.8;
          gl_FragColor = vec4(uColor, a);
        }`
    });
    this.zoneMat = mat;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 80, 1, true), mat);
    cyl.frustumCulled = false;
    this.zoneMesh = cyl;
    this.scene.add(cyl);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 96), ringMat);
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.frustumCulled = false;
    this.scene.add(this.zoneRing);
    this.updateZoneVisual();
    this.hud.setZone(this.zone);
  }

  pickZoneCenter(curR, nextR, curC) {
    const maxOffset = Math.max(0, curR - nextR) * 0.75;
    const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * maxOffset;
    let x = curC.x + Math.cos(a) * d, z = curC.z + Math.sin(a) * d;
    const lim = 245 - nextR * 0.2;
    const r = Math.hypot(x, z);
    if (r > lim) { x *= lim / r; z *= lim / r; }
    return { x, z };
  }

  updateZone(dt) {
    const z = this.zone;
    if (!z || !z.active) return;
    z.timeLeft -= dt;
    if (!z.shrinking) {
      if (z.timeLeft <= 0 && z.phase < z.phases.length) {
        z.shrinking = true;
        z.timeLeft = z.phases[z.phase].shrink;
        z.shrinkDur = z.phases[z.phase].shrink;
        z.startRadius = z.radius;
        z.startCenter = { ...z.center };
      }
    } else {
      const p = clamp(1 - z.timeLeft / z.shrinkDur, 0, 1);
      z.radius = lerp(z.startRadius, z.nextRadius, p);
      z.center.x = lerp(z.startCenter.x, z.nextCenter.x, p);
      z.center.z = lerp(z.startCenter.z, z.nextCenter.z, p);
      if (z.timeLeft <= 0) {
        z.shrinking = false;
        z.phase++;
        z.damage = 3 + z.phase * 3;
        if (z.phase < z.phases.length) {
          z.timeLeft = z.phases[z.phase].wait;
          z.nextRadius = z.phases[z.phase].radius;
          z.nextCenter = this.pickZoneCenter(z.radius, z.nextRadius, z.center);
        } else {
          z.timeLeft = 999;
          z.nextRadius = z.radius;
          z.nextCenter = { ...z.center };
        }
      }
    }
    const d = Math.hypot(this.player.pos.x - z.center.x, this.player.pos.z - z.center.z);
    z.outside = d > z.radius;
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 1;
      if (z.outside) {
        this.player.takeDamage(z.damage, { pos: new THREE.Vector3(z.center.x, 0, z.center.z) });
        this.hud.warnZone?.();
        audio.warn();
      }
      for (const b of this.bots.bots) {
        if (!b.alive) continue;
        if (Math.hypot(b.pos.x - z.center.x, b.pos.z - z.center.z) > z.radius) b.takeDamage(z.damage + 2, null);
      }
    }
    this.updateZoneVisual();
    this.hud.setZone(z);
  }

  updateZoneVisual() {
    const z = this.zone;
    if (!z || !z.active || !this.zoneMesh) return;
    this.zoneMesh.scale.set(z.radius, 120, z.radius);
    this.zoneMesh.position.set(z.center.x, 60, z.center.z);
    this.zoneRing.scale.set(z.radius, z.radius, 1);
    this.zoneRing.position.set(z.center.x, this.world.heightAt(z.center.x, z.center.z) + 0.2, z.center.z);
    this.zoneRing.material.color.set(z.outside ? 0xff3828 : 0xff7a2a);
  }

  /* ---------------- loot ---------------- */
  spawnPickups() {
    const spots = this.world.lootSpots;
    const step = Math.max(1, Math.floor(spots.length / 42));
    let count = 0;
    for (let i = 0; i < spots.length && count < 46; i += step) {
      const s = spots[i];
      let kind = s.kind;
      if (kind === 'random') kind = pick(['ammo', 'med', 'shield', 'ammo', 'med', 'weapon', 'shield']);
      const weaponId = kind === 'weapon' ? pick(['vanguard', 'viper', 'breaker', 'longshot', 'raptor']) : (kind === 'ammo' ? pick(['vanguard', 'viper', 'sidearm']) : null);
      this.spawnPickup(s.x, s.z, s.y, kind, weaponId);
      count++;
    }
  }

  spawnPickup(x, z, y, kind, weaponId = null) {
    const model = createPickupModel(kind, weaponId || 'vanguard');
    const yy = Math.max(y, this.world.heightAt(x, z) + 0.03);
    model.position.set(x, yy, z);
    model.rotation.y = rand(0, 6);
    this.scene.add(model);
    const p = { x, z, y: yy, kind, weaponId, model, active: true, baseY: yy, t: rand(0, 6) };
    this.pickups.push(p);
    return p;
  }

  updatePickups(dt, t) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (!pk.active) { this.pickups.splice(i, 1); continue; }
      pk.t += dt;
      pk.model.rotation.y += dt * 0.9;
      pk.model.position.y = pk.baseY + Math.sin(pk.t * 1.8) * 0.06;
      if (pk.model.userData.ring) {
        const s = 1 + Math.sin(pk.t * 2.4) * 0.12;
        pk.model.userData.ring.scale.setScalar(s);
      }
      if (p.alive && p.mode !== 'dead' && !this.vehicle) {
        const dx = p.pos.x - pk.x, dz = p.pos.z - pk.z;
        if (dx * dx + dz * dz < 2.6 * 2.6 && Math.abs(p.pos.y - pk.baseY) < 3) {
          this.collectPickup(pk);
        }
      }
    }
  }

  collectPickup(pk) {
    const p = this.player;
    pk.active = false;
    this.scene.remove(pk.model);
    audio.pickup();
    if (pk.kind === 'weapon') {
      const def = WEAPONS[pk.weaponId];
      const current = p.weapon.def;
      if (current.id === pk.weaponId) {
        p.weapon.reserve += def.reserve;
        this.hud.pickup(def.name, '+' + def.reserve + ' AMMO', 'i-gun');
        this.hud.updateAmmo();
      } else {
        p.equipId(pk.weaponId);
        this.hud.pickup(def.name, 'EQUIPPED', 'i-gun');
      }
    } else if (pk.kind === 'ammo') {
      p.weapon.reserve += Math.ceil(p.weapon.def.mag * 2.5);
      this.hud.pickup('AMMO', '+' + Math.ceil(p.weapon.def.mag * 2.5), 'i-gun');
      this.hud.updateAmmo();
    } else if (pk.kind === 'med') {
      p.medkits = Math.min(5, p.medkits + 1);
      this.hud.pickup('MEDKIT', '+1', 'i-med');
      this.hud.updateVitals();
    } else if (pk.kind === 'shield') {
      p.shields = Math.min(4, p.shields + 1);
      this.hud.pickup('SHIELD CELL', '+1', 'i-shield');
      this.hud.updateVitals();
    } else if (pk.kind === 'airdrop') {
      const id = pick(['longshot', 'raptor']);
      p.equipId(id);
      p.weapon.mag = p.weapon.def.mag;
      p.weapon.reserve = p.weapon.def.reserve;
      p.shields = Math.min(4, p.shields + 2);
      p.medkits = Math.min(5, p.medkits + 2);
      this.hud.pickup('LEGENDARY DROP', WEAPONS[id].name, 'i-trophy');
      this.hud.banner('AIRDROP SECURED', WEAPONS[id].name, 2200);
      this.hud.updateAmmo(); this.hud.updateVitals();
    }
  }

  dropBotLoot(bot) {
    const y = this.world.heightAt(bot.pos.x, bot.pos.z);
    this.spawnPickup(bot.pos.x + rand(-1.2, 1.2), bot.pos.z + rand(-1.2, 1.2), y, 'ammo');
    if (Math.random() > 0.35) this.spawnPickup(bot.pos.x + rand(-1, 1), bot.pos.z + rand(-1, 1), y, 'med');
    if (Math.random() > 0.45) this.spawnPickup(bot.pos.x + rand(-1, 1), bot.pos.z + rand(-1, 1), y, 'weapon', bot.weaponDef.id);
  }

  /* ---------------- vehicles ---------------- */
  spawnVehicles() {
    const spots = [...this.world.vehicleSpots];
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    for (const s of spots) {
      if (this.vehicles.length >= 5) break;
      let x = s.x, z = s.z;
      let ok = false;
      for (let k = 0; k < 6; k++) {
        if (!this.world.isSolidAt(x, z, this.world.heightAt(x, z) + 1)) { ok = true; break; }
        x += rand(-4, 4); z += rand(-4, 4);
      }
      if (!ok) continue;
      const type = Math.random() > 0.65 ? 'truck' : 'buggy';
      const color = pick(['#c8652a', '#4b6b48', '#6b4a3a', '#3d5b6b', '#8a7a45']);
      const model = createVehicle(type, color);
      const gy = this.world.heightAt(x, z);
      model.position.set(x, gy + 0.1, z);
      model.rotation.y = s.yaw;
      this.scene.add(model);
      this.vehicles.push({
        model, pos: new THREE.Vector3(x, gy + 0.1, z), yaw: s.yaw, speed: 0,
        health: 100, wheels: model.userData.wheels, type, destroyed: false, lastHit: -10
      });
    }
  }

  nearestVehicle(maxDist = 4) {
    let best = null, bd = maxDist;
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  enterVehicle(v) {
    if (!v || v.destroyed || this.vehicle) return;
    this.vehicle = v;
    this.player.mode = 'vehicle';
    this.player.adsAmount = 0; this.player.aiming = false;
    this.player.viewGroup.visible = false;
    if (this.playerModel) this.playerModel.visible = false;
    this.hud.root.classList.add('driving');
    this.hud.root.classList.remove('grounded');
    audio.startEngine();
    this.hud.toast('VEHICLE ACQUIRED', v.type.toUpperCase());
    document.getElementById('interact-hint').classList.add('hidden');
    const ti = document.getElementById('t-interact'); if (ti) ti.classList.add('hidden');
  }

  exitVehicle(force = false) {
    if (!this.vehicle) return;
    const v = this.vehicle;
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(2.2);
    this.player.mode = 'fps';
    this.player.pos.set(v.pos.x + side.x, this.world.heightAt(v.pos.x + side.x, v.pos.z + side.z) + 0.05, v.pos.z + side.z);
    this.world.collide(this.player.pos, 0.4, this.player.pos.y);
    this.player.vel.set(0, 0, 0);
    this.player.viewGroup.visible = true;
    this.player.eyeHeight = 1.62;
    this.player.yaw = v.yaw;
    this.player.pitch = 0;
    this.player.buildViewModel();
    this.player.syncCamera(0.016);
    this.hud.root.classList.remove('driving');
    this.hud.root.classList.add('grounded');
    audio.stopEngine();
    this.vehicle = null;
    v.speed = 0;
  }

  updateVehicle(dt) {
    const v = this.vehicle;
    if (!v) return;
    const throttle = this.input.forward;
    const steer = this.input.strafe;
    const maxF = v.type === 'truck' ? 19 : 26;
    const target = throttle * (throttle >= 0 ? maxF : -8);
    v.speed = damp(v.speed, target, throttle ? 1.8 : 2.6, dt);
    if (Math.abs(v.speed) < 0.03) v.speed = 0;
    const steerAmt = clamp(Math.abs(v.speed) / 12, 0, 1.3);
    v.yaw -= steer * steerAmt * 1.45 * Math.sign(v.speed || 1) * dt;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const oldX = v.pos.x, oldZ = v.pos.z;
    v.pos.x += fx * v.speed * dt;
    v.pos.z += fz * v.speed * dt;
    this.world.collide(v.pos, 1.35, v.pos.y);
    const bump = Math.hypot(v.pos.x - oldX, v.pos.z - oldZ) < Math.abs(v.speed * dt) * 0.5;
    if (bump) {
      if (Math.abs(v.speed) > 10) { v.health -= Math.abs(v.speed) * 0.7; this.effects.impact(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z), null, '#ffce7a', false); audio.land(); this.player.cameraShake = 0.04; }
      v.speed *= -0.22;
    }
    const gy = this.world.heightAt(v.pos.x, v.pos.z);
    v.pos.y = gy + 0.1;
    // tilt to terrain
    const fh = this.world.heightAt(v.pos.x + fx * 1.6, v.pos.z + fz * 1.6);
    const bh = this.world.heightAt(v.pos.x - fx * 1.6, v.pos.z - fz * 1.6);
    const rh = this.world.heightAt(v.pos.x + Math.cos(v.yaw) * 1.1, v.pos.z - Math.sin(v.yaw) * 1.1);
    const lh = this.world.heightAt(v.pos.x - Math.cos(v.yaw) * 1.1, v.pos.z + Math.sin(v.yaw) * 1.1);
    const pitch = Math.atan2(fh - bh, 3.2);
    const roll = Math.atan2(lh - rh, 2.2);
    v.model.position.copy(v.pos);
    v.model.rotation.order = 'YXZ';
    v.model.rotation.y = v.yaw;
    v.model.rotation.x = damp(v.model.rotation.x, -pitch, 6, dt);
    v.model.rotation.z = damp(v.model.rotation.z, roll, 6, dt);
    for (const w of v.wheels) w.rotation.x += v.speed * dt * 1.4;
    this.player.pos.set(v.pos.x, v.pos.y, v.pos.z);
    this.player.yaw = v.yaw;
    // camera
    const camTarget = new THREE.Vector3(v.pos.x - fx * 7.4 + Math.cos(v.yaw) * 0.0, v.pos.y + 3.7, v.pos.z - fz * 7.4);
    this.camera.position.lerp(camTarget, 1 - Math.exp(-6 * dt));
    const look = new THREE.Vector3(v.pos.x + fx * 3.5, v.pos.y + 1.35, v.pos.z + fz * 3.5);
    this.camera.lookAt(look);
    this.camera.rotation.z += roll * 0.3;
    this.camera.fov = damp(this.camera.fov, (this.profile.settings.fov || 74) + 6, 4, dt);
    this.camera.updateProjectionMatrix();
    audio.engineSpeed(Math.abs(v.speed));
    // run over bots
    if (Math.abs(v.speed) > 5) {
      for (const b of this.bots.bots) {
        if (!b.alive) continue;
        if (Math.hypot(b.pos.x - v.pos.x, b.pos.z - v.pos.z) < 2.4 && this.time - b.lastDamage > 0.5) {
          b.takeDamage(100, this.player, null, false, null);
          this.effects.impact(new THREE.Vector3(b.pos.x, b.pos.y + 1, b.pos.z), null, '#ff9a6a', true);
          this.player.kills++;
        }
      }
    }
    if (v.health <= 0) {
      v.destroyed = true;
      this.effects.explosion(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z), 1.6);
      audio.explosion?.();
      this.scene.remove(v.model);
      this.player.takeDamage(28, null);
      this.exitVehicle(true);
      this.hud.toast('VEHICLE DESTROYED', 'BAILED OUT');
    }
  }

  interact() {
    if (this.vehicle) { this.exitVehicle(); return; }
    const v = this.nearestVehicle(4);
    if (v) this.enterVehicle(v);
  }

  /* ---------------- combat ---------------- */
  castShot(origin, dir, range, shooter) {
    const raycaster = new THREE.Raycaster(origin, dir, 0.1, range);
    const meshes = [];
    for (const b of this.bots.bots) if (b.alive && b.hitMeshes) meshes.push(...b.hitMeshes);
    const hits = raycaster.intersectObjects(meshes, false);
    let wallDist = this.world.rayBlock(origin, dir, range);
    // terrain via marching
    let terrainDist = range;
    const step = 2;
    const p = new THREE.Vector3();
    for (let d = step; d < Math.min(range, wallDist); d += step) {
      p.copy(origin).addScaledVector(dir, d);
      if (p.y <= this.world.heightAt(p.x, p.z)) { terrainDist = d; break; }
    }
    let botHit = null, zone = null, botDist = Infinity;
    for (const h of hits) {
      if (h.distance >= wallDist || h.distance >= terrainDist) continue;
      const bot = h.object.userData.bot;
      if (!bot || !bot.alive) continue;
      if (bot === shooter) continue;
      if (shooter && shooter !== this.player && shooter.team === bot.team) continue;
      botDist = h.distance; botHit = bot; zone = h.object.userData.hitZone;
      break;
    }
    const dist = Math.min(range, wallDist, terrainDist, botDist);
    const point = origin.clone().addScaledVector(dir, dist);
    return { point, bot: botHit, zone, distance: dist, normal: dir.clone().negate() };
  }

  damageBot(bot, amount, shooter, point, head, def) {
    if (!bot.alive) return;
    const was = bot.alive;
    bot.takeDamage(amount, shooter, point, head, def);
    this.player.damageDealt += amount;
    this.hud.hitmarker(head);
    if (was && !bot.alive) {
      this.effects.damageNumber(point, amount, head, true);
    } else {
      this.effects.damageNumber(point, amount, head, false);
    }
    this.hud.updateAlive();
    this.checkEnd();
  }

  onBotKilled(bot, killer, head, def) {
    const isPlayer = killer === this.player;
    const weaponName = (def || bot.weaponDef).short;
    if (isPlayer) {
      this.player.kills++;
      if (this.mode.id === 'tdm') this.bots.notifyKill(0);
      this.hud.killFeed(this.profile.name.toUpperCase(), bot.name.toUpperCase(), weaponName, true, head);
      this.hud.banner(head ? 'HEADSHOT ELIMINATION' : 'ENEMY ELIMINATED', bot.name.toUpperCase(), 1500);
      audio.kill();
      this.hud.updateAlive();
      this.hud.updateVitals();
    } else if (killer && killer.name) {
      killer.kills = (killer.kills || 0) + 1;
      this.hud.killFeed(killer.name.toUpperCase(), bot.name.toUpperCase(), weaponName, false, head);
      if (this.mode.id === 'tdm') this.bots.notifyKill(killer.team);
    } else {
      this.hud.killFeed('THE FIRESTORM', bot.name.toUpperCase(), null, false, false);
      if (this.mode.id === 'tdm') this.bots.notifyKill(bot.team === 0 ? 1 : 0);
    }
    this.hud.updateAlive();
    this.checkEnd();
  }

  onVirtualKill(killer, victim) {
    this.hud.killFeed(killer.toUpperCase(), victim.toUpperCase(), pick(['AR', 'SMG', 'SR', 'SG']), false, false);
    this.hud.updateAlive();
    this.checkEnd();
  }

  onTeamScore(scores) {
    this.hud.updateScore(scores[0], scores[1]);
    this.hud.updateAlive();
    if (scores[0] >= this.mode.killTarget || scores[1] >= this.mode.killTarget) {
      this.endMatch(scores[0] > scores[1], 'score');
    }
  }

  onPlayerDeath(source) {
    this.input.firing = false;
    this.player.adsAmount = 0;
    if (this.vehicle) this.exitVehicle(true);
    this.deathTimer = 0;
    this.hud.banner('YOU WERE ELIMINATED', source && source.name ? `BY ${source.name.toUpperCase()}` : 'THE ZONE CLAIMED YOU', 2400);
    this.hud.toggleScoreboard(false);
    if (source && source.name) {
      source.kills = (source.kills || 0) + 1;
      this.hud.killFeed(source.name.toUpperCase(), this.profile.name.toUpperCase(), source.weaponDef?.short || 'AR', false, false);
      if (this.mode.id === 'tdm') this.bots.notifyKill(source.team);
    } else {
      this.hud.killFeed('THE FIRESTORM', this.profile.name.toUpperCase(), null, false, false);
    }
    this.hud.updateAlive();
    if (this.mode.respawn) {
      this.respawnTimer = 3.2;
      this.hud.banner('RESPAWNING', '3 SECONDS', 2600);
    } else {
      this.hud.root.classList.add('dead');
      setTimeout(() => { if (this.active && !this.over) this.endMatch(false, 'death'); }, 2100);
    }
  }

  respawnPlayer() {
    const sp = pick(this.world.spawnPoints);
    this.player.resetForRespawn(sp.x, sp.z);
    this.player.syncCamera(0.016);
    this.player.buildViewModel();
    this.hud.root.classList.remove('dead');
    this.hud.updateVitals(); this.hud.updateAmmo();
    this.hud.banner('REDEPLOYED', 'BACK IN THE FIGHT', 1600);
    this.deathTimer = 0;
  }

  checkEnd() {
    if (this.over) return;
    if (this.mode.id === 'br' && this.dropDone && this.player.alive) {
      if (this.bots.aliveReal === 0 && this.bots.virtualAlive === 0) this.endMatch(true, 'last');
    }
  }

  endMatch(win, reason) {
    if (this.over) return;
    this.over = true;
    this.input.setEnabled(false);
    this.hud.hideDrop();
    this.hud.toggleScoreboard(false);
    if (this.vehicle) this.exitVehicle(true);
    const placement = win && this.mode.id === 'br' ? 1 : Math.max(1, this.bots.aliveCount + 1);
    const accuracy = this.player.shots ? (this.player.hits / this.player.shots) * 100 : 0;
    const time = Math.max(1, this.matchTime);
    const kills = this.player.kills;
    const data = {
      win: !!win, mode: this.mode.id, modeName: this.mode.name, placement,
      players: this.mode.players, kills, damage: this.player.damageDealt,
      time, accuracy, mapName: this.map.name, headshots: this.player.headshots,
      teamScores: this.bots.teamScores,
      coins: Math.round(120 + kills * 45 + (win ? 300 : 0) + placement * 3),
      xp: Math.round(180 + kills * 80 + (win ? 600 : 0) + this.player.damageDealt * 0.35),
      rankPts: Math.max(-15, kills * 6 + (win ? 40 : 0) - placement)
    };
    this.matchData = data;
    this.app.applyResult(data);
    setTimeout(() => {
      if (!this.active) return;
      audio[win ? 'victory' : 'defeat']?.();
      this.hud.showResults(data);
      this.hud.hide();
    }, 900);
  }

  playAgain() {
    this.app.startMatch(this.mode.id, this.map.id);
  }
  returnToLobby() {
    this.app.endGame();
  }
  leaveMatch() {
    this.app.endGame();
  }
  skipDrop() {
    if (this.phase !== 'drop' || this.dropDone) return;
    const gy = this.world.heightAt(this.player.pos.x, this.player.pos.z);
    if (this.player.pos.y - gy > 28) {
      this.player.pos.y = gy + 24;
      this.parachute && (this.parachute.visible = true);
    } else this.landDrop();
  }

  /* ---------------- camera / drop ---------------- */
  updateCameraDrop(dt) {
    const p = this.player, cam = this.camera;
    const alt = p.pos.y - this.world.heightAt(p.pos.x, p.pos.z);
    const chute = alt < 55;
    if (this.parachute) this.parachute.visible = chute;
    if (this.playerModel) {
      this.playerModel.position.copy(p.pos);
      this.playerModel.rotation.y = p.yaw;
      if (!chute) {
        this.playerModel.rotation.x = damp(this.playerModel.rotation.x, -0.25, 2, dt);
      } else {
        this.playerModel.rotation.x = damp(this.playerModel.rotation.x, 0.05, 3, dt);
      }
    }
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const camPos = p.pos.clone().addScaledVector(fwd, -7.5).add(new THREE.Vector3(0, chute ? 3.4 : 2.4, 0));
    cam.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    const look = p.pos.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1.2, 0));
    cam.lookAt(look);
    if (chute) cam.rotation.z = Math.sin(this.time * 0.8) * 0.015;
    cam.fov = damp(cam.fov, (this.profile.settings.fov || 74) + (chute ? 4 : 10), 3, dt);
    cam.updateProjectionMatrix();
    this.world.update(dt, p.pos);
  }

  landDrop() {
    if (this.dropDone) return;
    const clear = this.findClearNear(this.player.pos.x, this.player.pos.z, 22);
    if (clear.x !== this.player.pos.x || clear.z !== this.player.pos.z) {
      this.player.pos.x = clear.x;
      this.player.pos.z = clear.z;
    }
    const gy = this.world.heightAt(this.player.pos.x, this.player.pos.z);
    this.player.pos.y = gy + 0.05;
    this.player.mode = 'fps';
    this.player.eyeHeight = 1.62;
    this.dropDone = true;
    this.phase = 'play';
    this.playerModel.visible = false;
    if (this.parachute) this.parachute.visible = false;
    this.player.syncCamera(0.016);
    this.player.buildViewModel();
    this.input.setEnabled(true);
    this.hud.hideDrop();
    this.hud.root.classList.remove('dropping');
    this.hud.root.classList.add('grounded');
    if (!this.input.isTouch) this.app.showLockHint?.();
    this.hud.banner('DROP COMPLETE', this.target ? this.target.name : this.map.name, 2200);
    this.effects.impact(new THREE.Vector3(this.player.pos.x, this.player.pos.y + 0.1, this.player.pos.z), null, '#e8d9b8', false);
    this.effects.smoke(new THREE.Vector3(this.player.pos.x, this.player.pos.y + 0.3, this.player.pos.z), '#d9cbb0', 0.28, 1.6, 1.2);
    audio.land();
    this.camera.fov = this.player.baseFov;
    this.camera.updateProjectionMatrix();
    this.matchTime = 0;
    this.checkEnd();
  }

  updateDrop(dt) {
    const p = this.player;
    const look = this.input.consumeLook();
    p.yaw -= look.dx * (this.input.isTouch ? 0.0045 : 0.0022) * (this.profile.settings.sens || 1);
    p.pitch = clamp(p.pitch - look.dy * (this.input.isTouch ? 0.004 : 0.002), -0.9, 0.6);
    const alt = p.pos.y - this.world.heightAt(p.pos.x, p.pos.z);
    const chute = alt < 55;
    const steerSpeed = chute ? 9 : 15;
    const f = this.input.forward, s = this.input.strafe;
    if (this.introTimer <= 0) {
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      const vx = (-sin * f + cos * s) * steerSpeed;
      const vz = (-cos * f - sin * s) * steerSpeed;
      p.pos.x = clamp(p.pos.x + vx * dt, -280, 280);
      p.pos.z = clamp(p.pos.z + vz * dt, -280, 280);
    }
    const gy = this.world.heightAt(p.pos.x, p.pos.z);
    const descent = chute ? 6.5 : (this.input.keys.has('ShiftLeft') ? 34 : 21);
    p.pos.y -= descent * dt;
    if (p.pos.y <= Math.max(gy + 0.4, this.world.sea + 0.2)) {
      this.landDrop();
      return;
    }
    this.updateCameraDrop(dt);
    if (this.phase === 'drop') {
      const altNow = p.pos.y - gy;
      this.hud.updateDrop(1 - altNow / DROP_ALT, altNow, chute);
    }
  }

  /* ---------------- main update ---------------- */
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    if (this.paused) { this.effects.update(dt); return; }
    if (!this.over && this.dropDone) this.matchTime += dt;

    if (this.phase === 'intro') {
      this.introTimer -= dt;
      if (this.mode.id === 'br') {
        this.updateDrop(dt);
        if (this.introTimer <= 0) {
          this.phase = 'drop';
          this.input.setEnabled(true);
          this.hud.showDrop(this.world, this.mode);
        }
      } else {
        if (this.introTimer <= 0) this.beginGroundMatch();
      }
    } else if (this.phase === 'drop') {
      this.updateDrop(dt);
    } else if (this.dropDone) {
      if (this.player.alive) {
        if (this.vehicle) {
          this.updateVehicle(dt);
          this.player.fireTimer = Math.max(0, this.player.fireTimer - dt);
          this.player.viewGroup.visible = false;
        } else {
          this.player.update(dt, this.input);
        }
      } else {
        this.deathTimer += dt;
        this.player.updateCameraShake(dt);
        if (this.mode.respawn && this.respawnTimer > 0) {
          this.respawnTimer -= dt;
          if (this.respawnTimer <= 0) this.respawnPlayer();
        }
      }
      if (this.bots) {
        this.bots.update(dt);
        this.bots.handleRespawns(dt);
      }
      this.updatePickups(dt, this.time);
      this.updateZone(dt);
      this.updateAirdrop(dt);
      this.updateInteract();
      this.world.update(dt, this.player.pos);
      this.hud.update(dt);
      if (this.zoneMesh) { this.zoneMat.uniforms.uTime.value = this.time; }
      if (this.airdropPos) { /* smoke */ }
      // periodic HUD update
      if (this.time - this.lastHud > 0.2) {
        this.lastHud = this.time;
        this.hud.updateAlive();
        this.hud.updateVitals();
      }
    } else {
      this.world.update(dt, this.player.pos);
    }
    this.effects.update(dt);
  }

  updateInteract() {
    if (this.vehicle) {
      document.getElementById('interact-hint').classList.add('hidden');
      const ti = document.getElementById('t-interact');
      if (ti) ti.classList.add('hidden');
      return;
    }
    const v = this.nearestVehicle(4);
    const hint = document.getElementById('interact-hint');
    const ti = document.getElementById('t-interact');
    if (v && this.player.alive) {
      hint.classList.remove('hidden');
      document.getElementById('interact-text').textContent = 'ENTER VEHICLE';
      hint.querySelector('kbd').textContent = 'F';
      if (ti) { ti.classList.remove('hidden'); ti.textContent = 'ENTER'; }
    } else {
      hint.classList.add('hidden');
      if (ti) ti.classList.add('hidden');
    }
  }

  updateAirdrop(dt) {
    if (!this.mode.airdrop || this.over) return;
    if (!this.airdrop && this.matchTime > this.airdropTimer) {
      const z = this.zone;
      let x = 0, zz = 0;
      for (let i = 0; i < 20; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * z.radius * 0.8;
        x = z.center.x + Math.cos(a) * r; zz = z.center.z + Math.sin(a) * r;
        if (this.world.heightAt(x, zz) > 1) break;
      }
      const y = this.world.heightAt(x, zz);
      const model = createPickupModel('airdrop', 'longshot');
      model.position.set(x, y + 55, zz);
      model.scale.setScalar(1.25);
      this.scene.add(model);
      this.airdrop = { model, x, z: zz, y, t: 0, landed: false };
      this.airdropPos = { x, z: zz };
      this.hud.banner('AIRDROP INBOUND', 'LEGENDARY CRATE DETECTED', 3200);
      audio.airdrop();
      this.hud.updateAlive();
    }
    if (this.airdrop && !this.airdrop.landed) {
      const a = this.airdrop;
      a.t += dt;
      a.model.position.y = Math.max(a.y, a.model.position.y - dt * 10);
      a.model.rotation.y += dt * 0.4;
      this.effects.smoke(a.model.position.clone().add(new THREE.Vector3(0, 1, 0)), '#d8d0c0', 0.1, 1.5, 0.8);
      if (a.model.position.y <= a.y) {
        a.landed = true;
        a.model.position.y = a.y;
        this.pickups.push({ x: a.x, z: a.z, y: a.y, kind: 'airdrop', weaponId: 'longshot', model: a.model, active: true, baseY: a.y, t: 0 });
        this.effects.smoke(new THREE.Vector3(a.x, a.y + 0.6, a.z), '#ff9d4a', 0.3, 2, 2);
      }
    }
    if (this.airdropPos && Math.random() < dt * 1.5) {
      this.effects.smoke(new THREE.Vector3(this.airdropPos.x + rand(-1, 1), this.world.heightAt(this.airdropPos.x, this.airdropPos.z) + 0.5, this.airdropPos.z + rand(-1, 1)), '#ff8a3a', 0.22, 1.5, 2.4);
    }
  }

  pause() {
    if (this.over || this.paused) return;
    this.paused = true;
    this.input.setEnabled(false);
    this.hud.togglePause(true);
  }
  resume() {
    if (this.over) return;
    this.paused = false;
    this.hud.togglePause(false);
    this.input.setEnabled(true);
    if (!this.input.isTouch) {
      try { this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch {}
    }
  }
  openSettings() {
    this.paused = true;
    this.input.setEnabled(false);
    this.hud.togglePause(false);
    this.app.openSettings(() => { if (!this.over) this.resume(); });
  }

  dispose() {
    this.active = false;
    this.input.setEnabled(false);
    this.input.clearListeners();
    audio.stopEngine();
    this.scene.traverse(o => {
      if (o.isMesh || o.isPoints || o.isLine) {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
      }
    });
    this.scene.clear();
    this.hud.hide();
    this.hud.hideResults();
    this.hud.togglePause(false);
    this.hud.root.classList.remove('driving', 'dead', 'dropping');
    this.world.dispose();
    if (this.bots) this.bots.dispose();
    this.vehicles.length = 0;
    this.pickups.length = 0;
  }
}
