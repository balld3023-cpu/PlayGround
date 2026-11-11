import { clamp, formatTime, $, el } from './utils.js';
import { RARITY } from './config.js';

export class HUD {
  constructor() {
    this.root = $('#hud');
    this.minimap = $('#minimap');
    this.mctx = this.minimap.getContext('2d');
    this.compass = $('#compass');
    this.compassStrip = $('#compass-strip');
    this.compassBuilt = false;
    this.compassW = 0;
    this.lastMini = 0;
    this.lastCompass = -999;
    this.zone = null;
    this.killfeed = $('#killfeed');
    this.results = $('#results');
    this.scoreboardEl = $('#scoreboard');
    this.pauseEl = $('#pause');
    this.intro = $('#match-intro');
    this.dropUI = $('#drop-ui');
    this.game = null;
    this.bound = false;
    this.dmgDirEl = null;
    this.scoreboardOpen = false;
    this.reloadStart = 0;
    this.reloadDur = 0;
    this.bindStatic();
    window.addEventListener('resize', () => { this.buildCompass(); });
  }

  bind(game) {
    this.game = game;
    this.buildCompass();
    this.updateVitals();
    this.updateAmmo();
    this.updateAlive();
    this.updateAbility(game.player);
    this.setObjective(game.mode);
    if (game.mode.id === 'tdm') {
      $('#obj-score').classList.remove('hidden');
      this.updateScore(0, 0);
    } else $('#obj-score').classList.add('hidden');
    $('#hud-name').textContent = game.profile.name;
    $('#hud-initial').textContent = (game.profile.name[0] || 'P').toUpperCase();
    $('#hud-lvl').textContent = game.profile.level;
    $('#hud-team-tag').textContent = game.mode.id === 'tdm' ? 'ALPHA' : 'SOLO';
    // HUD.bind runs before Game creates the player; only touch operator UI once it exists.
    const op = game.player?.operator;
    if (op) {
      $('#hud-operator').textContent = op.role;
      $('#ability-name').textContent = op.active.name;
      $('#ability-state').textContent = 'READY · ' + op.active.cooldown + 'S COOLDOWN';
      $('#ability-passive').textContent = op.passive.name + ' · PASSIVE';
      $('#ability-btn').style.setProperty('--ab-color', op.accent);
    }
    this.setCloak(false);
    this.endHeal();
    this.killfeed.innerHTML = '';
    this.scoreboardEl.classList.add('hidden');
    this.pauseEl.classList.add('hidden');
    this.results.classList.add('hidden');
    this.dropUI.classList.add('hidden');
    this.intro.classList.add('hidden');
    this.compassBuilt = false;
    this.zone = game.zone;
    if (game.world) this.miniBase = game.world.miniCanvas;
  }

