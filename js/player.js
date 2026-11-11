import * as THREE from 'three';
import { clamp, damp, lerp, rand, deg } from './utils.js';
import { WEAPONS, LOOT_RARITY, AMMO_TYPES, WEAPON_AMMO, MED_ITEMS } from './config.js';
import { operatorOf } from './profile.js';
import { createWeaponModel } from './models.js';
import { audio } from './audio.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;

export class Player {
  constructor(game, profile) {
    this.game = game;
    this.profile = profile;
    this.operator = operatorOf(profile.operator);
    this.camera = game.camera;
    this.scene = game.scene;
    this.world = game.world;
    this.pos = new THREE.Vector3(0, 40, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eyeHeight = EYE_STAND;
    this.grounded = false;
    this.maxHealth = this.operator.stats.health;
    this.health = this.maxHealth; this.shield = 0; this.maxShield = 100;
    this.alive = true;
    this.kills = 0; this.damageDealt = 0; this.headshots = 0; this.shots = 0; this.hits = 0;
    this.mode = 'fps';
    this.speed = 0;
    this.bobPhase = 0;
    this.recoilPitch = 0; this.recoilYaw = 0; this.recoilRoll = 0;
    this.landKick = 0;
    this.inWater = false;
    this.bandages = 3; this.medkits = 2; this.trauma = 0; this.shields = 1;
    this.useCooldown = 0;
    this.medChannel = null;
    this.stepTimer = 0;
    this.lastDamageTime = 0;
    this.regenTimer = 0;
    this.sprinting = false;
    this.crouching = false;
    this.aiming = false;
    this.adsAmount = 0;
    this.scoped = false;
    this.spreadHeat = 0;
    this.weaponIndex = 0;
    this.reloadTimer = 0;
    this.reloadDuration = 2;
    this.fireTimer = 0;
    this.switchTimer = 0;
    this.muzzleTimer = 0;
    this.weaponKick = 0;
    this.weaponRoll = 0;
    this.cameraShake = 0;
    this.weapons = [];
    this.baseFov = profile.settings.fov || 74;
    // operator ability state
    this.abilityDef = this.operator.active;
    this.abilityCooldown = 0;
    this.abilityLeft = 0;
    this.abilityAnim = 0;
    this.overclockLeft = 0;
    this.adrenalineLeft = 0;
    this.cloakLeft = 0;
    this.bulwarkBonus = 0;
    this.blinkImmune = 0;
    this.reloadSurge = 0;
    this.breath = 1;
    this.holdingBreath = false;
    this.scopeSway = 0;
    this.viewGroup = new THREE.Group();
    this.camera.add(this.viewGroup);
    this.gunRoot = null;
    this.weaponModel = null;
    this.hands = null;
    this.setupWeapons();
  }

  setupWeapons() {
    const g = this.game;
    const m = g.mode;
    const ids = [this.profile.primary, this.profile.secondary];
    const rarities = ['UNCOMMON', 'COMMON'];
    ids.forEach((id, i) => {
      const def = WEAPONS[id] || WEAPONS[ids.length === 1 ? 'vanguard' : i === 0 ? 'vanguard' : 'sidearm'];
      const rarity = rarities[i] || 'COMMON';
      const reserve = m.infiniteAmmo ? 999 : Math.round(def.reserve * (m.startAmmo || 1));
      const w = this.makeWeapon(def, rarity, reserve);
      this.weapons.push(w);
    });
    this.equip(0, true);
    this.health = this.maxHealth;
    this.shield = Math.min(this.maxShield, (m.armor || 0) + this.operator.stats.armor * 0.5);
  }

  makeWeapon(def, rarity = 'COMMON', reserve = null) {
    const tier = LOOT_RARITY[rarity] || LOOT_RARITY.COMMON;
    const w = {
      def, rarity, attachments: [...tier.attachments],
      mag: Math.round(def.mag * tier.mag),
      reserve: reserve == null ? Math.round(def.reserve * (0.6 + tier.tier * 0.2)) : reserve,
      picked: false
    };
    return w;
  }

  magCapacity(w = this.weapon) {
    const tier = LOOT_RARITY[w?.rarity] || LOOT_RARITY.COMMON;
    return Math.max(1, Math.round(w.def.mag * tier.mag));
  }

  reserveFor(w = this.weapon) { return this.game.mode.infiniteAmmo ? '∞' : w.reserve; }

  ammoType(w = this.weapon) { return AMMO_TYPES[WEAPON_AMMO[w.def.id]] || AMMO_TYPES['556']; }

  rarityTier(w = this.weapon) { return (LOOT_RARITY[w?.rarity] || LOOT_RARITY.COMMON).tier; }

  reloadMultiplier() {
    const tier = LOOT_RARITY[this.weapon?.rarity] || LOOT_RARITY.COMMON;
    return (tier.reload || 1) * (this.operator.stats.reload || 1) * (this.weapon?.attachments?.includes('match') ? 0.92 : 1) * (this.reloadSurge > 0 ? 0.92 : 1);
  }

  recoilMultiplier() {
    const tier = LOOT_RARITY[this.weapon?.rarity] || LOOT_RARITY.COMMON;
    const comp = this.weapon?.attachments?.includes('comp') ? 0.82 : 1;
    const oc = this.overclockLeft > 0 ? 0.65 : 1;
    return (tier.recoil || 1) * (this.operator.stats.recoil || 1) * comp * oc;
  }

  damageMultiplier() {
    const tier = LOOT_RARITY[this.weapon?.rarity] || LOOT_RARITY.COMMON;
    const match = this.weapon?.attachments?.includes('match') ? 1.05 : 1;
    const sniperPassive = this.weapon?.def.model === 'sniper' && this.operator.passive.id === 'steady' ? 1.12 : 1;
    return (tier.dmg || 1) * (this.operator.stats.damage || 1) * match * sniperPassive;
  }

  spawn(x, z, y = null) {
    const gy = y != null ? y : this.world.heightAt(x, z);
    this.pos.set(x, gy + 0.05, z);
    this.vel.set(0, 0, 0);
    this.yaw = rand(0, Math.PI * 2); this.pitch = 0;
    this.alive = true;
    this.mode = 'fps';
    this.eyeHeight = EYE_STAND;
    this.syncCamera(0);
  }

  get weapon() { return this.weapons[this.weaponIndex]; }
  get def() { return this.weapon.def; }

  equip(i, instant = false) {
    if (i < 0 || i >= this.weapons.length) return;
    if (this.weaponIndex === i && !instant) return;
    this.weaponIndex = i;
    this.reloadTimer = 0;
    this.switchTimer = instant ? 0 : 0.28;
    this.fireTimer = Math.max(this.fireTimer, 0.2);
    this.buildViewModel();
    if (!instant) audio.equip();
    this.game.onWeaponChanged?.();
  }

  equipId(id, rarity = 'COMMON', instant = false) {
    // replace current slot with picked-up weapon, or upgrade an existing one
    const def = WEAPONS[id];
    if (!def) return false;
    const existing = this.weapons.findIndex(w => w.def.id === id);
    if (existing >= 0) {
      const cur = this.weapons[existing];
      if ((LOOT_RARITY[rarity] || LOOT_RARITY.COMMON).tier >= (LOOT_RARITY[cur.rarity] || LOOT_RARITY.COMMON).tier) {
        const keepMag = cur.mag;
        Object.assign(cur, this.makeWeapon(def, rarity, cur.reserve));
        cur.mag = Math.min(keepMag, this.magCapacity(cur));
      }
      cur.reserve += Math.round(def.reserve * 0.5);
      this.equip(existing, instant);
      return 'upgrade';
    }
    let slot = def.slot === 'secondary' ? 1 : 0;
    if (slot >= this.weapons.length) slot = this.weapons.length - 1;
    this.weapons[slot] = this.makeWeapon(def, rarity, Math.round(def.reserve * 0.7));
    this.equip(slot, instant);
    return true;
  }

  buildViewModel() {
    if (this.gunRoot) {
      this.viewGroup.remove(this.gunRoot);
      this.gunRoot.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); } });
      this.gunRoot = null;
    }
    const def = this.def;
    const g = new THREE.Group();
    const weapon = createWeaponModel(def.id, this.profile.outfitAccent);
    weapon.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    weapon.scale.setScalar(0.78);
    g.add(weapon);
    // gloved hands
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x1b2025, roughness: 0.8 });
    const glove1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.16), skinMat); glove1.position.set(0.01, -0.12, 0.1); g.add(glove1);
    const glove2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.17), skinMat); glove2.position.set(-0.03, -0.05, -0.22); glove2.rotation.x = -0.15; g.add(glove2);
    const armMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.profile.outfitTop || '#252b33'), roughness: 0.9 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.36), armMat); arm1.position.set(0.08, -0.26, 0.2); arm1.rotation.x = 0.2; g.add(arm1);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), armMat); arm2.position.set(-0.08, -0.19, -0.1); arm2.rotation.x = -0.1; g.add(arm2);
    this.viewGroup.add(g);
    this.gunRoot = g;
    this.weaponModel = weapon;
    g.scale.setScalar(0.68);
    this.gunBasePos = new THREE.Vector3(0.22, -0.21, -0.58);
    this.gunAdsPos = new THREE.Vector3(0, -0.135, -0.44);
    g.position.copy(this.gunBasePos);
    g.rotation.set(0.01, 0.02, 0);
    this.game.onWeaponChanged?.();
  }

  /* ---------------- movement ---------------- */
  update(dt, input) {
    if (!this.alive) { this.updateCameraShake(dt); return; }
    this.updateAbility(dt);
    this.updateMedical(dt);
    this.abilityAnim = damp(this.abilityAnim, 0, 6, dt);
    const look = input.consumeLook();
    const lookScale = input.isTouch ? 0.0045 : 0.0022;
    const sens = (this.profile.settings.sens || 1) * (this.aiming ? 0.62 : 1) * lookScale;
    this.yaw -= look.dx * sens * (this.profile.settings.inverted ? -1 : 1);
    this.pitch -= look.dy * sens;
    this.pitch = clamp(this.pitch, -1.42, 1.42);

    this.aiming = this.mode === 'fps' && (input.aiming);
    this.adsAmount = damp(this.adsAmount, this.aiming ? 1 : 0, 12, dt);
    const scopedNow = this.aiming && this.def.zoom > 3 && this.adsAmount > 0.6;
    if (scopedNow && !this.scoped) this.breath = 1;
    this.scoped = scopedNow;
    this.holdingBreath = this.scoped && input.keys.has('ShiftLeft');
    if (this.holdingBreath) this.breath = Math.max(0, this.breath - dt * 0.2);
    else this.breath = Math.min(1, this.breath + dt * 0.16);
    const swayScale = this.operator.passive.id === 'steady' ? 0.72 : 1;
    this.scopeSway = this.scoped ? (this.holdingBreath ? 0.18 : 1) * swayScale * (0.4 + 0.6 * (1 - this.breath)) : 0;

    const crouchWanted = input.crouching && this.mode === 'fps';
    this.crouching = crouchWanted;
    const targetEye = crouchWanted ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);

    let wx = 0, wz = 0;
    if (this.mode === 'fps') {
      const f = input.forward, s = input.strafe;
      const len = Math.hypot(f, s);
      const wantSprint = input.sprinting || this.profile.settings.autoSprint !== false;
      const sprinting = wantSprint && !this.aiming && !crouchWanted && f > 0.2 && !this.medChannel;
      this.sprinting = sprinting;
      let speed = crouchWanted ? 2.6 : (sprinting ? 7.2 : 4.85);
      if (this.aiming) speed = 2.9;
      if (this.inWater) speed *= 0.6;
      if (this.medChannel) speed *= 0.55;
      speed *= (this.operator.stats.speed || 1) * (this.adrenalineLeft > 0 ? 1.28 : 1);
      if (this.overclockLeft > 0) speed *= 1.04;
      if (len > 0.01) {
        const nf = f / Math.max(len, 1), ns = s / Math.max(len, 1);
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        wx = (-sin * nf + cos * ns) * speed;
        wz = (-cos * nf - sin * ns) * speed;
      }
    }
    const accel = this.grounded ? 14 : 3.2;
    this.vel.x = damp(this.vel.x, wx, accel, dt);
    this.vel.z = damp(this.vel.z, wz, accel, dt);
    this.vel.y -= 21 * dt;

    const oldY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collide(this.pos, 0.4, this.pos.y);
    this.pos.y += this.vel.y * dt;

    const ground = Math.max(this.world.heightAt(this.pos.x, this.pos.z), this.world.sea - 0.82);
    this.inWater = this.world.heightAt(this.pos.x, this.pos.z) < this.world.sea - 0.1;
    if (this.pos.y <= ground) {
      if (this.vel.y < -7) { this.landKick = clamp(-this.vel.y * 0.008, 0.02, 0.09); audio.land(); }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // footsteps + bob
    if (this.grounded && this.speed > 1.2) {
      this.bobPhase += dt * (this.sprinting ? 11 : 8) * (this.crouching ? 0.6 : 1);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = (this.sprinting ? 0.27 : 0.38) * (this.operator.passive.id === 'ghoststep' ? 1.55 : 1);
        audio.step(this.operator.passive.id === 'ghoststep' ? 0.55 : 1);
      }
    }
    this.landKick = damp(this.landKick, 0, 8, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    this.recoilRoll = damp(this.recoilRoll, 0, 8, dt);
    this.cameraShake = damp(this.cameraShake, 0, 11, dt);

    // health regen after 9s, scaled by operator regeneration
    if (this.alive && this.health < this.maxHealth && this.game.time - this.lastDamageTime > 9) {
      this.health = Math.min(this.maxHealth, this.health + dt * 3.2 * (this.operator.stats.regen || 1) * (this.adrenalineLeft > 0 ? 2.2 : 1));
    }
    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.syncCamera(dt);
    this.updateWeapon(dt, input);
    this.updateViewModel(dt);
  }

  syncCamera(dt) {
    const bobAmt = clamp(this.speed / 7, 0, 1) * (this.grounded ? 1 : 0) * (1 - this.adsAmount * 0.8);
    const bx = Math.cos(this.bobPhase) * 0.035 * bobAmt;
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.045 * bobAmt;
    const shake = this.cameraShake;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    this.camera.position.set(
      this.pos.x + bx * Math.cos(this.yaw) + sx,
      this.pos.y + this.eyeHeight + by - this.landKick + sy,
      this.pos.z - bx * Math.sin(this.yaw)
    );
    // Scoped weapons breathe; holding Shift steadies them at the cost of stamina.
    const t = this.game.time || 0;
    const sway = this.scopeSway;
    const swayX = Math.sin(t * 1.35) * 0.0055 * sway + Math.sin(t * 2.7) * 0.0016 * sway;
    const swayY = Math.cos(t * 1.05) * 0.0048 * sway;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.recoilPitch + swayY, this.yaw + this.recoilYaw + swayX, this.recoilRoll);
    const baseFov = this.baseFov;
    const opticZoom = this.weapon?.attachments?.includes('optic') ? 1.08 : 1;
    const targetFov = this.aiming ? baseFov / (this.def.zoom * opticZoom) : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 18, dt || 0.016);
      this.camera.updateProjectionMatrix();
    }
  }

  updateCameraShake(dt) {
    this.cameraShake = damp(this.cameraShake, 0, 10, dt);
    this.camera.rotation.set(this.pitch, this.yaw, this.recoilRoll);
    this.camera.position.y = damp(this.camera.position.y, this.pos.y + 0.4, 8, dt);
  }

  updateViewModel(dt) {
    if (!this.gunRoot) return;
    const target = new THREE.Vector3().copy(this.gunBasePos).lerp(this.gunAdsPos, this.adsAmount);
    const sway = clamp(this.speed / 7, 0, 1) * (1 - this.adsAmount * 0.85);
    target.x += Math.cos(this.bobPhase) * 0.012 * sway;
    target.y += Math.sin(this.bobPhase * 2) * 0.012 * sway;
    this.weaponKick = damp(this.weaponKick, 0, 12, dt);
    this.weaponRoll = damp(this.weaponRoll, 0, 10, dt);
    target.z += this.weaponKick * 0.12;
    this.gunRoot.position.lerp(target, 1 - Math.exp(-18 * dt));
    this.gunRoot.rotation.x = 0.01 - this.weaponKick * 0.22 + (1 - this.adsAmount) * 0.04;
    this.gunRoot.rotation.y = 0.03 * (1 - this.adsAmount);
    this.gunRoot.rotation.z = this.weaponRoll;
    if (this.reloadTimer > 0) {
      const total = this.reloadDuration || this.def.reload;
      const k = 1 - this.reloadTimer / total;
      const dip = Math.sin(k * Math.PI);
      this.gunRoot.position.y -= dip * 0.25;
      this.gunRoot.rotation.x -= dip * 0.5;
      this.gunRoot.rotation.z += dip * 0.4;
    }
    if (this.medChannel) {
      const k = 1 - this.medChannel.time / this.medChannel.total;
      this.gunRoot.position.y -= Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.3;
      this.gunRoot.rotation.z += Math.sin(k * Math.PI) * 0.6;
    }
    if (this.abilityAnim > 0.01) {
      // Left hand thrusts forward during an ability cast.
      this.gunRoot.position.y -= this.abilityAnim * 0.16;
      this.gunRoot.position.x -= this.abilityAnim * 0.08;
      this.gunRoot.rotation.y += this.abilityAnim * 0.34;
      this.gunRoot.rotation.z -= this.abilityAnim * 0.2;
    }
    if (this.switchTimer > 0) {
      const k = this.switchTimer / 0.28;
      this.gunRoot.position.y -= k * 0.35;
    }
  }

  updateWeapon(dt, input) {
    const w = this.weapon;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    this.spreadHeat = Math.max(0, this.spreadHeat - dt * (this.overclockLeft > 0 ? 4.6 : 2.6));
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
      return;
    }
    if (this.switchTimer > 0) return;
    if (this.medChannel) return;
    if (this.mode !== 'fps') return;
    if (input.firing && this.fireTimer <= 0) {
      if (w.def.auto || !this.triggerHeld) {
        this.tryFire();
      }
    }
    this.triggerHeld = input.firing;
  }

  tryFire() {
    const w = this.weapon, def = w.def;
    if (!this.alive || this.medChannel) return;
    if (w.mag <= 0) {
      audio.empty();
      this.fireTimer = 0.25;
      this.game.hud?.flashAmmo();
      return;
    }
    if (this.cloakLeft > 0) {
      this.cloakLeft = 0;
      this.game.hud?.toast('VEIL BROKEN', 'WEAPON DISCHARGE');
    }
    w.mag--;
    this.fireTimer = 60 / def.rpm / (this.overclockLeft > 0 ? 1.5 : 1);
    this.shots++;
    this.weaponKick = 1;
    this.weaponRoll = rand(-0.04, 0.04);
    this.spreadHeat = clamp(this.spreadHeat + (this.overclockLeft > 0 ? 0.1 : 0.22), 0, 2.6);
    const spread = this.currentSpread();
    // Soft aim assist for touch. It only nudges pellets already inside a narrow
    // cone; solid geometry still blocks the shot in castShot().
    let assistDir = null;
    if (this.game.input?.isTouch && this.profile.settings.aimAssist !== false && this.game.bots) {
      const base = this.camera.getWorldDirection(new THREE.Vector3());
      let bestDot = Math.cos(deg(7));
      for (const b of this.game.bots.bots) {
        if (!b.alive || (this.game.mode.id !== 'br' && b.team === 0)) continue;
        const to = b.center().sub(this.camera.position);
        const dist = to.length();
        if (dist < 3 || dist > 95) continue;
        to.multiplyScalar(1 / dist);
        const dot = to.dot(base);
        if (dot > bestDot) { bestDot = dot; assistDir = to; }
      }
    }
    for (let p = 0; p < def.pellets; p++) {
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const a = rand(0, Math.PI * 2), r = Math.tan(deg(spread)) * Math.sqrt(Math.random());
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      if (assistDir) dir.lerp(assistDir, this.aiming ? 0.62 : 0.42).normalize();
      const origin = this.camera.position.clone();
      const hit = this.game.castShot(origin, dir, def.range, this);
      const end = hit.point;
      const muzzleWorld = this.getMuzzleWorld();
      this.game.effects.tracer(muzzleWorld, end, def.id === 'longshot' ? 0xbfe4ff : 0xffc06a);
      if (hit.bot) {
        const dist = hit.distance;
        let dmg = def.dmg * this.damageMultiplier();
        if (def.pellets > 1) dmg *= clamp(1 - dist / (def.range * 1.2), 0.25, 1);
        if (def.falloff && dist > def.falloff[0]) {
          const t = clamp((dist - def.falloff[0]) / (def.falloff[1] - def.falloff[0]), 0, 1);
          dmg *= lerp(1, def.falloff[2], t);
        }
        if (hit.zone === 'head') dmg *= def.model === 'sniper' ? 2.5 : 2.1;
        else if (hit.zone === 'leg') dmg *= 0.8;
        this.hits++;
        if (hit.zone === 'head') this.headshots++;
        this.game.damageBot(hit.bot, Math.round(dmg), this, hit.point, hit.zone === 'head', def);
        this.game.effects.impact(hit.point, hit.normal, '#ffca7a', true);
        audio.hit(hit.zone === 'head');
      } else {
        this.game.effects.impact(hit.point, hit.normal, '#ffd08a', false);
      }
    }
    const recoilMul = this.recoilMultiplier() * (this.adsAmount > 0.5 ? 0.72 : 1);
    this.recoilPitch += deg(def.recoil * 0.32 * recoilMul) * (1 - this.adsAmount * 0.38);
    this.recoilYaw += rand(-1, 1) * deg(def.recoil * 0.1 * recoilMul) * (1 - this.adsAmount * 0.5);
    this.recoilRoll += rand(-1, 1) * deg(0.35);
    this.cameraShake = Math.max(this.cameraShake, def.recoil * 0.006 * recoilMul);
    const muzzleWorld = this.getMuzzleWorld();
    this.game.effects.muzzle(muzzleWorld, '#ffd08a', def.pellets > 5 ? 1.6 : 1);
    audio.shot(def.model, 0);
    this.game.onShot?.();
    if (w.mag === 0) this.startReload();
    this.game.hud?.updateAmmo();
  }

  currentSpread() {
    const def = this.def;
    let s = def.spread;
    const tier = this.rarityTier();
    s *= 1 - tier * 0.035;
    const move = clamp(this.speed / 7, 0, 1);
    s += move * (def.moveSpread || 1) * 2.2;
    s += this.spreadHeat * 0.55;
    if (this.aiming) s = lerp(s, def.adsSpread, this.adsAmount) * 0.5;
    if (this.crouching) s *= 0.72;
    if (this.operator.passive.id === 'shadow' && this.aiming) s *= 0.8;
    if (this.overclockLeft > 0) s *= 0.82;
    if (this.holdingBreath && this.scoped) s *= 0.35;
    return s;
  }

  getMuzzleWorld() {
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return this.camera.position.clone().addScaledVector(forward, 0.75 + this.adsAmount * 0.2).addScaledVector(right, 0.18 * (1 - this.adsAmount)).add(new THREE.Vector3(0, -0.1, 0));
  }

  startReload() {
    const w = this.weapon;
    if (this.reloadTimer > 0 || this.medChannel || w.mag >= this.magCapacity(w) || w.reserve <= 0) return;
    this.reloadDuration = w.def.reload * this.reloadMultiplier();
    this.reloadTimer = this.reloadDuration;
    audio.reload();
    this.game.hud?.startReload(this.reloadDuration);
  }
  finishReload() {
    const w = this.weapon;
    const cap = this.magCapacity(w);
    const need = cap - w.mag;
    const take = this.game.mode.infiniteAmmo ? need : Math.min(need, w.reserve);
    w.mag += take;
    if (!this.game.mode.infiniteAmmo) w.reserve -= take;
    this.game.hud?.updateAmmo();
  }

  jump() {
    if (!this.alive || this.mode !== 'fps' || this.medChannel) return;
    if (this.grounded) {
      this.vel.y = 6.7;
      this.grounded = false;
      this.landKick = 0.015;
    }
  }

  /* ---------------- medical items ---------------- */
  itemCount(kind) {
    if (kind === 'bandage') return this.bandages;
    if (kind === 'medkit') return this.medkits;
    if (kind === 'trauma') return this.trauma;
    if (kind === 'shield') return this.shields;
    return 0;
  }
  addItem(kind, n = 1) {
    const def = MED_ITEMS[kind];
    if (!def) return 0;
    const before = this.itemCount(kind);
    const after = Math.min(def.max, before + n);
    if (kind === 'bandage') this.bandages = after;
    else if (kind === 'medkit') this.medkits = after;
    else if (kind === 'trauma') this.trauma = after;
    else if (kind === 'shield') this.shields = after;
    return after - before;
  }
  useMedical(kind = 'auto') {
    if (!this.alive || this.medChannel || this.reloadTimer > 0) return false;
    if (kind === 'auto') {
      if (this.trauma > 0 && this.health < this.maxHealth * 0.5) kind = 'trauma';
      else if (this.medkits > 0 && this.health < this.maxHealth) kind = 'medkit';
      else if (this.bandages > 0) kind = 'bandage';
      else if (this.medkits > 0) kind = 'medkit';
      else return false;
    }
    const def = MED_ITEMS[kind];
    if (!def || this.itemCount(kind) <= 0) {
      this.game.hud?.toast('NO ' + (def?.name || 'ITEM'), 'SEARCH FOR SUPPLIES');
      return false;
    }
    if (def.shield && this.shield >= this.maxShield) return false;
    if (def.heal && this.health >= this.maxHealth) return false;
    const medic = this.operator.passive.id === 'fieldmedic';
    const time = def.time * (medic ? 0.8 : 1);
    this.medChannel = { kind, def, time, total: time };
    this.fireTimer = Math.max(this.fireTimer, 0.1);
    this.game.hud?.startHeal(def, time);
    audio.equip();
    return true;
  }
  updateMedical(dt) {
    const c = this.medChannel;
    if (!c) return;
    c.time -= dt;
    this.game.hud?.updateHeal(1 - c.time / c.total);
    if (c.time > 0) return;
    this.medChannel = null;
    const medic = this.operator.passive.id === 'fieldmedic';
    if (c.def.shield) {
      const gain = c.def.shield * (medic ? 1.15 : 1);
      this.shield = Math.min(this.maxShield, this.shield + gain);
      this.addItem(c.kind, -1);
      audio.shield();
      this.game.hud?.toast('SHIELD RESTORED', '+' + Math.round(gain));
    } else {
      const gain = c.def.heal * (medic ? 1.3 : 1);
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + gain);
      this.addItem(c.kind, -1);
      audio.heal();
      this.game.hud?.toast(c.def.name + ' USED', '+' + Math.round(this.health - before) + ' HEALTH');
    }
    this.game.hud?.endHeal();
    this.game.hud?.updateVitals();
  }
  cancelMedical(silent = false) {
    if (!this.medChannel) return;
    this.medChannel = null;
    this.game.hud?.endHeal();
    if (!silent) this.game.hud?.toast('HEAL CANCELED');
  }
  heal(amount = 50) { return this.useMedical('medkit'); }
  useShield(amount = 50) { return this.useMedical('shield'); }

  /* ---------------- operator ability ---------------- */
  get abilityReady() { return this.abilityCooldown <= 0 && this.abilityLeft <= 0; }

  activateAbility() {
    if (!this.alive || this.mode !== 'fps' || this.abilityCooldown > 0 || this.abilityLeft > 0) return false;
    const a = this.abilityDef;
    this.abilityCooldown = a.cooldown;
    this.abilityLeft = a.duration;
    this.abilityAnim = 1;
    this.cameraShake = Math.max(this.cameraShake, 0.018);
    audio.ability();
    const kind = a.id;
    if (kind === 'adrenaline') {
      this.adrenalineLeft = a.duration;
      this.health = Math.min(this.maxHealth, this.health + 12);
      this.game.effects.impact(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), null, '#52e6a0', false, 1.4);
    } else if (kind === 'bulwark') {
      this.bulwarkBonus = 90;
      this.maxShield = 100 + this.bulwarkBonus;
      this.shield = Math.min(this.maxShield, this.shield + this.bulwarkBonus);
      this.game.effects.impact(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), null, '#4fa8ff', false, 1.5);
    } else if (kind === 'cloak') {
      this.cloakLeft = a.duration;
      this.game.hud?.setCloak(true);
    } else if (kind === 'overclock') {
      this.overclockLeft = a.duration;
    } else if (kind === 'pulse') {
      this.game.pulseScan?.(a.duration);
    } else if (kind === 'blink') {
      this.blinkImmune = 0.65;
      const dir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const start = this.pos.clone();
      const step = 0.8;
      const probe = this.pos.clone();
      for (let d = 0; d < 12; d += step) {
        probe.copy(this.pos).addScaledVector(dir, step);
        this.world.collide(probe, 0.4, probe.y);
        if (probe.distanceTo(this.pos) < step * 0.55) break;
        this.pos.copy(probe);
      }
      this.vel.x = dir.x * 5; this.vel.z = dir.z * 5;
      const gy = this.world.heightAt(this.pos.x, this.pos.z);
      this.pos.y = Math.max(this.pos.y, gy);
      const at = this.pos.clone().add(new THREE.Vector3(0, 1, 0));
      this.game.effects.tracer(start.add(new THREE.Vector3(0, 1, 0)), at, 0xffd166);
      this.game.effects.impact(at, null, '#ffd166', false, 1.2);
      this.syncCamera(0.016);
    }
    this.game.hud?.abilityActivated(a);
    this.game.hud?.updateAmmo();
    this.game.hud?.banner(a.name, this.operator.name + ' · OPERATOR ABILITY', 2000);
    return true;
  }

  updateAbility(dt) {
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.blinkImmune = Math.max(0, this.blinkImmune - dt);
    this.reloadSurge = Math.max(0, this.reloadSurge - dt);
    if (this.abilityLeft > 0) {
      this.abilityLeft = Math.max(0, this.abilityLeft - dt);
      if (this.abilityLeft === 0) {
        if (this.operator.active.id === 'bulwark') {
          this.maxShield = Math.max(100, this.maxShield - this.bulwarkBonus);
          this.shield = Math.min(this.shield, this.maxShield);
          this.bulwarkBonus = 0;
        }
        this.game.hud?.abilityEnded(this.operator.active);
      }
    }
    if (this.adrenalineLeft > 0) {
      this.adrenalineLeft = Math.max(0, this.adrenalineLeft - dt);
      this.health = Math.min(this.maxHealth, this.health + dt * (65 / 6));
      if (this.adrenalineLeft === 0) this.game.hud?.updateVitals();
    }
    if (this.overclockLeft > 0) {
      this.overclockLeft = Math.max(0, this.overclockLeft - dt);
      if (this.overclockLeft === 0) this.game.hud?.updateAmmo();
    }
    if (this.cloakLeft > 0) {
      this.cloakLeft = Math.max(0, this.cloakLeft - dt);
      if (this.cloakLeft === 0) this.game.hud?.setCloak(false);
    }
    this.game.hud?.updateAbility?.(this);
  }

  takeDamage(amount, source, point = null) {
    if (!this.alive || this.game.godMode || this.blinkImmune > 0) return;
    this.lastDamageTime = this.game.time;
    this.regenTimer = 0;
    if (this.medChannel) this.cancelMedical(true);
    if (this.cloakLeft > 0) { this.cloakLeft = 0; this.game.hud?.setCloak(false); }
    if (this.shield > 0) {
      const absorbRate = this.operator.passive.id === 'plating' ? 0.82 : 0.66;
      const absorbed = Math.min(this.shield, amount * absorbRate);
      this.shield -= absorbed;
      amount -= absorbed;
      this.game.hud?.hitFlash(0.3);
    }
    this.health -= amount;
    this.cameraShake = 0.03;
    audio.hit(false);
    this.game.hud?.damageIndicator(source ? source.pos : null);
    this.game.hud?.updateVitals();
    this.game.hud?.hitFlash(0.75);
    if (this.health <= 0) {
      this.health = 0;
      this.die(source);
    }
  }

  die(source) {
    if (!this.alive) return;
    this.alive = false;
    this.mode = 'dead';
    this.adsAmount = 0; this.aiming = false;
    this.game.onPlayerDeath?.(source);
  }

  resetForRespawn(x, z) {
    this.alive = true;
    this.health = this.maxHealth;
    this.shield = Math.min(this.maxShield, (this.game.mode.armor || 0) + this.operator.stats.armor * 0.5);
    this.pos.set(x, this.world.heightAt(x, z) + 0.05, z);
    this.vel.set(0, 0, 0);
    this.mode = 'fps';
    this.abilityCooldown = 0; this.abilityLeft = 0;
    this.overclockLeft = 0; this.adrenalineLeft = 0; this.cloakLeft = 0;
    this.maxShield = 100; this.bulwarkBonus = 0; this.blinkImmune = 0; this.reloadSurge = 0;
    this.medChannel = null;
    this.weapons.forEach(w => { w.mag = this.magCapacity(w); w.reserve = Math.round(w.def.reserve * (this.game.mode.startAmmo || 1)); });
    this.equip(0, true);
    this.bandages = 3; this.medkits = 2; this.trauma = 0; this.shields = 1;
    this.game.hud?.setCloak(false);
  }
}
