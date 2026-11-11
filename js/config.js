/* ============================================================
   BLAZE ROYALE — game data
   ============================================================ */

export const WEAPONS = {
  vanguard: {
    id: 'vanguard', name: 'VANGUARD AR', short: 'AR', cls: 'ASSAULT RIFLE', slot: 'primary',
    dmg: 29, rpm: 620, auto: true, mag: 30, reserve: 150, reload: 2.05, spread: 1.55,
    adsSpread: 0.34, recoil: 0.95, range: 220, falloff: [55, 150, 0.62], pellets: 1,
    moveSpread: 1.2, zoom: 1.55, color: '#d89444', rarity: 'RARE', desc: 'Reliable all-rounder. Strong at mid range.',
    model: 'ar', stats: { damage: 68, rate: 62, accuracy: 74, range: 80 }
  },
  viper: {
    id: 'viper', name: 'VIPER-9', short: 'SMG', cls: 'SUBMACHINE GUN', slot: 'primary',
    dmg: 19, rpm: 880, auto: true, mag: 28, reserve: 180, reload: 1.65, spread: 2.3,
    adsSpread: 0.9, recoil: 0.62, range: 130, falloff: [25, 80, 0.5], pellets: 1,
    moveSpread: 0.8, zoom: 1.35, color: '#4cc9b0', rarity: 'UNCOMMON', desc: 'Hip-fire monster with a blistering cycle rate.',
    model: 'smg', stats: { damage: 44, rate: 91, accuracy: 58, range: 42 }
  },
  breaker: {
    id: 'breaker', name: 'M12 BREAKER', short: 'SG', cls: 'SHOTGUN', slot: 'primary',
    dmg: 13, rpm: 76, auto: false, mag: 6, reserve: 36, reload: 2.5, spread: 6.2,
    adsSpread: 4.2, recoil: 2.6, range: 45, falloff: [10, 28, 0.22], pellets: 9,
    moveSpread: 0.6, zoom: 1.2, color: '#c0553e', rarity: 'RARE', desc: 'Room-clearing devastation. Nine pellets, no mercy.',
    model: 'shotgun', stats: { damage: 92, rate: 24, accuracy: 34, range: 20 }
  },
  longshot: {
    id: 'longshot', name: 'LONGSHOT AWM', short: 'SR', cls: 'SNIPER RIFLE', slot: 'primary',
    dmg: 94, rpm: 42, auto: false, mag: 5, reserve: 30, reload: 3.15, spread: 2.8,
    adsSpread: 0.02, recoil: 3.4, range: 400, falloff: [200, 320, 0.85], pellets: 1,
    moveSpread: 3.2, zoom: 4.2, color: '#7f9bb3', rarity: 'EPIC', desc: 'One shot, one kill. Master the breath before the trigger.',
    model: 'sniper', stats: { damage: 100, rate: 16, accuracy: 97, range: 100 }
  },
  raptor: {
    id: 'raptor', name: 'RAPTOR LMG', short: 'LMG', cls: 'LIGHT MACHINE GUN', slot: 'primary',
    dmg: 27, rpm: 720, auto: true, mag: 60, reserve: 180, reload: 3.8, spread: 2.2,
    adsSpread: 0.75, recoil: 1.25, range: 230, falloff: [60, 160, 0.6], pellets: 1,
    moveSpread: 1.8, zoom: 1.45, color: '#9b8b55', rarity: 'EPIC', desc: 'Suppressive fire. Hold the trigger, own the street.',
    model: 'lmg', stats: { damage: 60, rate: 72, accuracy: 55, range: 78 }
  },
  sidearm: {
    id: 'sidearm', name: 'P92 SIDEARM', short: 'PST', cls: 'PISTOL', slot: 'secondary',
    dmg: 25, rpm: 330, auto: false, mag: 15, reserve: 90, reload: 1.35, spread: 2.0,
    adsSpread: 0.5, recoil: 0.8, range: 120, falloff: [30, 70, 0.5], pellets: 1,
    moveSpread: 0.5, zoom: 1.3, color: '#aeb8c0', rarity: 'COMMON', desc: 'Always in your holster. Never out of the fight.',
    model: 'pistol', stats: { damage: 40, rate: 34, accuracy: 70, range: 50 }
  },
  fang: {
    id: 'fang', name: 'FANG-45', short: 'PST', cls: 'HEAVY PISTOL', slot: 'secondary',
    dmg: 42, rpm: 210, auto: false, mag: 8, reserve: 48, reload: 1.8, spread: 2.4,
    adsSpread: 0.55, recoil: 1.7, range: 140, falloff: [35, 80, 0.55], pellets: 1,
    moveSpread: 0.6, zoom: 1.35, color: '#c98b3f', rarity: 'RARE', desc: 'Hard-hitting hand cannon with a brutal kick.',
    model: 'pistol', stats: { damage: 72, rate: 22, accuracy: 64, range: 55 }
  },
  cyclone: {
    id: 'cyclone', name: 'CYCLONE-12', short: 'SG', cls: 'AUTO SHOTGUN', slot: 'secondary',
    dmg: 10, rpm: 180, auto: true, mag: 8, reserve: 40, reload: 2.8, spread: 7,
    adsSpread: 5, recoil: 1.8, range: 32, falloff: [8, 22, 0.2], pellets: 7,
    moveSpread: 0.7, zoom: 1.2, color: '#6b9c93', rarity: 'EPIC', desc: 'Semi-auto street sweeper for close encounters.',
    model: 'shotgun', stats: { damage: 84, rate: 40, accuracy: 28, range: 15 }
  },
  ghost: {
    id: 'ghost', name: 'GHOST-9', short: 'SMG', cls: 'TACTICAL SMG', slot: 'secondary',
    dmg: 18, rpm: 940, auto: true, mag: 24, reserve: 144, reload: 1.5, spread: 2.6,
    adsSpread: 1.1, recoil: 0.55, range: 110, falloff: [22, 70, 0.45], pellets: 1,
    moveSpread: 0.6, zoom: 1.35, color: '#8ca3b7', rarity: 'RARE', desc: 'Silent, surgical, and absurdly fast.',
    model: 'smg', stats: { damage: 38, rate: 95, accuracy: 60, range: 38 }
  }
};

