import { DEFAULT_PROFILE, OUTFITS, SKINS, HELMETS, BACKPACKS, WEAPONS, OPERATORS } from './config.js';

const KEY = 'blaze-royale-profile-v1';

export function loadProfile() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  const p = structuredClone(DEFAULT_PROFILE);
  if (saved && typeof saved === 'object') {
    Object.assign(p, saved);
    p.settings = { ...DEFAULT_PROFILE.settings, ...(saved.settings || {}) };
    p.stats = { ...DEFAULT_PROFILE.stats, ...(saved.stats || {}) };
  }
  return p;
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export function outfitOf(id) { return OUTFITS.find(o => o.id === id) || OUTFITS[0]; }
export function skinOf(id) { return SKINS.find(o => o.id === id) || SKINS[1]; }
export function helmetOf(id) { return HELMETS.find(o => o.id === id) || HELMETS[0]; }
export function backpackOf(id) { return BACKPACKS.find(o => o.id === id) || BACKPACKS[0]; }
export function operatorOf(id) { return OPERATORS.find(o => o.id === id) || OPERATORS[0]; }
export function weaponOf(id) { return WEAPONS[id] || WEAPONS.vanguard; }

export function getLoadout(p) {
  const primary = weaponOf(p.primary);
  const secondary = weaponOf(p.secondary);
  return [
    primary.slot === 'secondary' ? primary : primary,
    secondary.slot === 'primary' ? secondary : secondary
  ];
}

export function applyMatchResult(p, result) {
  p.stats.matches++;
  if (result.win) p.stats.wins++;
  p.stats.kills += result.kills;
  p.stats.damage += result.damage;
  p.stats.bestKills = Math.max(p.stats.bestKills || 0, result.kills);
  const kdDeaths = Math.max(1, p.stats.matches - p.stats.wins * 0.6);
  p.stats.kd = +(p.stats.kills / kdDeaths).toFixed(2);
  p.xp += result.xp;
  while (p.xp >= p.xpMax) { p.xp -= p.xpMax; p.level++; p.xpMax = Math.round(p.xpMax * 1.12); }
  p.coins += result.coins;
  saveProfile(p);
  return p;
}

export function randomizeLook(p) {
  const outs = OUTFITS.filter(o => o.id !== p.outfit);
  p.outfit = outs[Math.floor(Math.random() * outs.length)].id;
  p.skin = SKINS[Math.floor(Math.random() * SKINS.length)].id;
  p.helmet = HELMETS[Math.floor(Math.random() * HELMETS.length)].id;
  p.backpack = BACKPACKS[Math.floor(Math.random() * BACKPACKS.length)].id;
  const ops = OPERATORS.filter(o => o.id !== p.operator);
  p.operator = ops[Math.floor(Math.random() * ops.length)].id;
  saveProfile(p);
  return p;
}

export function tierForLevel(level) {
  if (level >= 60) return 'GRANDMASTER';
  if (level >= 45) return 'HEROIC';
  if (level >= 30) return 'DIAMOND';
  if (level >= 18) return 'PLATINUM';
  if (level >= 8) return 'GOLD';
  return 'SILVER';
}