  bindStatic() {
    if (this.bound) return;
    this.bound = true;
    $('#btn-resume')?.addEventListener('click', () => this.game?.resume());
    $('#btn-leave')?.addEventListener('click', () => this.game?.leaveMatch());
    $('#btn-pause-settings')?.addEventListener('click', () => this.game?.openSettings());
    $('#vh-exit')?.addEventListener('click', () => this.game?.exitVehicle(true));
    $('#btn-again')?.addEventListener('click', () => this.game?.playAgain());
    $('#btn-lobby')?.addEventListener('click', () => this.game?.returnToLobby());
    $('#drop-skip')?.addEventListener('click', () => this.game?.skipDrop());
    $('#quick-med')?.addEventListener('click', e => { e.stopPropagation(); this.game?.player?.useMedical('auto'); });
    $('#quick-bandage')?.addEventListener('click', e => { e.stopPropagation(); this.game?.player?.useMedical('bandage'); });
    $('#quick-trauma')?.addEventListener('click', e => { e.stopPropagation(); this.game?.player?.useMedical('trauma'); });
    $('#quick-shield')?.addEventListener('click', e => { e.stopPropagation(); this.game?.player?.useMedical('shield'); });
    $('#ability-btn')?.addEventListener('click', e => { e.stopPropagation(); this.game?.player?.activateAbility(); });
    const d = document.createElement('div');
    d.id = 'dmg-dir'; d.className = 'dmg-dir'; d.innerHTML = '<i></i>';
    document.getElementById('hud').appendChild(d);
    this.dmgDirEl = d;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  buildCompass() {
    if (!this.compass) return;
    const w = this.compass.offsetWidth || 400;
    this.compassW = w;
    this.compassStrip.innerHTML = '';
    const k = w / 180; // pixels per degree (shows 180°)
    const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (let a = -180; a <= 540; a += 15) {
      const span = document.createElement('span');
      const norm = ((a % 360) + 360) % 360;
      const found = labels.find(l => l[0] === norm);
      span.textContent = found ? found[1] : '';
      span.className = found ? 'card' : '';
      span.style.left = (w / 2 + a * k) + 'px';
      this.compassStrip.appendChild(span);
      if (!found) {
        const tick = document.createElement('i');
        tick.style.left = (w / 2 + a * k) + 'px';
        this.compassStrip.appendChild(tick);
      }
    }
    this.compassBuilt = true;
  }

  updateCompass() {
    if (!this.game) return;
    if (!this.compassBuilt || Math.abs(this.compass.offsetWidth - this.compassW) > 2) this.buildCompass();
    const heading = ((-this.game.player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    if (Math.abs(heading - this.lastCompass) < 0.35) return;
    this.lastCompass = heading;
    const k = this.compassW / 180;
    this.compassStrip.style.transform = `translateX(${-heading * k}px)`;
  }

  setZone(zone) { this.zone = zone; }

  update(dt) {
    if (!this.game || this.root.classList.contains('hidden')) return;
    this.updateCompass();
    this.updateZone();
    this.updateVehicle();
    this.updateReload();
    if (performance.now() - this.lastMini > 90) {
      this.lastMini = performance.now();
      this.drawMinimap();
    }
  }

  updateZone() {
    if (!this.game) return;
    const z = this.game.zone;
    const bar = $('#zone-bar'), label = $('#zone-label'), timer = $('#zone-timer');
    const mz = $('#mm-zone'), mzt = $('#mm-zone-txt');
    if (!z || !z.active) {
      label.textContent = this.game.mode.id === 'tdm' ? 'NO SAFE ZONE' : 'ZONE ACTIVE';
      timer.textContent = '--:--';
      bar.classList.remove('danger');
      mz.classList.remove('danger');
      mzt.textContent = 'ZONE DISABLED';
      return;
    }
    label.textContent = z.shrinking ? 'ZONE SHRINKING' : (z.phase === 0 ? 'ZONE STABLE' : 'NEXT ZONE');
    timer.textContent = formatTime(Math.max(0, z.timeLeft));
    const outside = z.outside;
    bar.classList.toggle('danger', outside);
    mz.classList.toggle('danger', outside);
    const d = Math.hypot(this.game.player.pos.x - z.center.x, this.game.player.pos.z - z.center.z);
    const dist = Math.max(0, d - z.radius);
    mzt.textContent = outside ? `OUTSIDE · ${Math.ceil(dist)}M` : `SAFE · ${Math.ceil(dist)}M`;
  }

  updateVehicle() {
    const g = this.game;
    const vh = $('#vehicle-hud');
    if (g.vehicle) {
      vh.classList.remove('hidden');
      $('#vh-speed').textContent = Math.round(Math.abs(g.vehicle.speed) * 3.6);
      $('#vh-health').style.width = clamp(g.vehicle.health, 0, 100) + '%';
    } else vh.classList.add('hidden');
  }

  updateReload() {
    const tr = $('#reload-track');
    if (!this.game || this.game.player.reloadTimer <= 0) { tr.classList.remove('active'); return; }
    tr.classList.add('active');
    const p = 1 - this.game.player.reloadTimer / (this.game.player.reloadDuration || this.game.player.def.reload);
    tr.querySelector('i').style.width = clamp(p * 100, 0, 100) + '%';
  }

  startReload(dur) { this.reloadDur = dur; this.reloadStart = performance.now(); }

  startHeal(def, dur) {
    const tr = $('#heal-track');
    tr.classList.add('active');
    tr.classList.remove('shield');
    if (def.shield) tr.classList.add('shield');
    $('#heal-label').textContent = def.name;
    tr.querySelector('i').style.width = '0%';
  }
  updateHeal(progress) {
    const tr = $('#heal-track');
    tr.classList.add('active');
    tr.querySelector('i').style.width = clamp(progress * 100, 0, 100) + '%';
  }
  endHeal() {
    const tr = $('#heal-track');
    if (!tr) return;
    tr.classList.remove('active', 'shield');
  }

  updateVitals() {
    const p = this.game?.player;
    if (!p) return;
    const hp = clamp(p.health, 0, p.maxHealth), sh = clamp(p.shield, 0, p.maxShield);
    const hpPct = p.maxHealth ? (hp / p.maxHealth) * 100 : 0;
    const shPct = p.maxShield ? (sh / p.maxShield) * 100 : 0;
    const hpFill = $('#hp-fill'), hpText = $('#hp-text');
    hpFill.style.width = hpPct + '%'; hpText.textContent = Math.ceil(hp);
    $('#armor-fill').style.width = shPct + '%'; $('#armor-text').textContent = Math.ceil(sh);
    const bar = hpFill.closest('.bar');
    bar.classList.toggle('low', hpPct < 30);
    const ghost = $('#hp-ghost');
    ghost.style.width = Math.max(hpPct, parseFloat(ghost.style.width) || 0) + '%';
    setTimeout(() => { ghost.style.width = hpPct + '%'; }, 30);
    $('#med-count').textContent = p.medkits;
    $('#bandage-count').textContent = p.bandages;
    $('#trauma-count').textContent = p.trauma;
    $('#shield-count').textContent = p.shields;
    const band = $('#quick-bandage'); if (band) band.classList.toggle('empty', p.bandages <= 0);
    const trauma = $('#quick-trauma'); if (trauma) trauma.classList.toggle('empty', p.trauma <= 0);
    const med = $('#quick-med'); if (med) med.classList.toggle('empty', p.medkits <= 0);
    const shield = $('#quick-shield'); if (shield) shield.classList.toggle('empty', p.shields <= 0);
  }

  updateAmmo() {
    const p = this.game?.player;
    if (!p) return;
    const w = p.weapon;
    const tier = w.rarity || 'COMMON';
    const ammo = p.ammoType(w);
    $('#weapon-label').textContent = w.def.name;
    $('#weapon-label').style.color = RARITY[tier] || '#fff';
    $('#weapon-rarity').textContent = tier;
    $('#weapon-rarity').style.color = RARITY[tier] || '#fff';
    $('#weapon-rarity').style.borderColor = (RARITY[tier] || '#fff') + '55';
    $('#ammo-type').textContent = ammo.name;
    $('#ammo-type').style.color = ammo.color;
    $('#fire-mode').textContent = p.overclockLeft > 0 ? 'OVERCLOCK' : w.def.auto ? 'AUTO' : 'SEMI';
    $('#ammo-mag').textContent = w.mag;
    $('#ammo-reserve').textContent = this.game.mode.infiniteAmmo ? '∞' : w.reserve;
    $('#wslot-0').textContent = p.weapons[0]?.def.short || '—';
    $('#wslot-1').textContent = p.weapons[1]?.def.short || '—';
    $('#wslot-2').textContent = p.weapons[2]?.def.short || '—';
    document.querySelectorAll('#hud .wslot').forEach((el, i) => el.classList.toggle('active', i === p.weaponIndex));
    const cap = p.magCapacity(w);
    $('#ammo-mag').style.color = w.mag === 0 ? '#ff5b4b' : w.mag <= Math.ceil(cap * 0.25) ? '#ffc74a' : '#fff';
    $('#crosshair').style.setProperty('--spread', Math.round(4 + p.currentSpread() * 2.2) + 'px');
    const row = $('#attachment-row');
    if (row) {
      row.innerHTML = (w.attachments || []).map(a => {
        const label = { ext: 'MAG', comp: 'CMP', optic: 'OPT', match: 'TRG' }[a] || a;
        return `<span>${label}</span>`;
      }).join('') + `<em>${cap} RND</em>`;
    }
  }

  updateAlive() {
    const g = this.game;
    if (!g) return;
    const alive = g.bots ? g.bots.aliveCount : 0;
    $('#hud-alive').textContent = alive;
    $('#hud-kills').textContent = g.player?.kills || 0;
    $('#hud-squad').textContent = g.mode.id === 'tdm' ? (g.bots ? g.bots.bots.filter(b => b.alive && b.team === 0).length + (g.player?.alive ? 1 : 0) : 1) : 1;
    if (g.mode.id === 'tdm' && g.bots) {
      this.updateScore(g.bots.teamScores[0], g.bots.teamScores[1]);
    }
    if (this.scoreboardOpen) this.renderScoreboard();
  }

  updateScore(a, b) {
    const el = $('#obj-score');
    if (el) el.innerHTML = `${a} <i>—</i> ${b}`;
  }

  updateAbility(p = this.game?.player) {
    if (!p) return;
    const a = p.operator.active;
    const btn = $('#ability-btn');
    if (!btn) return;
    const ready = p.abilityCooldown <= 0 && p.abilityLeft <= 0;
    const active = p.abilityLeft > 0;
    btn.classList.toggle('ready', ready);
    btn.classList.toggle('active', active);
    btn.classList.toggle('cooling', !ready && !active);
    btn.style.setProperty('--ab-color', p.operator.accent);
    btn.style.setProperty('--cd', (p.abilityCooldown > 0 ? (1 - p.abilityCooldown / a.cooldown) * 360 : 360) + 'deg');
    const cd = $('#ability-cd');
    if (cd) cd.textContent = active ? Math.ceil(p.abilityLeft) + 'S' : p.abilityCooldown > 0 ? Math.ceil(p.abilityCooldown) + 'S' : 'READY';
    const state = $('#ability-state');
    if (state) state.textContent = active ? `ACTIVE · ${Math.ceil(p.abilityLeft)}S` : p.abilityCooldown > 0 ? `COOLDOWN · ${Math.ceil(p.abilityCooldown)}S` : `READY · ${a.cooldown}S COOLDOWN`;
    const name = $('#ability-name');
    if (name) name.textContent = a.name;
    const passive = $('#ability-passive');
    if (passive) passive.textContent = p.operator.passive.name + ' · PASSIVE';
    const sweep = $('#ability-sweep');
    if (sweep) sweep.style.setProperty('--ab-color', p.operator.accent);
  }

  abilityActivated(a) {
    const btn = $('#ability-btn');
    btn?.classList.add('flash');
    setTimeout(() => btn?.classList.remove('flash'), 500);
  }

  abilityEnded(a) {
    this.toast(a.name + ' ENDED', 'RECHARGING');
  }

  setCloak(on) {
    this.root.classList.toggle('cloaked', !!on);
  }

  drawMinimap() {
    if (!this.miniBase || !this.game) return;
    const ctx = this.mctx, W = this.minimap.width;
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(this.miniBase, 0, 0, 512, 512, 0, 0, W, W);
    const g = this.game, world = g.world;
    const sx = W / world.size;
    const px = (world.playerToMap?.x ?? (g.player.pos.x + 300)) * sx;
    const py = (world.playerToMap?.y ?? (g.player.pos.z + 300)) * sx;
    const toPx = (x, z) => [(x + 300) * sx, (z + 300) * sx];
    // safe zones
    const z = g.zone;
    if (z && z.active) {
      const [cx, cy] = toPx(z.center.x, z.center.z);
      ctx.beginPath(); ctx.arc(cx, cy, z.radius * sx, 0, Math.PI * 2);
      ctx.strokeStyle = z.outside ? 'rgba(255,70,60,.9)' : 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = z.outside ? 'rgba(255,60,40,.08)' : 'rgba(255,255,255,.05)'; ctx.fill();
      if (z.nextCenter && z.nextRadius) {
        const [nx, ny] = toPx(z.nextCenter.x, z.nextCenter.z);
        ctx.beginPath(); ctx.arc(nx, ny, z.nextRadius * sx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,170,60,.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // teammates
    if (g.bots) {
      for (const b of g.bots.bots) {
        if (!b.alive) continue;
        if (g.mode.id === 'br' || b.team !== 0) continue;
        const [bx, by] = toPx(b.pos.x, b.pos.z);
        ctx.fillStyle = '#25ddc3'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, 7); ctx.fill();
      }
    }
    // vehicles
    for (const v of g.vehicles || []) {
      if (v.destroyed) continue;
      const [vx, vy] = toPx(v.pos.x, v.pos.z);
      ctx.fillStyle = 'rgba(255,200,80,.9)'; ctx.fillRect(vx - 2, vy - 2, 4, 4);
    }
    // airdrop
    if (g.airdropPos) {
      const [ax, ay] = toPx(g.airdropPos.x, g.airdropPos.z);
      ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax - 7, ay); ctx.lineTo(ax + 7, ay); ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 7); ctx.stroke();
    }
    // player
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-g.player.yaw);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,122,26,.14)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 26, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    $('#mm-coords').textContent = `GRID ${String(Math.floor((g.player.pos.x + 300) / 40)).padStart(2, '0')}·${String(Math.floor((g.player.pos.z + 300) / 40)).padStart(2, '0')}`;
  }

  killFeed(killer, victim, weapon, me = false, head = false) {
    const row = el('div', 'kf-row' + (me ? ' me' : ''));
    row.innerHTML = `${head ? '<svg class="icon"><use href="#i-skull"/></svg>' : ''}<span class="kf-a">${killer}</span><span class="kf-v">eliminated</span><span class="kf-a">${victim}</span>${weapon ? `<span class="kf-w">[${weapon}]</span>` : ''}`;
    this.killfeed.prepend(row);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild.remove();
    setTimeout(() => { row.style.opacity = '0'; row.style.transition = 'opacity .4s'; setTimeout(() => row.remove(), 420); }, 5200);
  }

  hitmarker(head = false) {
    const hm = $('#hitmarker');
    hm.classList.add('show'); hm.classList.toggle('head', head);
    clearTimeout(this._hm);
    this._hm = setTimeout(() => hm.classList.remove('show'), 110);
  }

  hitFlash(strength = 0.6) {
    const f = $('#hit-flash');
    f.style.transition = 'none'; f.style.opacity = String(clamp(strength, 0, 1));
    requestAnimationFrame(() => { f.style.transition = 'opacity .28s'; f.style.opacity = '0'; });
  }

  flashAmmo() {
    const a = $('#ammo-mag'); a.animate([{ transform: 'scale(1.15)', color: '#ff5b4b' }, { transform: 'scale(1)', color: '#ff5b4b' }], { duration: 220 });
  }
  flashHealth() {
    const v = $('#damage-vignette'); v.style.opacity = '1';
    clearTimeout(this._dmgT); this._dmgT = setTimeout(() => v.style.opacity = '0', 220);
  }

  damageIndicator(sourcePos) {
    this.flashHealth();
    if (!sourcePos || !this.dmgDirEl || !this.game) return;
    const dx = sourcePos.x - this.game.player.pos.x, dz = sourcePos.z - this.game.player.pos.z;
    const angle = Math.atan2(dx, -dz) * 180 / Math.PI;
    const rel = angle - (-this.game.player.yaw * 180 / Math.PI);
    const d = this.dmgDirEl;
    d.style.transform = `rotate(${rel}deg)`;
    d.style.opacity = '1';
    clearTimeout(this._dirT);
    this._dirT = setTimeout(() => { d.style.opacity = '0'; }, 450);
  }

  nearMiss() {}

  toast(title, sub = '') {
    const wrap = $('#toast-wrap');
    const t = el('div', 'toast', `${title}${sub ? ` <span style="color:#7d8b96">${sub}</span>` : ''}`);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 2900);
  }