export const PRIMARY_IDS = ['vanguard', 'viper', 'breaker', 'longshot', 'raptor'];
export const SECONDARY_IDS = ['sidearm', 'fang', 'cyclone', 'ghost'];

export const MODES = {
  br: {
    id: 'br', name: 'BATTLE ROYALE', tag: 'SOLO · 50 PLAYERS', desc: 'Drop in. Loot up. Outlast them all.',
    players: 50, realBots: 17, teamSize: 1, zone: true, respawn: false, killTarget: 0,
    duration: 420, startAmmo: 1, airdrop: true, armor: 50, label: 'SURVIVE THE FIRESTORM', ranked: true
  },
  tdm: {
    id: 'tdm', name: 'CLASH SQUAD 5v5', tag: 'FIRST TO 30 KILLS', desc: 'Team deathmatch at close quarters.',
    players: 10, realBots: 9, teamSize: 5, zone: false, respawn: true, killTarget: 30,
    duration: 300, startAmmo: 2, airdrop: false, armor: 100, label: 'FIRST TEAM TO 30 KILLS', ranked: true
  },
  training: {
    id: 'training', name: 'TRAINING RANGE', tag: 'UNLIMITED AMMO', desc: 'Warm up against live targets.',
    players: 12, realBots: 9, teamSize: 1, zone: false, respawn: true, killTarget: 0,
    duration: 9999, startAmmo: 3, airdrop: false, armor: 100, label: 'WEAPONS FREE', ranked: false, infiniteAmmo: true
  }
};

