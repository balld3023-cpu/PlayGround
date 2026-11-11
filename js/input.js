import { clamp } from './utils.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('touch');
    this.mouse = { dx: 0, dy: 0, locked: false, left: false, right: false };
    this.firing = false;
    this.aiming = false;
    this.adsToggle = false;
    this.sprintToggle = false;
    this.crouchToggle = false;
    this.joy = { x: 0, y: 0, active: false, pointerId: null, ox: 0, oy: 0 };
    this.touchLook = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    this.listeners = {};
    this.canvas = document.getElementById('stage');
    this.hud = document.getElementById('hud');
    this.stickZone = document.getElementById('stick-zone');
    this.stickBase = document.getElementById('stick-base');
    this.stickKnob = document.getElementById('stick-knob');
    this.fireBtn = document.getElementById('t-fire');
    this.adsBtn = document.getElementById('t-ads');
    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
    this.createLookZone();
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === this.canvas;
      if (!this.mouse.locked && this.enabled) this.emit('unlock');
    });
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, arg) { (this.listeners[name] || []).forEach(f => f(arg)); }
  clearListeners() {
    this.listeners = {};
    this.firing = false;
    this.aiming = false;
    this.mouse.left = false;
    this.mouse.right = false;
    this.mouse.dx = this.mouse.dy = 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear(); this.firing = false; this.aiming = false;
      this.adsToggle = false; this.sprintToggle = false; this.crouchToggle = false;
      this.mouse.left = this.mouse.right = false;
      document.querySelectorAll('.tbtn.on').forEach(el => el.classList.remove('on'));
      if (document.pointerLockElement) document.exitPointerLock();
      this.resetJoystick();
      document.getElementById('touch-ui')?.classList.add('hidden');
      document.body.classList.remove('playing');
    } else {
      if (this.isTouch) document.getElementById('touch-ui')?.classList.remove('hidden');
      document.body.classList.add('playing');
    }
  }

  createLookZone() {
    const z = document.createElement('div');
    z.className = 'look-zone';
    z.id = 'look-zone';
    this.hud.appendChild(z);
    this.lookZone = z;
    z.addEventListener('pointerdown', e => {
      if (!this.enabled || !this.isTouch) return;
      e.preventDefault();
      this.touchLook.active = true; this.touchLook.pointerId = e.pointerId;
      this.touchLook.lastX = e.clientX; this.touchLook.lastY = e.clientY;
      z.setPointerCapture(e.pointerId);
    });
    z.addEventListener('pointermove', e => {
      if (!this.touchLook.active || e.pointerId !== this.touchLook.pointerId) return;
      this.mouse.dx += e.clientX - this.touchLook.lastX;
      this.mouse.dy += e.clientY - this.touchLook.lastY;
      this.touchLook.lastX = e.clientX; this.touchLook.lastY = e.clientY;
    });
    const end = e => { if (e.pointerId === this.touchLook.pointerId) this.touchLook.active = false; };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('touchmove', e => { if (this.enabled) e.preventDefault(); }, { passive: false });
  }

  bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      const k = e.code;
      if (['Space', 'Tab', 'ControlLeft', 'ShiftLeft', 'KeyR', 'KeyF', 'KeyH', 'KeyJ', 'Digit1', 'Digit2', 'Digit3'].includes(k)) e.preventDefault();
      if (e.repeat) { this.keys.add(k); return; }
      this.keys.add(k);
      switch (k) {
        case 'Space': this.emit('jump'); break;
        case 'ControlLeft': case 'KeyC': this.emit('crouch'); break;
        case 'KeyR': this.emit('reload'); break;
        case 'KeyF': this.emit('interact'); break;
        case 'KeyH': this.emit('med'); break;
        case 'KeyJ': this.emit('shield'); break;
        case 'Digit1': this.emit('slot', 0); break;
        case 'Digit2': this.emit('slot', 1); break;
        case 'Digit3': this.emit('slot', 2); break;
        case 'Tab': this.emit('scoreboard', true); break;
        case 'Escape': this.emit('pause'); break;
        case 'KeyQ': this.emit('swap'); break;
      }
      if (k === 'ShiftLeft') this.emit('sprint', true);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft') this.emit('sprint', false);
      if (e.code === 'Tab') this.emit('scoreboard', false);
      if (e.code === 'ControlLeft' || e.code === 'KeyC') this.emit('crouchRelease');
    });
  }

  bindMouse() {
    this.canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (!this.mouse.locked) {
        if (this.isTouch) return;
        try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {}
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.firing = true; }
      if (e.button === 2) { this.mouse.right = true; this.aiming = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.left = false; this.firing = false; }
      if (e.button === 2) { this.mouse.right = false; this.aiming = this.adsToggle; }
    });
    window.addEventListener('mousemove', e => {
      if (!this.enabled || !this.mouse.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    window.addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.emit('swap', e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  bindTouch() {
    const zone = this.stickZone;
    const base = this.stickBase, knob = this.stickKnob;
    const maxR = 44;
    const setKnob = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const cl = d > maxR ? maxR / d : 1;
      knob.style.transform = `translate(${dx * cl}px,${dy * cl}px)`;
      this.joy.x = clamp(dx / maxR, -1, 1);
      this.joy.y = clamp(dy / maxR, -1, 1);
      const mag = Math.min(1, Math.hypot(this.joy.x, this.joy.y));
      if (mag > 0.25 && !this.joy.active) this.joy.active = true;
      base.classList.add('active');
    };
    zone.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.joy.pointerId = e.pointerId;
      const rect = base.getBoundingClientRect();
      this.joy.ox = rect.left + rect.width / 2;
      this.joy.oy = rect.top + rect.height / 2;
      // move stick under thumb
      const bx = rect.width / 2;
      base.style.left = (e.clientX - bx) + 'px';
      base.style.top = (e.clientY - bx) + 'px';
      base.style.bottom = 'auto';
      this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      setKnob(0, 0);
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joy.pointerId) return;
      setKnob(e.clientX - this.joy.ox, e.clientY - this.joy.oy);
    });
    const end = e => {
      if (e.pointerId !== this.joy.pointerId) return;
      this.resetJoystick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', e => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('on');
        el.setPointerCapture?.(e.pointerId);
        on?.();
      });
      const up = e => { el.classList.remove('on'); off?.(); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', e => { if (e.buttons === 0) up(e); });
    };
    hold(this.fireBtn, () => { this.firing = true; this.emit('fireStart'); }, () => { this.firing = false; });
    // ADS is a toggle, so its lit state must survive pointer-up.
    this.adsBtn.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      e.preventDefault(); e.stopPropagation();
      this.adsToggle = !this.adsToggle;
      this.aiming = this.adsToggle;
      this.adsBtn.classList.toggle('on', this.adsToggle);
      this.emit('ads', this.adsToggle);
    });
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', e => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('on');
        fn(el);
      });
      const up = () => el.classList.remove('on');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    tap('t-menu', () => this.emit('pause'));
    tap('t-jump', () => this.emit('jump'));
    tap('t-crouch', () => { this.crouchToggle = !this.crouchToggle; this.emit('crouch', this.crouchToggle); });
    tap('t-reload', () => this.emit('reload'));
    tap('t-swap', () => this.emit('swap'));
    tap('t-sprint', el => { this.sprintToggle = !this.sprintToggle; el.classList.toggle('on', this.sprintToggle); });
    tap('t-interact', () => this.emit('interact'));
    // prevent iOS scroll / zoom gestures on HUD
    document.addEventListener('gesturestart', e => e.preventDefault());
    this.hud.addEventListener('touchmove', e => { if (this.enabled && e.target.closest('.look-zone,#stick-zone')) e.preventDefault(); }, { passive: false });
  }

  resetJoystick() {
    this.joy.x = 0; this.joy.y = 0; this.joy.active = false; this.joy.pointerId = null;
    this.stickKnob.style.transform = 'translate(0,0)';
    this.stickBase.classList.remove('active');
    this.stickBase.style.left = ''; this.stickBase.style.top = ''; this.stickBase.style.bottom = '';
  }

  get moving() {
    const k = this.keys;
    return k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD') ||
      Math.abs(this.joy.x) > 0.18 || Math.abs(this.joy.y) > 0.18;
  }
  get forward() {
    let f = 0;
    if (this.keys.has('KeyW')) f += 1;
    if (this.keys.has('KeyS')) f -= 1;
    f -= this.joy.y;
    return clamp(f, -1, 1);
  }
  get strafe() {
    let s = 0;
    if (this.keys.has('KeyD')) s += 1;
    if (this.keys.has('KeyA')) s -= 1;
    s += this.joy.x;
    return clamp(s, -1, 1);
  }
  get sprinting() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle; }
  get crouching() { return this.keys.has('ControlLeft') || this.keys.has('KeyC') || this.crouchToggle; }

  consumeLook() {
    const dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = 0; this.mouse.dy = 0;
    return { dx, dy };
  }
}