  pickup(title, sub, icon = 'i-gun') {
    const host = $('#pickup-toast');
    const row = el('div', 'pickup-line', `<svg class="icon"><use href="#${icon}"/></svg><span>${title}</span><b>${sub}</b>`);
    host.appendChild(row);
    setTimeout(() => row.remove(), 2400);
  }

  banner(title, sub, dur = 2600) {
    const b = $('#event-banner');
    $('#eb-title').textContent = title; $('#eb-sub').textContent = sub || '';
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), dur);
  }

  setObjective(mode) {
    $('#obj-label').textContent = mode.name;
    $('#obj-main').textContent = mode.label;
  }

  showDrop(world, mode) {
    const d = this.dropUI;
    d.classList.remove('hidden');
    $('#drop-target').textContent = world.map.name;
    this.updateDrop(1, 140, true);
    $('#drop-hint').innerHTML = this.game?.input?.isTouch ? 'STEER TO LAND · TAP SKIP TO DEPLOY FASTER' : 'STEER WITH <kbd>WASD</kbd> · HOLD <kbd>SHIFT</kbd> TO DIVE';
    $('#drop-skip').style.display = 'flex';
  }
  updateDrop(progress, alt, chute) {
    $('#drop-progress').style.width = clamp(progress * 100, 0, 100) + '%';
    $('#drop-alt').innerHTML = `${Math.max(0, Math.round(alt))}<small>M</small>`;
    if (chute) $('#drop-hint').innerHTML = $('#drop-hint').innerHTML.includes('CHUTE') ? $('#drop-hint').innerHTML : 'PARACHUTE DEPLOYED · STEER WITH <kbd>WASD</kbd>';
  }
  hideDrop() { this.dropUI.classList.add('hidden'); }

  showIntro(mode, map) {
    this.intro.classList.remove('hidden');
    $('#mi-mode').textContent = mode.name;
    $('#mi-mapname').textContent = map.name;
    $('#mi-mode').nextElementSibling.textContent = map.name;
    const grid = this.intro.querySelector('.mi-grid');
    grid.innerHTML = `<div><b>${mode.players}</b><span>PLAYERS</span></div><div><b>${mode.teamSize > 1 ? mode.teamSize + 'v' + mode.teamSize : 'SOLO'}</b><span>MODE</span></div><div><b>${mode.ranked ? 'RANKED' : 'CASUAL'}</b><span>QUEUE</span></div>`;
    const content = this.intro.querySelector('.mi-content');
    content.style.animation = 'none'; content.offsetHeight; content.style.animation = '';
    const bg = this.intro.querySelector('.mi-bg');
    bg.style.animation = 'none'; bg.offsetHeight; bg.style.animation = '';
    setTimeout(() => this.intro.classList.add('hidden'), 2500);
  }

  toggleScoreboard(open) {
    this.scoreboardOpen = open ?? !this.scoreboardOpen;
    this.scoreboardEl.classList.toggle('hidden', !this.scoreboardOpen);
    if (this.scoreboardOpen) this.renderScoreboard();
  }
  renderScoreboard() {
    if (!this.game?.bots) return;
    const rows = this.game.bots.getScoreboardData();
    $('#sb-alive').textContent = `${this.game.bots.aliveCount} ALIVE`;
    const host = $('#sb-rows');
    host.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const row = el('div', 'sb-row' + (r.me ? ' me' : ''));
      row.innerHTML = `<span>${i + 1}</span><span class="sb-name"><i class="sb-dot" style="background:${r.me ? '#ff7a1a' : r.team === 0 && this.game.mode.id === 'tdm' ? '#25ddc3' : '#ff5a45'}"></i>${r.name}</span><b>${r.kills}</b><b>${r.dmg}</b>`;
      host.appendChild(row);
    });
  }

  togglePause(show) {
    this.pauseEl.classList.toggle('hidden', !show);
    if (show) this.toggleScoreboard(false);
  }

  showResults(data) {
    this.root.classList.add('hidden');
    const r = this.results;
    r.classList.remove('hidden');
    r.classList.toggle('lose', !data.win);
    $('#result-title').textContent = data.win ? (data.mode === 'tdm' ? 'VICTORY' : 'BLAZE VICTORY') : (data.mode === 'tdm' ? 'DEFEAT' : 'ELIMINATED');
    $('#result-kicker').textContent = data.modeName;
    $('#result-place').innerHTML = data.mode === 'tdm'
      ? `<b>${data.teamScores[0]} — ${data.teamScores[1]}</b><span>FINAL SCORE</span>`
      : `<b>#${data.placement}</b><span>OUT OF ${data.players}</span>`;
    $('#rs-kills').textContent = data.kills;
    $('#rs-damage').textContent = Math.round(data.damage);
    $('#rs-time').textContent = formatTime(data.time);
    $('#rs-acc').textContent = Math.round(data.accuracy) + '%';
    $('#reward-coins').textContent = '+' + data.coins.toLocaleString();
    $('#reward-xp').textContent = '+' + data.xp.toLocaleString();
    $('#reward-kills').textContent = (data.win ? '+' : '') + data.rankPts;
    $('#result-map').textContent = data.mapName;
  }
  hideResults() { this.results.classList.add('hidden'); }
}