export const MAPS = {
  bermuda: {
    id: 'bermuda', name: 'BERMUDA BAY', short: 'BERMUDA', region: 'TROPICAL ISLAND', size: '600 × 600 M',
    tagline: 'Sun-bleached docks, dense palms, and a military chokehold.',
    weather: 'CLEAR · 28°C', time: 'GOLDEN HOUR',
    skyTop: '#2e6fae', skyHorizon: '#a9d8e6', sunColor: '#ffe0a3', fogColor: '#a9cfdd', fogNear: 90, fogFar: 460,
    sunDir: [-0.55, 0.72, 0.42], sunIntensity: 2.3, ambient: 0.52,
    groundA: '#718f45', groundB: '#4c6d35', groundC: '#b3a16b', sand: '#cdba86',
    water: '#1e7f95', waterDeep: '#0f5368', rock: '#8b8f83', road: '#8f8d78',
    tree: 'palm', treeColor: '#4c7f3d', treeColor2: '#6a9749',
    minimap: '#4b6539', minimapWater: '#145367', minimapSand: '#ad9c71',
    pois: [
      { name: 'CLOCK TOWER', x: 0, z: -12, r: 46, type: 'town' },
      { name: 'RIVERSIDE', x: -172, z: 74, r: 38, type: 'docks' },
      { name: 'PEAK', x: 132, z: -132, r: 40, type: 'ruins' },
      { name: 'FACTORY', x: -72, z: -158, r: 42, type: 'industrial' },
      { name: 'FARM', x: 158, z: 36, r: 36, type: 'farm' },
      { name: 'SHIPYARD', x: 30, z: 190, r: 44, type: 'docks' },
      { name: 'CAPE', x: 208, z: 148, r: 34, type: 'military' },
      { name: 'OLD MILL', x: -186, z: -84, r: 32, type: 'farm' }
    ]
  },
  dune: {
    id: 'dune', name: 'DUNE CITADEL', short: 'DUNE', region: 'DESERT RUINS', size: '600 × 600 M',
    tagline: 'Buried fortresses and a refinery that never sleeps.',
    weather: 'HEAT HAZE · 41°C', time: 'MIDDAY',
    skyTop: '#3e77a8', skyHorizon: '#e8c89a', sunColor: '#fff0cc', fogColor: '#dbc9a7', fogNear: 80, fogFar: 440,
    sunDir: [0.35, 0.8, 0.3], sunIntensity: 2.6, ambient: 0.55,
    groundA: '#c6a56c', groundB: '#a8854d', groundC: '#e1c896', sand: '#d9be8b',
    water: '#297d85', waterDeep: '#155b62', rock: '#9a7c57', road: '#b19a72',
    tree: 'palm', treeColor: '#7a8a43', treeColor2: '#99a454',
    minimap: '#a98b5b', minimapWater: '#1d6169', minimapSand: '#c9ae7e',
    pois: [
      { name: 'CITADEL', x: 0, z: 0, r: 48, type: 'ruins' },
      { name: 'REFINERY', x: -142, z: -92, r: 42, type: 'industrial' },
      { name: 'OASIS', x: 144, z: 92, r: 34, type: 'oasis' },
      { name: 'DIG SITE', x: 96, z: -158, r: 36, type: 'ruins' },
      { name: 'OUTPOST', x: -166, z: 136, r: 38, type: 'military' },
      { name: 'SOLAR FARM', x: 210, z: -36, r: 34, type: 'industrial' },
      { name: 'BAZAAR', x: -46, z: 170, r: 38, type: 'town' }
    ]
  },
  frost: {
    id: 'frost', name: 'FROSTLINE', short: 'FROST', region: 'ARCTIC OUTPOST', size: '600 × 600 M',
    tagline: 'Frozen pines, whiteout ridges, and a silent radar station.',
    weather: 'SNOW · -18°C', time: 'BLUE HOUR',
    skyTop: '#456a8c', skyHorizon: '#c8d8e2', sunColor: '#dbeaff', fogColor: '#b6c8d5', fogNear: 60, fogFar: 380,
    sunDir: [-0.4, 0.62, -0.35], sunIntensity: 1.9, ambient: 0.62,
    groundA: '#cfd9de', groundB: '#aebfc8', groundC: '#e8eff2', sand: '#d8e3e8',
    water: '#2b6779', waterDeep: '#163f50', rock: '#8a959c', road: '#9baab2',
    tree: 'pine', treeColor: '#2f5a48', treeColor2: '#3d6d55',
    minimap: '#b7c8d0', minimapWater: '#275867', minimapSand: '#d7e2e7',
    pois: [
      { name: 'ICE STATION', x: 0, z: 0, r: 46, type: 'industrial' },
      { name: 'LODGE', x: -138, z: 78, r: 38, type: 'town' },
      { name: 'FROZEN LAKE', x: 96, z: 138, r: 40, type: 'lake' },
      { name: 'RADAR', x: 158, z: -86, r: 38, type: 'military' },
      { name: 'SAWMILL', x: -162, z: -128, r: 36, type: 'farm' },
      { name: 'VILLAGE', x: 72, z: -178, r: 40, type: 'town' },
      { name: 'CLIFFS', x: 214, z: 54, r: 32, type: 'ruins' }
    ]
  }
};

