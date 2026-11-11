import * as THREE from 'three';
import { transformGeom, boxGeom, cylGeom } from './utils.js';
import { RARITY, AMMO_TYPES } from './config.js';

/* ---------------- shared materials ---------------- */
const MAT = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.42, metalness: 0.78 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.6, metalness: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x7c8894, roughness: 0.32, metalness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5d4128, roughness: 0.8, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b3444, roughness: 0.1, metalness: 0.4, emissive: 0x173040, emissiveIntensity: 0.5 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, metalness: 0.3, emissive: 0xff5a00, emissiveIntensity: 0.3 }),
  lens: new THREE.MeshStandardMaterial({ color: 0xff5b2a, roughness: 0.2, emissive: 0xff3d00, emissiveIntensity: 1.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x8b98a4, roughness: 0.35, metalness: 0.9 }),
  skinMats: {},
  clothMats: {}
};
function cloth(color, emission = 0) {
  const key = color + ':' + emission;
  if (!MAT.clothMats[key]) MAT.clothMats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.82, metalness: 0.04, emissive: emission ? new THREE.Color(color) : 0x000000, emissiveIntensity: emission });
  return MAT.clothMats[key];
}
function skinMat(color) {
  if (!MAT.skinMats[color]) MAT.skinMats[color] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, metalness: 0.02 });
  return MAT.skinMats[color];
}

/* ---------------- weapons ---------------- */
function addBox(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m); return m;
}
function addCyl(parent, mat, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m); return m;
}

