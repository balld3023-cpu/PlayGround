/* ============================================================
   BLAZE ROYALE — application shell, lobby, UI and render loop
   ============================================================ */
import * as THREE from 'three';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import {
  MODES, MAPS, MAP_ORDER, OUTFITS, SKINS, HELMETS, BACKPACKS,
  WEAPONS, PRIMARY_IDS, SECONDARY_IDS, RARITY, QUALITY, DEFAULT_PROFILE
} from './config.js';
import {
  loadProfile, saveProfile, applyMatchResult, randomizeLook,
  outfitOf, skinOf, helmetOf, backpackOf, tierForLevel
} from './profile.js';
import { createHumanoid } from './models.js';
import { $, $$, drawMapPreview, drawWeaponIcon } from './utils.js';

const LOAD_STEPS = [
  [0.05, 'BOOTING BLAZE ENGINE'],
  [0.2, 'COMPILING SHADERS'],
  [0.38, 'RAISING TERRAIN'],
  [0.55, 'SPAWNING OPERATORS'],
  [0.7, 'SYNCING OPERATOR PROFILE'],
  [0.84, 'CALIBRATING FIREPOWER'],
  [0.95, 'READY TO DEPLOY']
];

class App {
  constructor() {
    this.profile = loadProfile();
    this.input = new Input();
    this.hud = new HUD();
    this.game = null;
    this.activeTab = 'home';
    this.charCategory = 'outfit';
    this.loadoutSlot = 'primary';
    this.starting = false;
    this.loadingStep = 0;
    this.loadTimer = 0;
    this.lastFrame = performance.now();
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.lobbyRotation = 0;
    this.lobbyDragging = false;
    this.lobbyPointer = null;
    this.settingsCallback = null;
    this.modalIsSettings = false;
    this.qualityKey = this.resolveQuality(this.profile.settings.quality);
    this.applyOutfitCache();
    this.setupRenderer();
    this.setupLobby();
    this.bindUI();
    this.syncProfileUI();
    this.startLoading();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ============================================================
     Rendering / quality
     ============================================================ */
  resolveQuality(requested) {
    if (requested === 'low' || requested === 'medium' || requested === 'high') return requested;
    return this.input.isTouch ? 'low' : 'medium';
  }

  setupRenderer() {
    const canvas = $('#stage');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.input.isTouch,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x06090d, 1);
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.toast('GRAPHICS CONTEXT LOST', 'RELOADING RECOMMENDED');
    });
    this.applyQuality();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 120));
  }

  applyQuality() {
    const q = QUALITY[this.qualityKey] || QUALITY.medium;
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    if (this.lobby?.camera) {
      this.lobby.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.lobby.camera.updateProjectionMatrix();
      this.placeLobbyCamera();
    }
    if (this.game) {
      this.game.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.game.camera.updateProjectionMatrix();
    }
  }

  onResize() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, (QUALITY[this.qualityKey] || QUALITY.medium).pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (this.lobby) {
      this.lobby.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.lobby.camera.updateProjectionMatrix();
      this.placeLobbyCamera();
    }
    if (this.game) {
      this.game.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.game.camera.updateProjectionMatrix();
    }
  }

  /* ============================================================
     Lobby showcase scene
     ============================================================ */
  setupLobby() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);
    scene.fog = new THREE.Fog(0x05080c, 7.5, 22);
    const camera = new THREE.PerspectiveCamera(36, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 80);
    camera.position.set(0, 1.55, 4.15);

    scene.add(new THREE.HemisphereLight(0x9dbfd6, 0x24160c, 1.1));

    const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
    key.position.set(3.6, 6.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0008;
    scene.add(key);

    const rim = new THREE.SpotLight(0xff6a12, 22, 11, 0.5, 0.7, 1.2);
    rim.position.set(-3.2, 2.5, 2.3);
    rim.target.position.set(0, 1.15, 0);
    scene.add(rim, rim.target);

    const cool = new THREE.PointLight(0x39c8d8, 9, 9, 1.6);
    cool.position.set(2.8, 1.45, -1.7);
    scene.add(cool);

    const back = new THREE.PointLight(0xff8a2a, 7, 8, 1.8);
    back.position.set(0.4, 1.7, -3.1);
    scene.add(back);

    // stage floor
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.1, 72),
      new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.38, metalness: 0.7 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.015;
    disc.receiveShadow = true;
    scene.add(disc);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.66, 0.16, 64),
      new THREE.MeshStandardMaterial({ color: 0x151c24, roughness: 0.32, metalness: 0.82 })
    );
    plinth.position.y = -0.06;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 });
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.012, 8, 96), ringMat);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.025;
    scene.add(rimRing);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.006, 6, 120),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.23 })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = 0.002;
    scene.add(outerRing);

    const grid = new THREE.GridHelper(18, 36, 0xff7a1a, 0x1a2732);
    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    scene.add(grid);

    // distant light bars framing the operator
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.3 });
    for (const x of [-3.9, 3.9]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 2.8, 0.024), barMat);
      bar.position.set(x, 1.4, -2.4);
      scene.add(bar);
    }

    // floating embers
    const count = 110;
    const arr = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 9;
      arr[i * 3 + 1] = Math.random() * 5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 7;
      speeds[i] = 0.12 + Math.random() * 0.4;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const embers = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xffa04a, size: 0.022, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(embers);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.scale.set(1, 1.32, 1);
    scene.add(shadow);

    this.lobby = {
      scene, camera, embers, speeds, avatar: null, avatarPivot: new THREE.Group(), time: 0
    };
    scene.add(this.lobby.avatarPivot);
    this.placeLobbyCamera();
    this.refreshLobbyAvatar();
  }

  placeLobbyCamera() {
    if (!this.lobby) return;
    const cam = this.lobby.camera;
    const w = window.innerWidth, h = Math.max(1, window.innerHeight);
    const portrait = w / h < 0.92 || w < 760;
    cam.aspect = w / h;
    cam.position.set(0, portrait ? 1.6 : 1.46, portrait ? 5.15 : 4.95);
    cam.fov = portrait ? 40 : 34;
    cam.lookAt(0, portrait ? 1.46 : 1.16, 0);
    cam.updateProjectionMatrix();
  }

  refreshLobbyAvatar() {
    if (!this.lobby) return;
    const old = this.lobby.avatar;
    if (old) this.lobby.avatarPivot.remove(old);
    const outfit = outfitOf(this.profile.outfit);
    const avatar = createHumanoid({
      outfit: { top: outfit.top, pants: outfit.pants, accent: outfit.accent, vest: outfit.vest },
      skin: skinOf(this.profile.skin).color,
      helmet: this.profile.helmet,
      backpack: this.profile.backpack,
      weapon: this.profile.primary,
      accent: outfit.accent
    });
    avatar.scale.setScalar(1.28);
    avatar.position.set(0, 0.02, 0);
    avatar.rotation.y = -0.28;
    avatar.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.lobby.avatarPivot.add(avatar);
    this.lobby.avatar = avatar;
  }

  updateLobby(dt) {
    const l = this.lobby;
    if (!l) return;
    l.time += dt;
    if (!this.lobbyDragging) this.lobbyRotation += dt * 0.075;
    l.avatarPivot.rotation.y = this.lobbyRotation;
    l.avatarPivot.position.y = Math.sin(l.time * 1.15) * 0.012;
    if (l.avatar) {
      const parts = l.avatar.userData.parts;
      if (parts) {
        parts.torso.position.y = 1.2 + Math.sin(l.time * 1.5) * 0.008;
        parts.leftArm.rotation.x = -1.32 + Math.sin(l.time * 1.2) * 0.025;
        parts.rightArm.rotation.x = -1.18 + Math.sin(l.time * 1.2 + 0.4) * 0.02;
        parts.head.rotation.y = Math.sin(l.time * 0.55) * 0.08;
      }
    }
    l.embers.rotation.y = l.time * 0.018;
    const pos = l.embers.geometry.attributes.position;
    const a = pos.array;
    for (let i = 0; i < l.speeds.length; i++) {
      a[i * 3 + 1] += dt * l.speeds[i];
      if (a[i * 3 + 1] > 5) {
        a[i * 3 + 1] = 0;
        a[i * 3] = (Math.random() - 0.5) * 9;
        a[i * 3 + 2] = (Math.random() - 0.5) * 7;
      }
    }
    pos.needsUpdate = true;
  }

  /* ============================================================
     Bootstrap / loading
     ============================================================ */
  startLoading() {
    const loading = $('#loading');
    loading.classList.remove('fade-out');
    loading.style.display = 'flex';
    $('#load-fill').style.width = '0%';
    $('#load-pct').textContent = '0%';
    $('#load-status').textContent = LOAD_STEPS[0][1];
    this.loadingStep = 0;
    clearInterval(this.loadTimer);
    // Timed rather than rAF-driven so the boot screen still finishes when the
    // tab is backgrounded or the compositor throttles animation frames.
    const started = performance.now();
    const duration = 2100;
    const tick = () => {
      const p = Math.min(1, (performance.now() - started) / duration);
      let step = LOAD_STEPS[0];
      for (const s of LOAD_STEPS) if (p >= s[0] - 0.001) step = s;
      const pct = Math.round(p * 100);
      $('#load-fill').style.width = pct + '%';
      $('#load-pct').textContent = pct + '%';
      $('#load-status').textContent = step[1];
      if (p >= 1) {
        clearInterval(this.loadTimer);
        this.loadTimer = 0;
        this.hideLoading();
      }
    };
    tick();
    this.loadTimer = setInterval(tick, 55);
  }

  hideLoading() {
    const loading = $('#loading');
    loading.classList.add('fade-out');
    setTimeout(() => { loading.style.display = 'none'; }, 760);
  }

  showLoading() {
    const loading = $('#loading');
    loading.classList.remove('fade-out');
    loading.style.display = 'flex';
    $('#load-fill').style.width = '6%';
    $('#load-pct').textContent = '6%';
    $('#load-status').textContent = 'QUEUING FOR MATCH';
  }

  setMatchLoading(pct, text) {
    $('#load-fill').style.width = Math.round(pct * 100) + '%';
    $('#load-pct').textContent = Math.round(pct * 100) + '%';
    $('#load-status').textContent = text;
  }

  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  /* ============================================================
     Match lifecycle
     ============================================================ */
  async startMatch(modeId = this.selectedMode || this.profile.mode, mapId = this.selectedMap || this.profile.map) {
    if (this.starting) return;
    this.starting = true;
    try {
      this.closeModal();
      audio.init();
      this.selectedMode = MODES[modeId] ? modeId : 'br';
      this.selectedMap = MAPS[mapId] ? mapId : 'bermuda';
      this.profile.mode = this.selectedMode;
      this.profile.map = this.selectedMap;
      saveProfile(this.profile);
      this.syncProfileUI();

      $('#results').classList.add('hidden');
      this.hud.hideResults();
      this.showLoading();
      await this.delay(220);
      this.setMatchLoading(0.28, 'SYNCING OPERATORS');
      await this.delay(120);

      if (this.game) {
        this.game.dispose();
        this.game = null;
      }
      this.setMatchLoading(0.52, 'BUILDING BATTLEGROUND');
      await this.delay(70);

      const mode = MODES[this.selectedMode];
      const map = MAPS[this.selectedMap];
      this.qualityKey = this.resolveQuality(this.profile.settings.quality);
      this.game = new Game({
        renderer: this.renderer,
        profile: this.profile,
        map,
        mode,
        hud: this.hud,
        input: this.input,
        quality: this.qualityKey,
        startMatch: this.startMatch.bind(this),
        endGame: this.endGame.bind(this),
        applyResult: this.applyResult.bind(this),
        openSettings: this.openSettings.bind(this),
        setGame: game => { this.game = game; }
      });

      this.setMatchLoading(0.86, 'DEPLOYING OPERATOR');
      await this.delay(180);
      this.setMatchLoading(1, 'MATCH LIVE');
      await this.delay(110);
      this.hideLoading();
      this.starting = false;
    } catch (err) {
      console.error('[BLAZE] Failed to start match:', err);
      this.starting = false;
      this.hideLoading();
      if (this.game) { try { this.game.dispose(); } catch {} this.game = null; }
      $('#lobby').classList.remove('hidden');
      this.renderer.domElement.classList.remove('in-game');
      this.toast('DEPLOYMENT FAILED', 'CHECK THE CONSOLE AND TRY AGAIN');
    }
  }

  applyResult(data) {
    this.profile = applyMatchResult(this.profile, data);
    this.applyOutfitCache();
    this.syncProfileUI();
    saveProfile(this.profile);
  }

  endGame() {
    if (this.game) {
      try { this.game.dispose(); } catch (err) { console.warn(err); }
      this.game = null;
    }
    this.input.setEnabled(false);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.hideLockHint();
    this.hud.hide();
    this.hud.hideResults();
    this.hud.togglePause(false);
    $('#results').classList.add('hidden');
    $('#lobby').classList.remove('hidden');
    this.renderer.domElement.classList.remove('in-game');
    this.syncProfileUI();
    this.refreshLobbyAvatar();
  }

  showLockHint() {
    let hint = $('#lock-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'lock-hint';
      hint.innerHTML = '<b>CLICK TO ENGAGE MOUSE</b><span>MOVE TO LOOK · LMB FIRE · RMB AIM</span>';
      $('#app').appendChild(hint);
    }
    hint.classList.remove('hidden');
  }

  hideLockHint() { $('#lock-hint')?.classList.add('hidden'); }

  /* ============================================================
     UI wiring
     ============================================================ */
  bindUI() {
    // top navigation
    $$('.ptab').forEach(btn => btn.addEventListener('click', () => this.setTab(btn.dataset.tab)));
    $$('.dock-btn').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.tab) this.setTab(btn.dataset.tab);
      else if (btn.dataset.action === 'settings') this.openSettings();
    }));
    $$('[data-tab-jump]').forEach(btn => btn.addEventListener('click', () => this.setTab(btn.dataset.tabJump)));

    // mode cards
    $$('.mode-card').forEach(card => card.addEventListener('click', () => {
      this.selectedMode = card.dataset.mode;
      this.profile.mode = this.selectedMode;
      saveProfile(this.profile);
      this.syncProfileUI();
    }));

    // deploy
    $('#btn-play').addEventListener('click', () => this.startMatch());
    $('#btn-again')?.addEventListener('click', () => this.startMatch());
    $('#btn-lobby')?.addEventListener('click', () => this.endGame());

    // character tabs
    $$('#char-tabs .stab').forEach(btn => btn.addEventListener('click', () => {
      $$('#char-tabs .stab').forEach(b => b.classList.toggle('active', b === btn));
      this.charCategory = btn.dataset.cat;
      this.renderCharacterItems();
    }));
    $('#btn-randomize').addEventListener('click', () => {
      randomizeLook(this.profile);
      this.applyOutfitCache();
      this.refreshLobbyAvatar();
      this.syncProfileUI();
      this.toast('OPERATOR RANDOMIZED', outfitOf(this.profile.outfit).name);
    });

    // loadout slots
    $$('.slot-card').forEach(card => card.addEventListener('click', () => {
      this.loadoutSlot = card.dataset.slot;
      this.renderLoadout();
    }));

    // sound + settings
    $('#btn-sound').addEventListener('click', () => {
      audio.init();
      this.profile.settings.sound = !this.profile.settings.sound;
      audio.setEnabled(this.profile.settings.sound);
      saveProfile(this.profile);
      this.updateSoundButton();
      this.toast(this.profile.settings.sound ? 'AUDIO ENABLED' : 'AUDIO MUTED');
    });
    $('#btn-settings').addEventListener('click', () => this.openSettings());

    // currencies / store
    $('#btn-coins').addEventListener('click', () => this.openStore());
    $('#btn-gems').addEventListener('click', () => this.openStore());

    // mission
    $('#btn-missions').addEventListener('click', () => this.openMissions());

    // friends
    $$('[data-invite]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.sent) return;
      btn.dataset.sent = '1';
      btn.textContent = 'SENT';
      btn.style.opacity = '0.55';
      this.toast('SQUAD INVITE SENT', btn.dataset.invite);
    }));

    // modal backdrop / close
    $('#modal .modal-backdrop').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', e => {
      if (e.target.closest('.modal-close')) this.closeModal();
    });

    // Canvas: pointer lock hint
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) this.hideLockHint();
    });

    // lobby character dragging
    const stage = $('.lobby-main');
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('button, .play-panel, .profile-card, .topbar, .dock, a')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.lobbyDragging = true;
      this.lobbyPointer = e.pointerId;
      this.lobbyLastX = e.clientX;
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!this.lobbyDragging || e.pointerId !== this.lobbyPointer) return;
      const dx = e.clientX - this.lobbyLastX;
      this.lobbyLastX = e.clientX;
      this.lobbyRotation += dx * 0.008;
    });
    const endDrag = e => {
      if (e.pointerId !== this.lobbyPointer) return;
      this.lobbyDragging = false;
      this.lobbyPointer = null;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // escape closes modal
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !$('#modal').classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        this.closeModal();
      }
    }, true);

    // pause when tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.game.paused && !this.game.over) this.game.pause();
    });

    this.updateSoundButton();
  }

  setTab(tab) {
    if (!tab) return;
    this.activeTab = tab;
    $$('.ptab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (tab === 'character') this.renderCharacterItems();
    if (tab === 'loadout') this.renderLoadout();
    if (tab === 'maps') this.renderMaps();
  }

  /* ============================================================
     Profile & lobby UI
     ============================================================ */
  applyOutfitCache() {
    const o = outfitOf(this.profile.outfit);
    this.profile.outfitTop = o.top;
    this.profile.outfitAccent = o.accent;
    this.profile.outfitPants = o.pants;
    this.profile.outfitVest = o.vest;
    this.profile.rank = tierForLevel(this.profile.level) + ' ' + (this.profile.rank.includes('IV') ? 'IV' : '');
  }

  syncProfileUI() {
    const p = this.profile;
    const outfit = outfitOf(p.outfit);
    const skin = skinOf(p.skin);

    $('#lobby-name').textContent = p.name;
    $('#lobby-level').textContent = p.level;
    $('#lobby-rank').textContent = tierForLevel(p.level);
    $('#coin-count').textContent = p.coins.toLocaleString();
    $('#gem-count').textContent = p.gems.toLocaleString();
    $('#stat-matches').textContent = p.stats.matches.toLocaleString();
    $('#stat-wins').textContent = p.stats.wins.toLocaleString();
    $('#stat-kd').textContent = Number(p.stats.kd).toFixed(2);
    const xp = Math.max(0, Math.min(1, p.xp / Math.max(1, p.xpMax)));
    $('#xp-fill').style.width = (xp * 100).toFixed(1) + '%';
    $('#xp-label').textContent = `${Math.round(p.xp).toLocaleString()} / ${p.xpMax.toLocaleString()} XP`;

    $('#stage-name').textContent = p.name;
    $('#hero-name').textContent = p.name;
    $('#hero-level').textContent = p.level;
    $('#hero-rank').textContent = tierForLevel(p.level);
    const tier = tierForLevel(p.level);
    const rankEl = $('.rank-emblem span');
    const rankLabel = $('.rank-emblem i');
    if (rankEl) rankEl.textContent = ['IV', 'III', 'II', 'I'][Math.floor((p.level % 20) / 5)] || 'IV';
    if (rankLabel) rankLabel.textContent = tier;
    $('#hero-outfit').textContent = outfit.name;
    $('#char-primary').textContent = WEAPONS[p.primary]?.name || 'VANGUARD AR';

    this.updateSoundButton();
    this.updateModeUI();
    this.renderMaps();
    this.renderCharacterItems();
    this.renderLoadout();
  }

  updateModeUI() {
    const modeId = this.selectedMode || this.profile.mode || 'br';
    this.selectedMode = MODES[modeId] ? modeId : 'br';
    const mode = MODES[this.selectedMode];
    const map = MAPS[this.selectedMap || this.profile.map] || MAPS.bermuda;
    this.selectedMap = map.id;
    $$('.mode-card').forEach(c => c.classList.toggle('active', c.dataset.mode === this.selectedMode));
    $('#mi-map').textContent = map.name;
    const detail = mode.id === 'br'
      ? `Solo · ${mode.players} players · Ranked`
      : mode.id === 'tdm'
        ? `Alpha vs Bravo · ${mode.players} players`
        : `Live targets · Unlimited ammo`;
    $('#mi-detail').textContent = detail;
    const squad = mode.id === 'tdm' ? 'SQUAD' : 'SOLO';
    $('#deploy-sub').textContent = `${squad} · ${map.name}`;
  }

  updateSoundButton() {
    const on = this.profile.settings.sound;
    $('#btn-sound use')?.setAttribute('href', on ? '#i-sound' : '#i-mute');
    const f = $('#fps-hud');
    if (f) f.classList.toggle('show', !!this.profile.settings.showFps);
    if (this.game) audio.setEnabled(on);
  }

  selectMap(id) {
    if (!MAPS[id]) return;
    this.selectedMap = id;
    this.profile.map = id;
    saveProfile(this.profile);
    this.updateModeUI();
    this.renderMaps();
    this.toast('DROP ZONE SET', MAPS[id].name);
  }

  renderMaps() {
    const strip = $('#map-strip');
    if (strip) {
      strip.innerHTML = '';
      for (const id of MAP_ORDER) {
        const map = MAPS[id];
        const btn = document.createElement('button');
        btn.className = 'map-mini' + (id === this.selectedMap ? ' active' : '');
        btn.innerHTML = `<canvas width="240" height="140"></canvas>
          <span class="mm-label"><b>${map.short}</b><span>${map.region}</span></span>
          <span class="mm-check"><svg class="icon"><use href="#i-check"/></svg></span>`;
        btn.addEventListener('click', () => this.selectMap(id));
        strip.appendChild(btn);
        drawMapPreview(btn.querySelector('canvas'), map, id === this.selectedMap);
      }
    }
    const list = $('#map-list');
    if (list) {
      list.innerHTML = '';
      for (const id of MAP_ORDER) {
        const map = MAPS[id];
        const active = id === this.selectedMap;
        const card = document.createElement('button');
        card.className = 'maps-card' + (active ? ' active' : '');
        card.innerHTML = `<canvas width="600" height="190"></canvas>
          <span class="mc-selected">SELECTED</span>
          <span class="mc-grad"></span>
          <span class="mc-body">
            <span><h3>${map.name}</h3><span class="mc-tags"><span>${map.region}</span><span>${map.size}</span><span>${map.weather}</span></span></span>
            <span class="mc-play"><svg class="icon"><use href="#i-play"/></svg></span>
          </span>`;
        drawMapPreview(card.querySelector('canvas'), map, active);
        card.addEventListener('click', e => {
          if (e.target.closest('.mc-play')) { this.selectMap(id); this.startMatch(this.selectedMode, id); }
          else this.selectMap(id);
        });
        list.appendChild(card);
      }
    }
  }

  renderCharacterItems() {
    const host = $('#char-items');
    if (!host) return;
    const cat = this.charCategory;
    let items;
    if (cat === 'outfit') items = OUTFITS.map(o => ({ id: o.id, name: o.name, rarity: o.rarity, a: o.top, b: o.vest, c: o.accent, d: o.pants, kind: 'outfit' }));
    else if (cat === 'helmet') items = HELMETS.map(o => ({ id: o.id, name: o.name, rarity: o.rarity, a: o.color === 'none' ? '#2c333c' : o.color, b: '#151b22', c: '#ff7a1a', kind: 'gear' }));
    else if (cat === 'backpack') items = BACKPACKS.map(o => ({ id: o.id, name: o.name, rarity: o.rarity, a: o.color === 'none' ? '#2c333c' : o.color, b: '#151b22', c: '#ff7a1a', kind: 'gear' }));
    else items = SKINS.map(o => ({ id: o.id, name: o.name, rarity: 'COMMON', a: o.color, b: o.color, c: '#ffffff', kind: 'skin' }));

    const selected = cat === 'outfit' ? this.profile.outfit
      : cat === 'helmet' ? this.profile.helmet
        : cat === 'backpack' ? this.profile.backpack
          : this.profile.skin;

    host.innerHTML = '';
    for (const it of items) {
      const btn = document.createElement('button');
      btn.className = 'char-item' + (it.id === selected ? ' active' : '');
      const swatch = it.kind === 'skin'
        ? `<span class="char-swatch" style="background:radial-gradient(circle at 50% 46%,${it.a},${it.a}99 32%,#0b1015 34%)"></span>`
        : `<span class="char-swatch" style="background:linear-gradient(150deg,${it.a}55,${it.b} 55%,#080c11)">
            <span class="suit" style="background:linear-gradient(180deg,${it.a},${it.d || it.b});border-top:2px solid ${it.c};border-bottom:2px solid ${it.c}55"></span>
          </span>`;
      btn.innerHTML = `${swatch}
        <span class="char-name">${it.name}</span>
        <span class="char-rarity" style="color:${RARITY[it.rarity] || '#9aa8b3'}">${it.rarity}</span>
        <span class="eq-badge"><svg class="icon"><use href="#i-check"/></svg></span>`;
      btn.addEventListener('click', () => {
        this.profile[cat] = it.id;
        saveProfile(this.profile);
        this.applyOutfitCache();
        this.refreshLobbyAvatar();
        this.syncProfileUI();
        this.toast('EQUIPPED', it.name);
      });
      host.appendChild(btn);
    }
  }

  renderLoadout() {
    const slot = this.loadoutSlot;
    $$('.slot-card').forEach(c => c.classList.toggle('active', c.dataset.slot === slot));
    const current = WEAPONS[this.profile[slot]] || WEAPONS.vanguard;
    $('#slot-primary').textContent = WEAPONS[this.profile.primary]?.name || 'VANGUARD AR';
    $('#slot-secondary').textContent = WEAPONS[this.profile.secondary]?.name || 'P92 SIDEARM';

    const list = $('#weapon-list');
    if (list) {
      list.innerHTML = '';
      const ids = slot === 'primary' ? PRIMARY_IDS : SECONDARY_IDS;
      for (const id of ids) {
        const w = WEAPONS[id];
        const row = document.createElement('button');
        row.className = 'weapon-row' + (this.profile[slot] === id ? ' active' : '');
        row.innerHTML = `<span class="wr-icon"><canvas width="72" height="38"></canvas></span>
          <span class="wr-main"><b>${w.name}</b><span>${w.cls}</span></span>
          <span class="wr-tag" style="color:${RARITY[w.rarity] || '#9aa8b3'};border-color:${RARITY[w.rarity] || '#9aa8b3'}55">${w.rarity}</span>`;
        drawWeaponIcon(row.querySelector('canvas'), w);
        row.addEventListener('click', () => {
          this.profile[slot] = id;
          saveProfile(this.profile);
          this.refreshLobbyAvatar();
          this.syncProfileUI();
          this.toast('LOADOUT UPDATED', w.name);
        });
        list.appendChild(row);
      }
    }
    const stats = $('#weapon-stats');
    if (stats) {
      const s = current.stats;
      stats.innerHTML = `<div class="ws-head"><b>${current.name}</b><span>${current.cls}</span></div>
        <div class="ws-bars">
          <div><span>DAMAGE</span><i><b style="width:${s.damage}%"></b></i><em>${s.damage}</em></div>
          <div><span>FIRE RATE</span><i><b style="width:${s.rate}%"></b></i><em>${s.rate}</em></div>
          <div><span>ACCURACY</span><i><b style="width:${s.accuracy}%"></b></i><em>${s.accuracy}</em></div>
          <div><span>RANGE</span><i><b style="width:${s.range}%"></b></i><em>${s.range}</em></div>
        </div>`;
    }
    $('#char-primary').textContent = WEAPONS[this.profile.primary]?.name || 'VANGUARD AR';
  }

  /* ============================================================
     Modals
     ============================================================ */
  openModal(html, opts = {}) {
    this.modalIsSettings = !!opts.settings;
    const modal = $('#modal');
    const card = $('#modal-card');
    card.innerHTML = html;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  closeModal() {
    const modal = $('#modal');
    if (modal.classList.contains('hidden')) return;
    // release pointer lock only when the pointer is on the game canvas
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    const cb = this.settingsCallback;
    this.settingsCallback = null;
    this.modalIsSettings = false;
    if (cb) cb();
  }

  openSettings(onClose = null) {
    this.settingsCallback = onClose;
    this.renderSettings();
  }

  renderSettings() {
    const s = this.profile.settings;
    const quality = s.quality || 'auto';
    const seg = (val, label, current) => `<button data-val="${val}" class="${current === val ? 'active' : ''}">${label}</button>`;
    const row = (name, desc, control) => `<div class="setting-row"><div><div class="set-name">${name}</div><div class="set-desc">${desc}</div></div>${control}</div>`;
    const toggle = (key, on) => `<button class="toggle ${on ? 'on' : ''}" data-toggle="${key}" aria-label="${key}"></button>`;

    this.openModal(`
      <div class="modal-head">
        <div><h2>SETTINGS</h2><span>SYSTEM CONFIGURATION · BLAZE ENGINE 3.2</span></div>
        <button class="modal-close" aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
      </div>
      ${row('SENSITIVITY', 'MOUSE / TOUCH LOOK SPEED', `<input id="set-sens" type="range" min="0.35" max="2.2" step="0.05" value="${s.sens}">`)}
      ${row('FIELD OF VIEW', 'WIDER VIEW, MORE AWARENESS', `<input id="set-fov" type="range" min="60" max="96" step="1" value="${s.fov}">`)}
      ${row('GRAPHICS QUALITY', 'APPLIES TO THE NEXT DEPLOYMENT', `<div class="seg" id="set-quality">${seg('auto', 'AUTO', quality)}${seg('low', 'LOW', quality)}${seg('medium', 'MED', quality)}${seg('high', 'HIGH', quality)}</div>`)}
      ${row('SOUND EFFECTS', 'WEAPONS · FOOTSTEPS · AMBIENCE', toggle('sound', s.sound))}
      ${row('SHOW FPS', 'PERFORMANCE COUNTER IN MATCH', toggle('showFps', s.showFps))}
      ${row('AIM ASSIST', 'SOFT TARGET SNAPPING ON TOUCH', toggle('aimAssist', s.aimAssist))}
      ${row('AUTO SPRINT', 'SPRINT WHEN PUSHING FORWARD', toggle('autoSprint', s.autoSprint))}
      ${row('INVERT LOOK', 'REVERSE VERTICAL AIM', toggle('inverted', s.inverted))}
      <div class="settings-actions">
        <button class="ghost-btn" id="set-reset">RESET DEFAULTS</button>
        <button class="solid-btn" id="set-apply" style="margin-left:auto">APPLY & CLOSE</button>
      </div>
      <div style="font-size:6px;letter-spacing:.14em;color:#4d5a66;margin-top:12px">TOUCH CONTROLS · LEFT STICK MOVE · DRAG RIGHT TO AIM · FIRE / ADS / JUMP / CROUCH / RELOAD BUTTONS</div>
    `, { settings: true });

    $('#set-sens').addEventListener('input', e => {
      this.profile.settings.sens = parseFloat(e.target.value);
      saveProfile(this.profile);
    });
    $('#set-fov').addEventListener('input', e => {
      this.profile.settings.fov = parseInt(e.target.value, 10);
      saveProfile(this.profile);
      if (this.game) {
        this.game.player.baseFov = this.profile.settings.fov;
        if (!this.game.player.aiming) {
          this.game.camera.fov = this.profile.settings.fov;
          this.game.camera.updateProjectionMatrix();
        }
      }
    });
    $$('#set-quality button').forEach(btn => btn.addEventListener('click', () => {
      this.profile.settings.quality = btn.dataset.val;
      saveProfile(this.profile);
      this.qualityKey = this.resolveQuality(btn.dataset.val);
      this.applyQuality();
      $$('#set-quality button').forEach(b => b.classList.toggle('active', b === btn));
      this.toast('QUALITY SET', QUALITY[this.qualityKey].name + ' · NEXT MATCH');
    }));
    $$('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      this.profile.settings[key] = !this.profile.settings[key];
      btn.classList.toggle('on', this.profile.settings[key]);
      saveProfile(this.profile);
      if (key === 'sound') { audio.init(); audio.setEnabled(this.profile.settings.sound); this.updateSoundButton(); }
      if (key === 'showFps') this.updateSoundButton();
    }));
    $('#set-reset').addEventListener('click', () => {
      this.profile.settings = structuredClone(DEFAULT_PROFILE.settings);
      saveProfile(this.profile);
      this.qualityKey = this.resolveQuality(this.profile.settings.quality);
      this.applyQuality();
      audio.init();
      audio.setEnabled(this.profile.settings.sound);
      this.updateSoundButton();
      this.renderSettings();
      this.toast('SETTINGS RESTORED', 'DEFAULT CONFIGURATION');
    });
    $('#set-apply').addEventListener('click', () => this.closeModal());
  }

  openMissions() {
    const rows = [
      ['SURVIVE THE STORM', 'Reach the top 10 in Battle Royale', 2, 3, '600 XP'],
      ['TRIGGER DISCIPLINE', 'Eliminate 8 enemies with an assault rifle', 5, 8, '450 XP'],
      ['LAST ONE STANDING', 'Win a Battle Royale match', 0, 1, '1,200 XP'],
      ['ROAD WARRIOR', 'Drive a vehicle for 400 meters', 260, 400, '300 XP'],
      ['CLASH CONTENDER', 'Score 15 eliminations in Clash 5v5', 9, 15, '800 XP']
    ];
    const list = rows.map(([name, desc, cur, max, reward], i) => `
      <div class="setting-row">
        <div><div class="set-name">${name} ${i === 0 ? '<span style="color:#ff7a1a">· CLAIMABLE</span>' : ''}</div><div class="set-desc">${desc}</div>
          <div class="mission-track" style="width:220px;margin-top:6px"><i style="width:${(cur / max) * 100}%"></i></div>
        </div>
        <div style="text-align:right"><b style="font-family:var(--num);color:#ffc74a;font-size:13px">${cur}/${max}</b><div class="set-desc" style="margin-top:3px">${reward}</div></div>
      </div>`).join('');
    this.openModal(`
      <div class="modal-head"><div><h2>SEASON MISSIONS</h2><span>SEASON 4 · FIRESTORM</span></div>
        <button class="modal-close"><svg class="icon"><use href="#i-close"/></svg></button></div>
      ${list}
      <div class="settings-actions"><button class="solid-btn" id="claim-mission">CLAIM REWARD</button>
        <button class="ghost-btn" id="close-missions" style="margin-left:auto">CLOSE</button></div>
    `);
    $('#claim-mission').addEventListener('click', () => {
      this.profile.coins += 600;
      this.profile.xp += 400;
      saveProfile(this.profile);
      this.syncProfileUI();
      this.toast('MISSION REWARD', '+600 COINS · +400 XP');
    });
    $('#close-missions').addEventListener('click', () => this.closeModal());
  }

  openStore() {
    this.openModal(`
      <div class="modal-head"><div><h2>BLAZE STORE</h2><span>SUPPLY DROP · SEASON 4</span></div>
        <button class="modal-close"><svg class="icon"><use href="#i-close"/></svg></button></div>
      <div class="setting-row"><div><div class="set-name">WEEKEND SUPPLY CRATE</div><div class="set-desc">2 SHIELD CELLS · 2 MEDKITS · RARE WEAPON SKIN</div></div>
        <button class="solid-btn" data-buy="2200">2,200 COINS</button></div>
      <div class="setting-row"><div><div class="set-name">ELITE OPERATOR BUNDLE</div><div class="set-desc">NEON RONIN OUTFIT · CRIMSON EDGE OUTFIT · BLAZE CROWN</div></div>
        <button class="solid-btn" data-buy="720">720 GEMS</button></div>
      <div class="setting-row"><div><div class="set-name">FIRESTORM PASS</div><div class="set-desc">50 TIERS · EXCLUSIVE LOOT · 2X SEASON XP</div></div>
        <button class="solid-btn" data-buy="480">480 GEMS</button></div>
      <div style="font-size:6px;letter-spacing:.14em;color:#4d5a66;margin-top:12px">PURCHASES IN THIS DEMO ARE STORED LOCALLY ON YOUR DEVICE.</div>
    `);
    $$('[data-buy]').forEach(btn => btn.addEventListener('click', () => {
      const price = parseInt(btn.dataset.buy, 10);
      this.toast('STORE', 'PURCHASE SIMULATED · LOCAL PROFILE ONLY');
      btn.textContent = 'OWNED';
      btn.disabled = true;
      btn.style.opacity = '0.5';
      if (price < 1000) this.profile.gems = Math.max(0, this.profile.gems - price);
      else this.profile.coins = Math.max(0, this.profile.coins - price);
      saveProfile(this.profile);
      this.syncProfileUI();
    }));
  }

  toast(title, sub = '') {
    const wrap = $('#toast-wrap');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${title}${sub ? ` <span style="color:#7d8b96">${sub}</span>` : ''}`;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 2900);
  }

  /* ============================================================
     Render loop
     ============================================================ */
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    if (this.game && this.game.active) {
      this.game.update(dt);
      this.renderer.render(this.game.scene, this.game.camera);
    } else {
      this.updateLobby(dt);
      if (this.lobby) this.renderer.render(this.lobby.scene, this.lobby.camera);
    }

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.45) {
      const fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      const lobbyFps = $('#fps-lobby');
      if (lobbyFps) lobbyFps.textContent = fps;
      const hudFps = $('#fps-hud');
      if (hudFps) hudFps.textContent = `${fps} FPS`;
    }
  }
}

function boot() {
  try {
    window.blaze = new App();
  } catch (err) {
    console.error('[BLAZE] Boot failed:', err);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.display = 'flex';
      loading.classList.remove('fade-out');
      const status = document.getElementById('load-status');
      if (status) status.textContent = 'WEBGL UNAVAILABLE · ENABLE HARDWARE ACCELERATION';
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