export const MAP_ORDER = ['bermuda', 'dune', 'frost'];

export const RARITY = {
  COMMON: '#9aa8b3', UNCOMMON: '#5fd98c', RARE: '#4fa8ff', EPIC: '#c47dff', LEGENDARY: '#ffb545'
};

export const OUTFITS = [
  { id: 'street', name: 'STREET VIPER', rarity: 'EPIC', top: '#252b33', pants: '#343c46', accent: '#ff7a1a', vest: '#14181d', pattern: 'urban' },
  { id: 'desert', name: 'SAND REAPER', rarity: 'RARE', top: '#8f7645', pants: '#6b5b3d', accent: '#d8b25c', vest: '#4a402b', pattern: 'camo' },
  { id: 'arctic', name: 'WHITEOUT', rarity: 'RARE', top: '#c9d5db', pants: '#8fa0aa', accent: '#4cc9d8', vest: '#e6eef2', pattern: 'camo' },
  { id: 'crimson', name: 'CRIMSON EDGE', rarity: 'LEGENDARY', top: '#3a1519', pants: '#21171a', accent: '#ff3b47', vest: '#1a0c0e', pattern: 'urban' },
  { id: 'jungle', name: 'JUNGLE GHOST', rarity: 'EPIC', top: '#2e4430', pants: '#3b4b2b', accent: '#8ee85b', vest: '#1c2b1f', pattern: 'camo' },
  { id: 'neon', name: 'NEON RONIN', rarity: 'LEGENDARY', top: '#141827', pants: '#1d2236', accent: '#25ddc3', vest: '#0e1220', pattern: 'tech' },
  { id: 'royal', name: 'ROYAL TACTIC', rarity: 'EPIC', top: '#2a2f58', pants: '#232747', accent: '#ffc74a', vest: '#1a1d33', pattern: 'urban' },
  { id: 'ember', name: 'EMBER PROTOCOL', rarity: 'LEGENDARY', top: '#2c231d', pants: '#201a16', accent: '#ff9d2e', vest: '#17120f', pattern: 'tech' },
  { id: 'mint', name: 'MINT STRIKE', rarity: 'UNCOMMON', top: '#3d6b62', pants: '#2f504a', accent: '#7df2d5', vest: '#284440', pattern: 'urban' }
];