export function createWeaponModel(id, accentColor = null) {
  const g = new THREE.Group();
  const accent = accentColor ? cloth(accentColor, 0.2) : MAT.accent;
  const a = (w, h, d, x, y, z, rx, ry, rz) => addBox(g, MAT.gunmetal, w, h, d, x, y, z, rx, ry, rz);
  const dk = (w, h, d, x, y, z, rx, ry, rz) => addBox(g, MAT.dark, w, h, d, x, y, z, rx, ry, rz);
  const st = (w, h, d, x, y, z, rx, ry, rz) => addBox(g, MAT.steel, w, h, d, x, y, z, rx, ry, rz);
  const ac = (w, h, d, x, y, z) => addBox(g, accent, w, h, d, x, y, z);
  let muzzle = new THREE.Vector3(0, 0.01, -0.9);
  switch (id) {
    case 'viper':
    case 'ghost': {
      a(0.09, 0.12, 0.36, 0, 0, 0);
      dk(0.075, 0.075, 0.22, 0, 0.02, -0.26);
      addCyl(g, MAT.steel, 0.018, 0.018, 0.2, 0, 0.02, -0.42, Math.PI / 2);
      dk(0.055, 0.22, 0.09, 0, -0.15, -0.06, 0.12);
      dk(0.06, 0.15, 0.08, 0, -0.12, 0.11, -0.18);
      st(0.04, 0.04, 0.22, 0, 0.02, 0.24);
      ac(0.095, 0.025, 0.16, 0, 0.055, -0.04);
      addBox(g, MAT.dark, 0.06, 0.06, 0.12, 0, 0.085, -0.02);
      muzzle.set(0, 0.02, -0.54);
      break;
    }
    case 'breaker':
    case 'cyclone': {
      a(0.095, 0.13, 0.45, 0, 0, 0);
      addCyl(g, MAT.steel, 0.026, 0.026, 0.55, 0, 0.02, -0.48, Math.PI / 2, 0, 0, 8);
      addCyl(g, MAT.dark, 0.03, 0.03, 0.2, 0, 0.01, -0.33, Math.PI / 2, 0, 0, 8);
      addBox(g, MAT.dark, 0.07, 0.09, 0.2, 0, -0.005, -0.32);
      dk(0.06, 0.22, 0.1, 0, -0.15, 0.02, 0.14);
      addBox(g, MAT.wood, 0.07, 0.12, 0.3, 0, -0.03, 0.32);
      ac(0.1, 0.02, 0.2, 0, 0.06, -0.06);
      muzzle.set(0, 0.02, -0.78);
      break;
    }
    case 'longshot': {
      a(0.085, 0.12, 0.52, 0, 0, 0);
      addCyl(g, MAT.steel, 0.017, 0.017, 0.9, 0, 0.03, -0.72, Math.PI / 2, 0, 0, 8);
      addCyl(g, MAT.dark, 0.03, 0.03, 0.12, 0, 0.03, -1.18, Math.PI / 2, 0, 0, 8);
      dk(0.06, 0.24, 0.1, 0, -0.17, 0.04, 0.12);
      addBox(g, MAT.dark, 0.075, 0.13, 0.34, 0, -0.03, 0.4);
      addBox(g, MAT.dark, 0.06, 0.11, 0.2, 0, -0.02, 0.58);
      // scope
      addCyl(g, MAT.dark, 0.055, 0.055, 0.28, 0, 0.14, -0.12, Math.PI / 2, 0, 0, 12);
      addCyl(g, MAT.glass, 0.045, 0.045, 0.02, 0, 0.14, -0.27, Math.PI / 2, 0, 0, 12);
      addBox(g, MAT.dark, 0.03, 0.08, 0.04, 0, 0.08, -0.18);
      addBox(g, MAT.dark, 0.03, 0.08, 0.04, 0, 0.08, -0.05);
      ac(0.09, 0.025, 0.3, 0, 0.0, 0.08);
      // bipod
      addBox(g, MAT.dark, 0.015, 0.2, 0.015, -0.05, -0.13, -0.55, 0, 0, 0.3);
      addBox(g, MAT.dark, 0.015, 0.2, 0.015, 0.05, -0.13, -0.55, 0, 0, -0.3);
      muzzle.set(0, 0.03, -1.25);
      break;
    }
    case 'raptor': {
      a(0.11, 0.15, 0.54, 0, 0, 0);
      addCyl(g, MAT.steel, 0.022, 0.022, 0.6, 0, 0.03, -0.58, Math.PI / 2, 0, 0, 8);
      addCyl(g, MAT.dark, 0.04, 0.04, 0.24, 0, 0.03, -0.36, Math.PI / 2, 0, 0, 8);
      addCyl(g, MAT.dark, 0.14, 0.14, 0.12, 0, -0.12, -0.02, Math.PI / 2, 0, 0, 14);
      dk(0.07, 0.2, 0.1, 0, -0.14, 0.2, -0.14);
      addBox(g, MAT.dark, 0.075, 0.12, 0.34, 0, -0.01, 0.38);
      addBox(g, MAT.dark, 0.03, 0.2, 0.03, -0.08, -0.14, -0.55, 0, 0, 0.28);
      addBox(g, MAT.dark, 0.03, 0.2, 0.03, 0.08, -0.14, -0.55, 0, 0, -0.28);
      ac(0.115, 0.03, 0.32, 0, 0.06, -0.02);
      muzzle.set(0, 0.03, -0.88);
      break;
    }
    case 'sidearm':
    case 'fang': {
      a(0.075, 0.1, 0.3, 0, 0.02, 0);
      addCyl(g, MAT.steel, 0.019, 0.019, 0.12, 0, 0.02, -0.2, Math.PI / 2, 0, 0, 8);
      const grip = addBox(g, MAT.dark, 0.06, 0.2, 0.09, 0, -0.11, 0.07, 0.22);
      ac(0.08, 0.018, 0.1, 0, 0.07, 0);
      addBox(g, MAT.dark, 0.03, 0.03, 0.03, 0, 0.08, -0.22);
      muzzle.set(0, 0.02, -0.28);
      break;
    }
    default: { // vanguard
      a(0.09, 0.13, 0.48, 0, 0, 0);
      addBox(g, MAT.dark, 0.075, 0.09, 0.34, 0, 0.01, -0.4);
      addCyl(g, MAT.steel, 0.019, 0.019, 0.36, 0, 0.02, -0.68, Math.PI / 2, 0, 0, 8);
      addCyl(g, MAT.dark, 0.035, 0.035, 0.1, 0, 0.02, -0.88, Math.PI / 2, 0, 0, 8);
      dk(0.06, 0.24, 0.11, 0, -0.16, -0.03, 0.16);
      addBox(g, MAT.dark, 0.06, 0.16, 0.09, 0, -0.13, 0.14, -0.18);
      addBox(g, MAT.dark, 0.075, 0.11, 0.3, 0, -0.01, 0.36);
      addBox(g, MAT.dark, 0.06, 0.16, 0.07, 0, -0.13, 0.42, 0.1);
      addBox(g, MAT.dark, 0.04, 0.05, 0.12, 0, 0.09, 0.02);
      ac(0.095, 0.025, 0.26, 0, 0.062, -0.05);
      st(0.025, 0.03, 0.08, 0.045, 0.07, 0.02);
      muzzle.set(0, 0.02, -0.95);
      break;
    }
  }
  g.userData.muzzle = muzzle;
  g.userData.weaponId = id;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.weapon = id; } });
  return g;
}

