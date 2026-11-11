import * as THREE from 'three';
import { clamp, damp, rand, randInt, pick, deg, angleDelta } from './utils.js';
import { createHumanoid, createNameTag, createWeaponModel, createPickupModel } from './models.js';
import { WEAPONS, OUTFITS, SKINS, HELMETS, BOT_NAMES } from './config.js';
import { audio } from './audio.js';

const BOT_OUTFITS = ['#252b33', '#2f3b33', '#3d3134', '#32322d', '#293546', '#463a2a', '#3a2c38', '#2c3c45'];
const BOT_PANTS = ['#343c46', '#2a312e', '#3a2e30', '#2c2c28', '#2c3540', '#3b3227', '#2f2632', '#2a343c'];
const ACCENTS = ['#ff7a1a', '#ff4545', '#25ddc3', '#ffc74a', '#9c7dff', '#4fa8ff'];

class Bot {
  constructor(mgr, opts) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.world = mgr.world;
    this.name = opts.name;
    this.team = opts.team;
    this.teamColor = this.team === 0 && mgr.game.mode.id !== 'br' ? '#25ddc3' : '#ff5a45';
    this.outfit = opts.outfit;
    this.skin = opts.skin;
    this.helmet = opts.helmet;
    this.weaponDef = opts.weapon;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.pos = new THREE.Vector3(opts.x, opts.y, opts.z);
    this.vel = new THREE.Vector3();
    this.yaw = rand(0, Math.PI * 2);
    this.state = 'patrol';
    this.target = null;
    this.targetTimer = 0;
    this.fireTimer = rand(0.4, 1.6);
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.dest = new THREE.Vector3(opts.x + rand(-12, 12), 0, opts.z + rand(-12, 12));
    this.speed = rand(2.6, 4.4);
    this.skill = rand(0.35, 0.78);
    this.lastDamage = -99;
    this.deadTime = 0;
    this.stuckTimer = 0;
    this.respawnTimer = 0;
    this.walkPhase = 0;
    this.kills = 0;
    this.tagTimer = 0;
    this.prevPos = new THREE.Vector3().copy(this.pos);
    this.buildModel();
  }

  buildModel() {
    const outfitColors = { top: this.outfit, pants: this.pants || pick(BOT_PANTS), accent: pick(ACCENTS), vest: '#161a1f' };
    this.model = createHumanoid({
      outfit: outfitColors, skin: this.skin, helmet: this.helmet,
      backpack: Math.random() > 0.4 ? 'recon' : 'none',
      weapon: this.weaponDef.id,
      teamColor: this.game.mode.id !== 'br' ? this.teamColor : null
    });
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    this.model.userData.bot = this;
    this.game.scene.add(this.model);
    this.parts = this.model.userData.parts;
    this.hitMeshes = [];
    const mark = (obj, zone) => {
      obj.traverse(o => {
        if (o.isMesh && !o.userData.weapon) { o.userData.hitZone = zone; o.userData.bot = this; this.hitMeshes.push(o); }
      });
    };
    mark(this.parts.head, 'head');
    const headSet = new Set(this.hitMeshes);
    this.hitMeshes = [];
    mark(this.parts.head, 'head');
    // torso includes vest/body meshes attached to group; traverse specific known meshes by geometry proximity
    this.model.traverse(o => {
      if (!o.isMesh || o.userData.weapon) return;
      if (headSet.has(o)) return;
      let p = o; let wy = 0;
      while (p && p !== this.model) { wy += p.position.y; p = p.parent; }
      if (wy > 1.48) o.userData.hitZone = 'head';
      else if (wy < 0.95) o.userData.hitZone = 'leg';
      else o.userData.hitZone = 'body';
      o.userData.bot = this;
      if (!this.hitMeshes.includes(o)) this.hitMeshes.push(o);
    });
    // remove gun meshes
    this.hitMeshes = this.hitMeshes.filter(m => !m.userData.weapon && m.parent);
    // team ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.teamColor), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    this.model.add(ring); this.ring = ring;
    // tag
    this.tag = createNameTag(this.name, this.team === 0 && this.game.mode.id !== 'br' ? '#6ff5e0' : '#ffb3a8');
    this.model.add(this.tag);
    this.updateTag();
    this.model.updateMatrixWorld(true);
  }

  updateTag() {
    if (!this.tag) return;
    const c = document.createElement('canvas'); c.width = 256; c.height = 84;
    const ctx = c.getContext('2d');
    const col = this.team === 0 && this.game.mode.id !== 'br' ? '#6ff5e0' : '#ff8d80';
    ctx.fillStyle = 'rgba(4,7,10,.55)';
    ctx.fillRect(8, 2, 240, 80);
    ctx.font = '600 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = col;
    ctx.fillText(this.name.toUpperCase(), 128, 28);
    const k = clamp(this.health / this.maxHealth, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(28, 42, 200, 7);
    ctx.fillStyle = k > 0.5 ? '#42e6a4' : k > 0.25 ? '#ffc74a' : '#ff4b4b';
    ctx.fillRect(28, 42, 200 * k, 7);
    ctx.font = '600 13px "Rajdhani", sans-serif'; ctx.fillStyle = '#9fb0bd';
    ctx.fillText(`${this.weaponDef.short}  ·  ${Math.ceil(this.health)}`, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this.tag.material.map) this.tag.material.map.dispose();
    this.tag.material.map = tex;
    this.tag.material.needsUpdate = true;
    this.tag.scale.set(2.05, 0.67, 1);
    this.tag.position.y = 2.25;
    this.tag.userData.lastHealth = this.health;
  }

  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z); }
  center() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z); }

  takeDamage(amount, killer, point, head = false, def = null) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamage = this.game.time;
    this.state = 'attack';
    if (killer && killer !== this) {
      this.target = killer;
      this.targetTimer = 4;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die(killer, head, def);
    } else {
      this.updateTag();
      this.tag.material.opacity = 1;
    }
  }

  die(killer, head = false, def = null) {
    if (!this.alive) return;
    this.alive = false;
    this.deadTime = this.game.time;
    this.state = 'dead';
    this.target = null;
    this.vel.set(0, 0, 0);
    if (this.tag) this.tag.visible = false;
    if (this.ring) this.ring.visible = false;
    // ragdoll-ish fall
    const dir = killer && killer.pos ? Math.sign(this.pos.x - killer.pos.x) || 1 : 1;
    this.fallDir = dir;
    this.game.onBotKilled?.(this, killer, head, def);
    // loot
    this.game.dropBotLoot?.(this);
  }

  respawn(x, z) {
    this.alive = true;
    this.health = 100;
    this.pos.set(x, this.world.heightAt(x, z) + 0.05, z);
    this.vel.set(0, 0, 0);
    this.state = 'patrol';
    this.target = null;
    this.model.visible = true;
    this.model.position.copy(this.pos);
    this.model.rotation.set(0, this.yaw, 0);
    if (this.tag) this.tag.visible = true;
    if (this.ring) this.ring.visible = true;
    this.updateTag();
    this.model.updateMatrixWorld(true);
  }

  fireAt(target) {
    const def = this.weaponDef;
    const dist = this.center().distanceTo(target.center ? target.center() : target.pos);
    const muzzle = this.center().add(new THREE.Vector3(-Math.sin(this.yaw) * 0.5, 0.1, -Math.cos(this.yaw) * 0.5));
    const targetPos = target.center ? target.center() : target.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const targetVel = target.vel ? Math.hypot(target.vel.x, target.vel.z) : 0;
    let chance = clamp(0.8 - dist * 0.009 - targetVel * 0.026, 0.1, 0.75) * this.skill;
    if (target.crouching) chance *= 0.8;
    if (target.aiming) chance *= 0.92;
    const hit = Math.random() < chance;
    const end = hit ? targetPos.clone() : targetPos.clone().add(new THREE.Vector3(rand(-1.6, 1.6), rand(-0.8, 1.2), rand(-1.6, 1.6)));
    this.game.effects.tracer(muzzle, end, 0xffb066);
    this.game.effects.muzzle(muzzle, '#ffcc88', 0.8);
    audio.shot(def.model, this.pos.distanceTo(this.game.player.pos));
    if (hit) {
      let dmg = def.dmg * rand(0.55, 0.85);
      if (def.pellets > 1) dmg *= rand(0.4, 0.9);
      if (target === this.game.player) target.takeDamage(Math.round(dmg), this);
      else target.takeDamage(Math.round(dmg), this);
      this.game.effects.impact(end, null, '#ffb060', true);
    } else {
      this.game.effects.impact(end, null, '#ffd08a', false);
    }
    if (target === this.game.player) this.game.hud?.nearMiss(end);
  }

  update(dt) {
    if (!this.alive) {
      // death animation & cleanup
      if (this.model) {
        const k = clamp((this.game.time - this.deadTime) / 0.6, 0, 1);
        this.model.rotation.z = this.fallDir * k * Math.PI * 0.48;
        this.model.position.y = this.pos.y + Math.sin(k * Math.PI) * 0.15 - Math.max(0, (this.game.time - this.deadTime - 5)) * 0.4;
        if (this.game.time - this.deadTime > 7.5) { this.remove(); }
      }
      return;
    }
    this.prevPos.copy(this.pos);
    const now = this.game.time;
    this.targetTimer -= dt;
    this.fireTimer -= dt;

    // target acquisition
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.32 + Math.random() * 0.28;
      this.target = this.mgr.findTarget(this);
      this.state = this.target ? 'attack' : 'patrol';
      if (!this.target) this.pickDestination();
    }
    if (this.target && (!this.target.alive)) this.target = null;

    let moveX = 0, moveZ = 0;
    let faceYaw = this.yaw;
    if (this.target) {
      const tp = this.target.center ? this.target.center() : this.target.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
      const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      faceYaw = Math.atan2(-dx, -dz);
      const ideal = this.weaponDef.model === 'shotgun' ? 9 : this.weaponDef.model === 'sniper' ? 45 : this.weaponDef.model === 'smg' ? 15 : 24;
      let forward = 0;
      if (dist > ideal + 4) forward = 1;
      else if (dist < ideal - 5) forward = -0.7;
      const strafe = this.strafeDir;
      if (Math.random() < 0.006) this.strafeDir *= -1;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      moveX = (nx * forward + -nz * strafe * 0.72) * this.speed;
      moveZ = (nz * forward + nx * strafe * 0.72) * this.speed;
      // shooting
      if (this.fireTimer <= 0 && dist < 75) {
        const eye = this.eye(), targetEye = this.target.eye ? this.target.eye() : this.target.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const dir = targetEye.clone().sub(eye); const d = dir.length(); dir.normalize();
        const blocked = this.world.rayBlock(eye, dir, d);
        if (blocked >= d - 1.2) {
          this.fireTimer = 60 / this.weaponDef.rpm * rand(1.6, 3.2) + 0.15;
          this.fireAt(this.target);
          // burst
          if (this.weaponDef.auto && Math.random() > 0.35) {
            const self = this;
            setTimeout(() => { if (self.alive && self.target && self.target.alive) self.fireAt(self.target); }, 110);
          }
        } else {
          this.fireTimer = 0.5;
        }
      }
    } else {
      // patrol
      const dx = this.dest.x - this.pos.x, dz = this.dest.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.5) this.pickDestination();
      else {
        moveX = dx / dist * this.speed * 0.55;
        moveZ = dz / dist * this.speed * 0.55;
        faceYaw = Math.atan2(-dx, -dz);
      }
    }
    // avoid water
    if (this.world.heightAt(this.pos.x, this.pos.z) < 0.3) {
      moveX += (0 - this.pos.x) * 0.03; moveZ += (0 - this.pos.z) * 0.03;
    }
    this.vel.x = damp(this.vel.x, moveX, 8, dt);
    this.vel.z = damp(this.vel.z, moveZ, 8, dt);
    this.vel.y -= 20 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collide(this.pos, 0.42, this.pos.y);
    this.pos.y += this.vel.y * dt;
    const gy = Math.max(this.world.heightAt(this.pos.x, this.pos.z), this.world.sea - 0.8);
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; }
    // stuck check
    const moved = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
    if (moved < 0.002 && (this.vel.x || this.vel.z)) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) { this.stuckTimer = 0; this.pickDestination(); this.strafeDir *= -1; this.pos.x += rand(-1, 1); this.pos.z += rand(-1, 1); }
    } else this.stuckTimer = 0;

    // face target smoothly
    this.yaw += angleDelta(this.yaw, faceYaw) * Math.min(1, dt * 7);
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    this.model.rotation.z = damp(this.model.rotation.z, 0, 8, dt);
    // walk animation
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * spd * 2.1;
    const swing = Math.min(1, spd / 3) * 0.55;
    this.parts.leftLeg.rotation.x = Math.sin(this.walkPhase) * swing;
    this.parts.rightLeg.rotation.x = -Math.sin(this.walkPhase) * swing;
    this.parts.leftArm.rotation.x = -1.32 + Math.sin(this.walkPhase) * swing * 0.18;
    this.parts.rightArm.rotation.x = -1.18 - Math.sin(this.walkPhase) * swing * 0.1;
    this.parts.torso.position.y = 1.2 + Math.abs(Math.sin(this.walkPhase)) * 0.018 * Math.min(1, spd);
    this.model.updateMatrixWorld();
    // tag visibility
    const distToPlayer = this.pos.distanceTo(this.game.player.pos);
    if (this.tag) {
      this.tag.visible = distToPlayer < 55 || (this.game.time - this.lastDamage < 6);
      this.tag.material.opacity = clamp(1.8 - distToPlayer / 45, 0.25, 1);
    }
    if (this.ring) this.ring.visible = distToPlayer < 70;
    // health tag refresh
    if (this.tagTimer < this.game.time && this.tag && this.tag.userData.lastHealth !== this.health) {
      this.tagTimer = this.game.time + 0.25;
      this.updateTag();
    }
  }

  pickDestination() {
    const nearPoi = this.mgr.poiCenters[randInt(0, this.mgr.poiCenters.length - 1)];
    if (Math.random() > 0.35 && nearPoi) {
      const a = rand(0, Math.PI * 2), r = rand(4, nearPoi.r * 0.9);
      this.dest.set(nearPoi.x + Math.cos(a) * r, 0, nearPoi.z + Math.sin(a) * r);
    } else {
      this.dest.set(this.pos.x + rand(-24, 24), 0, this.pos.z + rand(-24, 24));
    }
  }

  remove() {
    if (this.model) {
      this.game.scene.remove(this.model);
      this.model.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); });
      this.model = null;
    }
    this.mgr.remove(this);
  }
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.map = game.map;
    this.mode = game.mode;
    this.bots = [];
    this.virtualAlive = 0;
    this.virtualNames = [];
    this.virtualTimer = 0;
    this.poiCenters = game.world.poiCenters;
    this.usedNames = new Set();
    this.teamScores = [0, 0];
    this.spawnAll();
  }

  get aliveReal() { return this.bots.filter(b => b.alive).length; }
  get aliveCount() {
    const playerAlive = this.game.player.alive ? 1 : 0;
    return playerAlive + this.aliveReal + this.virtualAlive;
  }
  get enemies() { return this.bots.filter(b => b.alive && b.team !== 0); }

  nextName() {
    const available = BOT_NAMES.filter(n => !this.usedNames.has(n));
    const name = available.length ? pick(available) : 'BOT' + randInt(10, 99);
    this.usedNames.add(name);
    return name;
  }

  spawnAll() {
    const mode = this.mode;
    const isTDM = mode.id === 'tdm';
    const isTraining = mode.id === 'training';
    this.virtualAlive = mode.id === 'br' ? Math.max(0, mode.players - 1 - mode.realBots) : 0;
    for (let i = 0; i < (mode.players - 1 - this.virtualAlive); i++) {
      const team = isTDM ? (i < 4 ? 0 : 1) : isTraining ? 1 : (i + 1);
      const sp = this.pickSpawn(isTDM || isTraining ? team : -1, i);
      const def = pick(Object.values(WEAPONS).filter(w => !isTDM || w.slot === 'primary'));
      const bot = new Bot(this, {
        x: sp.x, z: sp.z, y: sp.y != null ? sp.y : this.world.heightAt(sp.x, sp.z),
        name: this.nextName(), team,
        outfit: pick(BOT_OUTFITS), pants: pick(BOT_PANTS), skin: pick(SKINS).color,
        helmet: pick(HELMETS.slice(1)).id, weapon: def
      });
      this.bots.push(bot);
    }
    for (let i = 0; i < this.virtualAlive; i++) this.virtualNames.push(this.nextName());
    this.virtualTimer = rand(14, 26);
  }

  pickSpawn(team, index) {
    const g = this.game;
    if (team === 0 && index < 4) {
      // teammate near player
      return { x: g.player.pos.x + rand(-9, 9), z: g.player.pos.z + rand(-9, 9) };
    }
    if (team === 1) {
      let best = null, bestScore = -1;
      for (let i = 0; i < 12; i++) {
        const sp = pick(this.world.spawnPoints);
        if (!sp) break;
        const d = Math.hypot(sp.x - g.player.pos.x, sp.z - g.player.pos.z);
        const score = Math.min(120, Math.abs(d - 45)) + rand(0, 15);
        if (bestScore < 0 || score < bestScore) { bestScore = score; best = sp; }
      }
      if (best) return best;
    }
    // random far from player for BR
    for (let i = 0; i < 16; i++) {
      const sp = pick(this.world.spawnPoints);
      if (!sp) break;
      const d = Math.hypot(sp.x - g.player.pos.x, sp.z - g.player.pos.z);
      if (d > 40 || i > 12) return sp;
    }
    return pick(this.world.spawnPoints) || { x: rand(-80, 80), z: rand(-80, 80) };
  }

  findTarget(bot) {
    const g = this.game;
    const candidates = [];
    const player = g.player;
    if (player.alive && (this.mode.id !== 'tdm' || bot.team !== 0)) {
      const d = bot.pos.distanceTo(player.pos);
      if (d < 68) candidates.push({ t: player, d });
    }
    for (const b of this.bots) {
      if (b === bot || !b.alive) continue;
      if (b.team === bot.team) continue;
      if (this.mode.id !== 'br' && b.team === bot.team) continue;
      const d = bot.pos.distanceTo(b.pos);
      if (d < 55) candidates.push({ t: b, d: d * 1.25 });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates.slice(0, 3)) {
      const eye = bot.eye();
      const tp = c.t.center ? c.t.center() : c.t.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      const dir = tp.clone().sub(eye); const d = dir.length(); dir.normalize();
      if (this.world.rayBlock(eye, dir, d) >= d - 0.6) return c.t;
    }
    return null;
  }

  update(dt) {
    if (!this.game.dropDone) return;
    for (const bot of this.bots) bot.update(dt);
    // virtual BR attrition
    if (this.mode.id === 'br' && this.virtualAlive > 0 && this.game.time > 18) {
      this.virtualTimer -= dt;
      if (this.virtualTimer <= 0) {
        this.virtualTimer = rand(2.2, 6.4);
        const victim = this.virtualNames.pop() || 'UNKNOWN';
        const killer = Math.random() > 0.5 && this.virtualNames.length ? pick(this.virtualNames) : pick(BOT_NAMES);
        this.virtualAlive--;
        this.game.onVirtualKill?.(killer, victim);
      }
    }
  }

  notifyKill(killerTeam, victimTeam) {
    if (this.mode.id !== 'tdm') return;
    // team 0 = player's team; the game controller resolves the winner
    this.teamScores[killerTeam] = (this.teamScores[killerTeam] || 0) + 1;
    this.game.onTeamScore?.(this.teamScores);
  }

  handleRespawns(dt) {
    if (!this.mode.respawn) return;
    for (const bot of this.bots) {
      if (!bot.alive && bot.model && this.game.time - bot.deadTime > 3.2) {
        let sp;
        if (this.mode.id === 'tdm' && bot.team === 1) {
          // spawn away from player
          sp = pick(this.world.spawnPoints.filter(s => Math.hypot(s.x - this.game.player.pos.x, s.z - this.game.player.pos.z) > 35)) || pick(this.world.spawnPoints);
        } else sp = this.pickSpawn(bot.team, 99);
        bot.respawn(sp.x, sp.z);
      }
    }
  }

  remove(bot) {
    const i = this.bots.indexOf(bot);
    if (i >= 0) this.bots.splice(i, 1);
  }

  getScoreboardData() {
    const rows = [{ name: this.game.profile.name.toUpperCase(), kills: this.game.player.kills, dmg: Math.round(this.game.player.damageDealt), me: true, alive: this.game.player.alive }];
    for (const b of this.bots) rows.push({ name: b.name.toUpperCase(), kills: b.kills, dmg: 0, alive: b.alive, team: b.team });
    rows.sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.kills - a.kills);
    return rows;
  }

  dispose() {
    for (const b of this.bots) {
      if (b.model) {
        this.game.scene.remove(b.model);
        b.model.traverse(o => {
          if (o.isMesh) { o.geometry?.dispose?.(); }
          if (o.material?.map) o.material.map.dispose?.();
        });
      }
    }
    this.bots.length = 0;
  }
}