export const SKINS = [
  { id: 's1', name: 'PORCELAIN', color: '#e8c3a0' },
  { id: 's2', name: 'SAND', color: '#cba07a' },
  { id: 's3', name: 'AMBER', color: '#a9764e' },
  { id: 's4', name: 'UMBER', color: '#7d5135' },
  { id: 's5', name: 'MAHOGANY', color: '#57351f' },
  { id: 's6', name: 'OBSIDIAN', color: '#38251c' }
];

export const HELMETS = [
  { id: 'none', name: 'NO HEADGEAR', rarity: 'COMMON', color: 'none' },
  { id: 'cap', name: 'FIELD CAP', rarity: 'COMMON', color: '#2c333c' },
  { id: 'tactical', name: 'TACTICAL HELM', rarity: 'RARE', color: '#313b46' },
  { id: 'bandana', name: 'RAIDER BANDANA', rarity: 'UNCOMMON', color: '#b73e35' },
  { id: 'hood', name: 'SHADOW HOOD', rarity: 'EPIC', color: '#20242c' },
  { id: 'crown', name: 'BLAZE CROWN', rarity: 'LEGENDARY', color: '#ff9d2e' }
];

export const BACKPACKS = [
  { id: 'none', name: 'LIGHT KIT', rarity: 'COMMON', color: 'none', size: 0 },
  { id: 'recon', name: 'RECON PACK', rarity: 'RARE', color: '#3a4149', size: 1 },
  { id: 'heavy', name: 'JUGGERNAUT', rarity: 'EPIC', color: '#2c3239', size: 2 },
  { id: 'flare', name: 'FLARE PACK', rarity: 'LEGENDARY', color: '#ff7a1a', size: 1 }
];

export const QUALITY = {
  low: { name: 'LOW', pixelRatio: 1, shadow: 0, shadowSize: 512, grass: 0, props: 0.55, anisotropic: 1, fov: 74, antialias: false, resolutionScale: 0.72 },
  medium: { name: 'MEDIUM', pixelRatio: 1.35, shadow: 1024, shadowSize: 1024, grass: 120, props: 0.8, anisotropic: 2, fov: 74, antialias: false, resolutionScale: 1 },
  high: { name: 'HIGH', pixelRatio: 2, shadow: 2048, shadowSize: 2048, grass: 260, props: 1, anisotropic: 4, fov: 74, antialias: true, resolutionScale: 1 }
};

export const DEFAULT_PROFILE = {
  name: 'PHANTOM',
  level: 42,
  xp: 6420,
  xpMax: 10000,
  coins: 12450,
  gems: 860,
  rank: 'HEROIC IV',
  outfit: 'street',
  skin: 's2',
  helmet: 'tactical',
  backpack: 'recon',
  primary: 'vanguard',
  secondary: 'sidearm',
  stats: { matches: 248, wins: 37, kills: 612, damage: 84220, kd: 3.42, bestKills: 14 },
  settings: {
    sens: 1.0, fov: 74, quality: 'auto', sound: true, music: false,
    aimAssist: true, showFps: false, inverted: false, autoSprint: true, resolution: 1
  },
  map: 'bermuda',
  mode: 'br'
};

export const BOT_NAMES = [
  'RIFT', 'KIRO', 'NOVA', 'VEX', 'SHADE', 'HAVOC', 'ZERO', 'BLITZ', 'RAVEN', 'ONYX',
  'CINDER', 'TALON', 'GHOST', 'MIRAGE', 'FURY', 'SABLE', 'KAI', 'DRIFT', 'ECHO', 'JINX',
  'SCOUT', 'VIPER', 'STORM', 'Nyx', 'Rogue', 'Apex', 'Havok', 'Frost', 'Wraith', 'Bolt',
  'Karma', 'Titan', 'Specter', 'Hazard', 'Lynx', 'Cobra', 'Dusk', 'Reaper', 'Zephyr', 'Bane',
  'Crux', 'Hex', 'Mako', 'Nero', 'Orion', 'Pulse', 'Quake', 'Rook', 'Saber', 'Trace'
];