/* ---------------- humanoid ---------------- */
const GEO = {
  torso: new THREE.BoxGeometry(0.46, 0.56, 0.26),
  vest: new THREE.BoxGeometry(0.5, 0.38, 0.3),
  hips: new THREE.BoxGeometry(0.42, 0.16, 0.24),
  upperLeg: new THREE.BoxGeometry(0.16, 0.46, 0.18),
  lowerLeg: new THREE.BoxGeometry(0.14, 0.42, 0.16),
  boot: new THREE.BoxGeometry(0.17, 0.13, 0.28),
  upperArm: new THREE.BoxGeometry(0.13, 0.36, 0.15),
  lowerArm: new THREE.BoxGeometry(0.11, 0.34, 0.12),
  hand: new THREE.BoxGeometry(0.1, 0.12, 0.12),
  head: new THREE.BoxGeometry(0.24, 0.27, 0.25),
  neck: new THREE.BoxGeometry(0.11, 0.09, 0.11),
  backpack: new THREE.BoxGeometry(0.34, 0.42, 0.18),
  strap: new THREE.BoxGeometry(0.05, 0.4, 0.02)
};

export function createHumanoid(opt = {}) {
  const outfit = opt.outfit || { top: '#252b33', pants: '#343c46', accent: '#ff7a1a', vest: '#14181d' };
  const skin = opt.skin || '#cba07a';
  const helmet = opt.helmet || 'none';
  const backpack = opt.backpack || 'none';
  const accentColor = opt.accent || outfit.accent;
  const topM = cloth(outfit.top);
  const pantsM = cloth(outfit.pants);
  const vestM = cloth(outfit.vest);
  const accentM = cloth(accentColor, 0.12);
  const faceM = skinMat(skin);
  const g = new THREE.Group();

  // hips & torso
  const torso = new THREE.Mesh(GEO.torso, topM); torso.position.y = 1.2; g.add(torso);
  const vest = new THREE.Mesh(GEO.vest, vestM); vest.position.set(0, 1.19, 0.005); g.add(vest);
  const hips = new THREE.Mesh(GEO.hips, pantsM); hips.position.y = 0.92; g.add(hips);
  addBox(g, accentM, 0.06, 0.5, 0.02, -0.13, 1.2, -0.135);
  addBox(g, accentM, 0.06, 0.5, 0.02, 0.13, 1.2, -0.135);
  addBox(g, accentM, 0.4, 0.045, 0.03, 0, 1.02, -0.15);
  // pouches
  addBox(g, cloth('#161a1f'), 0.13, 0.1, 0.06, -0.13, 1.02, -0.19);
  addBox(g, cloth('#161a1f'), 0.13, 0.1, 0.06, 0.08, 1.02, -0.19);

  // head
  const headGroup = new THREE.Group(); headGroup.position.y = 1.62; g.add(headGroup);
  const head = new THREE.Mesh(GEO.head, faceM); headGroup.add(head);
  const neck = new THREE.Mesh(GEO.neck, faceM); neck.position.y = -0.17; headGroup.add(neck);
  // face detail: visor strip / eye band
  addBox(headGroup, cloth('#151a20'), 0.2, 0.05, 0.02, 0, 0.04, -0.132);
  addBox(headGroup, accentM, 0.05, 0.018, 0.012, -0.055, 0.04, -0.145);
  addBox(headGroup, accentM, 0.05, 0.018, 0.012, 0.055, 0.04, -0.145);
  // helmet
  buildHelmet(headGroup, helmet, accentColor);

  // arms (pivot at shoulders)
  const leftArm = new THREE.Group(); leftArm.position.set(-0.29, 1.4, 0); g.add(leftArm);
  const laUpper = new THREE.Mesh(GEO.upperArm, topM); laUpper.position.y = -0.17; leftArm.add(laUpper);
  const laLower = new THREE.Mesh(GEO.lowerArm, topM); laLower.position.y = -0.5; leftArm.add(laLower);
  const laHand = new THREE.Mesh(GEO.hand, cloth('#1a1e23')); laHand.position.y = -0.7; leftArm.add(laHand);
  addBox(leftArm, accentM, 0.14, 0.05, 0.16, 0, -0.33, 0);

  const rightArm = new THREE.Group(); rightArm.position.set(0.29, 1.4, 0); g.add(rightArm);
  const raUpper = new THREE.Mesh(GEO.upperArm, topM); raUpper.position.y = -0.17; rightArm.add(raUpper);
  const raLower = new THREE.Mesh(GEO.lowerArm, topM); raLower.position.y = -0.5; rightArm.add(raLower);
  const raHand = new THREE.Mesh(GEO.hand, cloth('#1a1e23')); raHand.position.y = -0.7; rightArm.add(raHand);
  addBox(rightArm, accentM, 0.14, 0.05, 0.16, 0, -0.33, 0);

  // legs (pivot at hips)
  const leftLeg = new THREE.Group(); leftLeg.position.set(-0.13, 0.92, 0); g.add(leftLeg);
  const llU = new THREE.Mesh(GEO.upperLeg, pantsM); llU.position.y = -0.23; leftLeg.add(llU);
  const llL = new THREE.Mesh(GEO.lowerLeg, pantsM); llL.position.y = -0.65; leftLeg.add(llL);
  const llB = new THREE.Mesh(GEO.boot, cloth('#121518')); llB.position.set(0, -0.88, -0.04); leftLeg.add(llB);

  const rightLeg = new THREE.Group(); rightLeg.position.set(0.13, 0.92, 0); g.add(rightLeg);
  const rlU = new THREE.Mesh(GEO.upperLeg, pantsM); rlU.position.y = -0.23; rightLeg.add(rlU);
  const rlL = new THREE.Mesh(GEO.lowerLeg, pantsM); rlL.position.y = -0.65; rightLeg.add(rlL);
  const rlB = new THREE.Mesh(GEO.boot, cloth('#121518')); rlB.position.set(0, -0.88, -0.04); rightLeg.add(rlB);

  // knee pads
  addBox(leftLeg, vestM, 0.15, 0.12, 0.05, 0, -0.5, -0.1);
  addBox(rightLeg, vestM, 0.15, 0.12, 0.05, 0, -0.5, -0.1);

  // backpack
  if (backpack !== 'none') {
    const sizes = { recon: [1, 1], heavy: [1.25, 1.25], flare: [1, 1] };
    const [sx, sy] = sizes[backpack] || [1, 1];
    const pack = new THREE.Mesh(GEO.backpack, cloth(opt.backpackColor || outfit.vest));
    pack.position.set(0, 1.2, 0.21); pack.scale.set(sx, sy, 1); g.add(pack);
    addBox(g, accentM, 0.2, 0.05, 0.04, 0, 1.35, 0.3);
    addBox(g, cloth('#111518'), 0.05, 0.36, 0.03, -0.14, 1.2, 0.11);
    addBox(g, cloth('#111518'), 0.05, 0.36, 0.03, 0.14, 1.2, 0.11);
  }

  // gun
  let gun = null;
  if (opt.weapon) {
    gun = createWeaponModel(opt.weapon, accentColor);
    gun.position.set(0.18, 1.16, -0.3);
    gun.rotation.x = -0.06;
    g.add(gun);
    // pose arms holding the weapon
    rightArm.rotation.set(-1.18, 0.1, 0.12);
    leftArm.rotation.set(-1.32, -0.32, -0.28);
  } else {
    rightArm.rotation.set(-0.12, 0, 0.06);
    leftArm.rotation.set(-0.12, 0, -0.06);
  }

  // team marker
  if (opt.teamColor) {
    const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(opt.teamColor), emissive: new THREE.Color(opt.teamColor), emissiveIntensity: 1.3, roughness: 0.4 });
    addBox(g, sm, 0.09, 0.03, 0.02, -0.1, 1.42, -0.15);
    addBox(g, sm, 0.09, 0.03, 0.02, 0.1, 1.42, -0.15);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = {
    ...g.userData,
    parts: { leftArm, rightArm, leftLeg, rightLeg, head: headGroup, torso, vest, gun },
    outfit, weapon: opt.weapon || null,
    baseGunY: 1.16
  };
  return g;
}

function buildHelmet(headGroup, type, accent) {
  if (!type || type === 'none') return;
  const accentM = cloth(accent, 0.15);
  if (type === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.08, 12), cloth('#2c333c'));
    cap.position.y = 0.14; headGroup.add(cap);
    addBox(headGroup, cloth('#2c333c'), 0.2, 0.02, 0.13, 0, 0.115, -0.14);
    addBox(headGroup, accentM, 0.04, 0.02, 0.1, 0.04, 0.12, -0.14);
  } else if (type === 'tactical') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), cloth('#313b46'));
    dome.position.y = 0.11; headGroup.add(dome);
    addBox(headGroup, cloth('#313b46'), 0.34, 0.06, 0.3, 0, 0.09, 0.01);
    addBox(headGroup, MAT.lens, 0.2, 0.035, 0.02, 0, 0.055, -0.142);
    addBox(headGroup, accentM, 0.05, 0.09, 0.06, -0.17, 0.06, -0.02);
    addBox(headGroup, accentM, 0.05, 0.09, 0.06, 0.17, 0.06, -0.02);
    addBox(headGroup, cloth('#1b2128'), 0.02, 0.04, 0.05, 0.1, 0.17, -0.08);
  } else if (type === 'bandana') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.138, 0.1, 12), cloth('#b73e35'));
    band.position.y = 0.1; headGroup.add(band);
    addBox(headGroup, cloth('#b73e35'), 0.09, 0.2, 0.03, 0.1, 0.02, 0.14);
    addBox(headGroup, cloth('#74251f'), 0.22, 0.04, 0.02, 0, 0.04, -0.135);
  } else if (type === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.68), cloth('#20242c'));
    hood.position.y = 0.08; headGroup.add(hood);
    addBox(headGroup, cloth('#20242c'), 0.3, 0.1, 0.3, 0, -0.01, 0.03);
    addBox(headGroup, cloth('#0e1116'), 0.19, 0.12, 0.03, 0, 0.02, -0.135);
    addBox(headGroup, accentM, 0.02, 0.1, 0.02, -0.12, 0.08, -0.1);
  } else if (type === 'crown') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.07, 12), MAT.accent);
    band.position.y = 0.12; headGroup.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), MAT.accent);
      spike.position.set(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12); headGroup.add(spike);
    }
    const visor = addBox(headGroup, MAT.lens, 0.2, 0.03, 0.02, 0, 0.04, -0.14);
  }
}

/* ---------------- parachute ---------------- */
export function createParachute(color = '#ff7a1a') {
  const g = new THREE.Group();
  const canopyMat = cloth(color, 0.05);
  const whiteMat = cloth('#e8eef2');
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), canopyMat);
  canopy.scale.set(2.5, 1.15, 1.9); canopy.position.y = 3.6;
  canopy.material.side = THREE.DoubleSide;
  g.add(canopy);
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 3, 20, Math.PI * 0.42), whiteMat);
    stripe.rotation.x = Math.PI / 2; stripe.rotation.z = i * 0.8;
    stripe.scale.set(2.5, 1.9, 1); stripe.position.y = 3.6; g.add(stripe);
  }
  const lineMat = new THREE.LineBasicMaterial({ color: 0xd6dee4, transparent: true, opacity: 0.6 });
  const points = [];
  const anchors = [[-2.2, 3.7, 0], [2.2, 3.7, 0], [0, 3.7, -1.6], [0, 3.7, 1.6]];
  for (const a of anchors) {
    points.push(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(0, 1.4, 0));
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMat);
  g.add(lines);
  g.visible = false;
  return g;
}

/* ---------------- vehicles ---------------- */
export function createVehicle(type = 'buggy', color = '#c8652a') {
  const g = new THREE.Group();
  const bodyM = cloth(color, 0.02);
  const darkM = cloth('#1b2025');
  const seats = cloth('#2a2f35');
  const accentM = MAT.accent;
  const isTruck = type === 'truck';
  const L = isTruck ? 4.6 : 3.5, W = isTruck ? 2.1 : 1.9;
  // chassis
  addBox(g, darkM, W, 0.24, L, 0, 0.58, 0);
  addBox(g, bodyM, W * 0.94, 0.5, L * 0.66, 0, 0.84, 0.15);
  addBox(g, bodyM, W * 0.86, 0.26, L * 0.43, 0, 1.12, -0.45, -0.06);
  // hood / nose
  addBox(g, bodyM, W * 0.86, 0.34, L * 0.24, 0, 0.82, -L * 0.34 + 0.1, 0.04);
  // cabin
  addBox(g, darkM, W * 0.82, 0.75, L * 0.3, 0, 1.38, 0.12);
  addBox(g, bodyM, W * 0.88, 0.12, L * 0.32, 0, 1.79, 0.12);
  // windshield
  addBox(g, MAT.glass, W * 0.76, 0.5, 0.04, 0, 1.48, -0.32, -0.32);
  addBox(g, MAT.glass, W * 0.78, 0.4, 0.04, 0, 1.45, 0.62, 0.22);
  // roll cage
  const cage = [[-W / 2 + 0.12, 1.55, 0.02], [W / 2 - 0.12, 1.55, 0.02], [-W / 2 + 0.12, 1.55, 0.7], [W / 2 - 0.12, 1.55, 0.7]];
  addBox(g, darkM, 0.07, 0.85, 0.07, cage[0][0], 1.75, cage[0][2], 0, 0, 0.06);
  addBox(g, darkM, 0.07, 0.85, 0.07, cage[1][0], 1.75, cage[1][2], 0, 0, -0.06);
  addCyl(g, darkM, 0.035, 0.035, W * 0.78, 0, 2.15, 0.02, 0, 0, Math.PI / 2, 6);
  addCyl(g, darkM, 0.035, 0.035, W * 0.78, 0, 2.15, 0.72, 0, 0, Math.PI / 2, 6);
  addCyl(g, darkM, 0.035, 0.035, 0.72, -W / 2 + 0.12, 2.15, 0.37, Math.PI / 2, 0, 0, 6);
  addCyl(g, darkM, 0.035, 0.035, 0.72, W / 2 - 0.12, 2.15, 0.37, Math.PI / 2, 0, 0, 6);
  // seats
  addBox(g, seats, 0.42, 0.5, 0.12, -0.35, 1.34, 0.32, 0.12);
  addBox(g, seats, 0.42, 0.5, 0.12, 0.35, 1.34, 0.32, 0.12);
  // lights
  addBox(g, MAT.lens, 0.18, 0.12, 0.04, -W * 0.28, 0.9, -L / 2 + 0.02);
  addBox(g, MAT.lens, 0.18, 0.12, 0.04, W * 0.28, 0.9, -L / 2 + 0.02);
  // wheels
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14);
  for (const [x, z] of [[-W / 2 - 0.04, -L * 0.3], [W / 2 + 0.04, -L * 0.3], [-W / 2 - 0.04, L * 0.3], [W / 2 + 0.04, L * 0.3]]) {
    const wheel = new THREE.Mesh(wheelGeo, MAT.tyre);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.42, z);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), MAT.rim);
    rim.rotation.z = Math.PI / 2; wheel.add(rim);
    g.add(wheel); wheels.push(wheel);
  }
  // rear cargo / spare
  if (isTruck) {
    addBox(g, bodyM, W * 0.9, 0.85, L * 0.34, 0, 1.2, L * 0.42);
  } else {
    addCyl(g, darkM, 0.32, 0.32, 0.18, 0, 1.0, L * 0.4, 0, 0, Math.PI / 2, 10);
  }
  addBox(g, accentM, 0.08, 0.06, L * 0.55, -W / 2 + 0.03, 0.95, 0.1);
  addBox(g, accentM, 0.08, 0.06, L * 0.55, W / 2 - 0.03, 0.95, 0.1);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { wheels, type };
  return g;
}

/* ---------------- pickups ---------------- */
export function createPickupModel(kind, weaponId = 'vanguard', rarity = 'COMMON', ammoType = null) {
  const g = new THREE.Group();
  const medColor = kind === 'trauma' ? '#ffd166' : kind === 'bandage' ? '#9de6b7' : kind === 'med' || kind === 'medkit' ? '#52e6a0' : null;
  const color = kind === 'shield' ? '#4fd8ff'
    : medColor ? medColor
      : kind === 'ammo' ? (AMMO_TYPES[ammoType]?.color || '#ffc74a')
        : kind === 'airdrop' ? '#ff7a1a'
          : (RARITY[rarity] || '#ff9d2e');
  const mat = new THREE.MeshStandardMaterial({ color: kind === 'bandage' ? 0xe8f4ef : kind === 'ammo' ? 0x33352f : 0x3a3f45, roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.9, roughness: 0.4 });
  if (kind === 'weapon' || kind === 'airdrop') {
    const s = kind === 'airdrop' ? 1.4 : 1;
    addBox(g, mat, 0.72 * s, 0.32 * s, 0.42 * s, 0, 0.22 * s, 0);
    addBox(g, accent, 0.76 * s, 0.05 * s, 0.44 * s, 0, 0.36 * s, 0);
    addBox(g, accent, 0.06 * s, 0.34 * s, 0.44 * s, 0, 0.22 * s, 0);
    if (kind === 'weapon') {
      const w = createWeaponModel(weaponId);
      w.scale.setScalar(0.65 * s); w.position.y = 0.62 * s; w.rotation.x = 0.15;
      g.add(w);
      // rarity gem floats above the crate so loot reads at a glance
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * s, 0), accent);
      gem.position.y = 1.02 * s; gem.rotation.z = 0.4; g.add(gem);
      g.userData.gem = gem;
    }
  } else if (kind === 'med' || kind === 'medkit') {
    addBox(g, mat, 0.46, 0.3, 0.34, 0, 0.2, 0);
    addBox(g, accent, 0.26, 0.07, 0.35, 0, 0.2, 0);
    addBox(g, accent, 0.07, 0.26, 0.35, 0, 0.2, 0);
  } else if (kind === 'bandage') {
    addBox(g, mat, 0.38, 0.18, 0.26, 0, 0.18, 0);
    addBox(g, accent, 0.4, 0.06, 0.28, 0, 0.24, 0);
    addBox(g, accent, 0.2, 0.04, 0.28, 0, 0.18, 0);
  } else if (kind === 'trauma') {
    addBox(g, mat, 0.5, 0.32, 0.38, 0, 0.22, 0);
    addBox(g, accent, 0.55, 0.06, 0.4, 0, 0.4, 0);
    addBox(g, accent, 0.08, 0.24, 0.4, 0, 0.22, 0);
    addBox(g, accent, 0.24, 0.08, 0.4, 0, 0.22, 0);
  } else if (kind === 'shield') {
    addCyl(g, mat, 0.14, 0.14, 0.36, 0, 0.22, 0, 0, 0, 0, 10);
    addCyl(g, accent, 0.145, 0.145, 0.06, 0, 0.31, 0, 0, 0, 0, 10);
    addCyl(g, accent, 0.1, 0.1, 0.05, 0, 0.42, 0, 0, 0, 0, 8);
  } else {
    addBox(g, mat, 0.44, 0.28, 0.3, 0, 0.18, 0);
    addBox(g, accent, 0.46, 0.05, 0.32, 0, 0.28, 0);
    for (let i = 0; i < 3; i++) addCyl(g, accent, 0.028, 0.028, 0.24, -0.12 + i * 0.12, 0.34, 0, 0, 0, Math.PI / 2, 6);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.52, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 1.2; g.add(beam);
  g.userData.ring = ring; g.userData.beam = beam;
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

/* ---------------- crate / barrel props (for world) ---------------- */
export function createCrate(size = 1) {
  const g = new THREE.Group();
  addBox(g, MAT.wood, size, size * 0.8, size, 0, size * 0.4, 0);
  return g;
}

/* ---------------- name tag sprite ---------------- */
export function createNameTag(name, color = '#e8eef3') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '600 26px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 12, 256, 40);
  ctx.fillStyle = color; ctx.fillText(name.toUpperCase(), 128, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.9, 0.48, 1);
  sprite.position.y = 2.2;
  sprite.renderOrder = 5;
  return sprite;
}
