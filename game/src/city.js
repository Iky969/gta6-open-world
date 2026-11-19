// Procedural construction of Vesper Bay: roads, blocks, a skyline of authored
// facades, landmarks, palms, lamps and a glass pier. Geometry is merged by
// material so the whole city draws in a handful of calls.
import * as THREE from 'three';
import { CITY, PALETTE, FACADE_STYLES, BILLBOARD_WORDS, SAFEHOUSE } from './config.js';
import { randRange, randInt, pick, chance } from './rng.js';
import {
  makeAsphaltTexture, makePavementTexture, makeWaterTexture,
  makeFacadeTextures, makeBillboardTexture,
} from './textures.js';

// Combine indexed geometries that share position/normal/uv attributes.
export function mergeGeometries(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const index = g.index ? g.index.array : null;
    const count = g.index ? g.index.count : g.attributes.position.count;
    for (let k = 0; k < count; k++) idx[io++] = (index ? index[k] : k) + vo;
    vo += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function scaledBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

function flatPlane(w, h, material, x, z, y = 0.03) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const nodes = [];
  const sidewalkLoops = [];
  const neonMaterials = [];
  const first = -((CITY.grid - 1) / 2) * CITY.spacing;
  const coord = (i) => first + i * CITY.spacing;
  const half = (CITY.grid - 1) / 2;

  // --- ground, water and shore ------------------------------------------------
  const sandTex = makePavementTexture(rng);
  sandTex.repeat.set(18, 18);
  const ground = flatPlane(1500, 1500, new THREE.MeshStandardMaterial({ map: sandTex, color: 0xb9a583, roughness: 1 }), 0, 0, -0.06);
  scene.add(ground);

  const waterTex = makeWaterTexture(rng);
  waterTex.repeat.set(10, 16);
  const water = flatPlane(900, 1500, new THREE.MeshStandardMaterial({
    map: waterTex, color: 0x9fdcd6, roughness: 0.34, metalness: 0.18,
    emissive: 0x0b3f4a, emissiveIntensity: 0.3,
  }), CITY.oceanX + 450, 0, -0.02);
  scene.add(water);

  const shore = flatPlane(56, 1500, new THREE.MeshStandardMaterial({ color: 0xe4c895, roughness: 1 }), CITY.oceanX - 18, 0, -0.01);
  scene.add(shore);

  // --- road surface and markings ----------------------------------------------
  const asphalt = makeAsphaltTexture(rng);
  asphalt.repeat.set(3, 34);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0xc6ced4, roughness: 0.96 });
  const roadLength = CITY.grid * CITY.spacing + 44;
  for (let i = 0; i < CITY.grid; i++) {
    const p = coord(i);
    scene.add(flatPlane(CITY.roadWidth, roadLength, roadMat, p, 0, 0.02));
    scene.add(flatPlane(roadLength, CITY.roadWidth, roadMat, 0, p, 0.021));
  }
  const markingMat = new THREE.MeshBasicMaterial({ color: 0xf3d99c });
  const dashGeo = new THREE.BoxGeometry(0.42, 0.03, 4.6);
  const dashCount = CITY.grid * 2 * 34;
  const dashes = new THREE.InstancedMesh(dashGeo, markingMat, dashCount);
  const dummy = new THREE.Object3D();
  let di = 0;
  for (let i = 0; i < CITY.grid; i++) {
    const p = coord(i);
    for (let s = -16; s < 17; s++) {
      const d = s * 18;
      dummy.position.set(p, 0.05, d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
      dummy.position.set(d, 0.05, p); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // Crosswalk bars at every intersection: a graphic cue for scale and streets.
  const crossGeo = new THREE.BoxGeometry(1.0, 0.03, 5.2);
  const crosses = new THREE.InstancedMesh(crossGeo, new THREE.MeshBasicMaterial({ color: 0xe9e6dd }), CITY.grid * CITY.grid * 16);
  let ci = 0;
  for (let a = 0; a < CITY.grid; a++) {
    for (let b = 0; b < CITY.grid; b++) {
      const x = coord(a), z = coord(b);
      for (let k = -3; k <= 3; k++) {
        dummy.position.set(x + k * 2.2, 0.052, z + CITY.roadWidth / 2 + 3.2); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        crosses.setMatrixAt(ci++, dummy.matrix);
        dummy.position.set(x + CITY.roadWidth / 2 + 3.2, 0.052, z + k * 2.2); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
        crosses.setMatrixAt(ci++, dummy.matrix);
      }
    }
  }
  crosses.count = ci;
  scene.add(crosses);

  // --- road graph -------------------------------------------------------------
  for (let a = 0; a < CITY.grid; a++) {
    for (let b = 0; b < CITY.grid; b++) nodes.push({ x: coord(a), z: coord(b), a, b, neighbors: [] });
  }
  const nodeAt = (a, b) => (a < 0 || b < 0 || a >= CITY.grid || b >= CITY.grid) ? -1 : a * CITY.grid + b;
  for (const n of nodes) {
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = nodeAt(n.a + da, n.b + db);
      if (j >= 0) n.neighbors.push(j);
    }
  }

  // --- facades and skyline ----------------------------------------------------
  const facadeSets = FACADE_STYLES.map((s) => makeFacadeTextures(rng, parseInt(s.wall.slice(1), 16), s.style));
  const facadeMaterials = facadeSets.map((set, i) => new THREE.MeshStandardMaterial({
    map: set.map,
    emissiveMap: set.emissiveMap,
    emissive: 0xffbe73,
    emissiveIntensity: 0.85,
    roughness: 0.78,
    metalness: 0.06,
    color: i % 2 === 0 ? 0xffffff : 0xf4eee6,
  }));
  const buildingGeoms = FACADE_STYLES.map(() => []);
  const roofGeoms = [];

  function addBuilding(x, z, w, d, h, style) {
    const g = scaledBox(w, h, d, 9);
    g.translate(0, h / 2, 0);
    g.translate(x, 0, z);
    buildingGeoms[style % buildingGeoms.length].push(g);
    colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4, height: h });
    // rooftop plant: vents, tanks and a parapet
    const vent = new THREE.BoxGeometry(Math.min(6, w * .4), 1.8 + rng() * 2.2, Math.min(5, d * .35));
    vent.translate(x + randRange(rng, -w * .2, w * .2), h + 1, z + randRange(rng, -d * .2, d * .2));
    roofGeoms.push(vent);
    // Cap the top face with a plain slab: the facade texture also maps onto the
    // roof of a BoxGeometry, which makes windows appear on top of buildings.
    const cap = new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4);
    cap.translate(x, h + 0.15, z);
    roofGeoms.push(cap);
    if (h > 30 && chance(rng, 0.5)) {
      const mast = new THREE.CylinderGeometry(0.16, 0.22, 6 + rng() * 6, 6);
      mast.translate(x + randRange(rng, -w * .25, w * .25), h + 4, z + randRange(rng, -d * .25, d * .25));
      roofGeoms.push(mast);
    }
  }

  const reserved = new Set(['3,3', '1,1', '2,4', '4,2', '5,3', '0,5']);
  const lot = CITY.spacing - CITY.roadWidth - CITY.lotInset * 2;
  const blockPavement = makePavementTexture(rng);
  blockPavement.repeat.set(4, 4);
  const blockPavementMat = new THREE.MeshStandardMaterial({ map: blockPavement, color: 0xbdb098, roughness: 1 });
  for (let a = 0; a < CITY.grid - 1; a++) {
    for (let b = 0; b < CITY.grid - 1; b++) {
      const cx = coord(a) + CITY.spacing / 2;
      const cz = coord(b) + CITY.spacing / 2;
      sidewalkLoops.push([
        { x: cx - lot / 2 - 2, z: cz - lot / 2 - 2 },
        { x: cx + lot / 2 + 2, z: cz - lot / 2 - 2 },
        { x: cx + lot / 2 + 2, z: cz + lot / 2 + 2 },
        { x: cx - lot / 2 - 2, z: cz + lot / 2 + 2 },
      ]);
      if (reserved.has(`${a},${b}`)) continue;
      scene.add(flatPlane(CITY.spacing - CITY.roadWidth + 4, CITY.spacing - CITY.roadWidth + 4,
        blockPavementMat, cx, cz, 0.035));
      const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / 300);
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          if (!chance(rng, 0.93)) continue;
          const w = randRange(rng, lot * 0.34, lot * 0.45);
          const d = randRange(rng, lot * 0.34, lot * 0.45);
          const h = randRange(rng, 9, 20) + centrality * randRange(rng, 6, 40) + (chance(rng, 0.08) ? 22 : 0);
          addBuilding(cx + sx * lot * 0.24, cz + sz * lot * 0.24, w, d, h, randInt(rng, 0, FACADE_STYLES.length - 1));
        }
      }
    }
  }
  for (let s = 0; s < buildingGeoms.length; s++) {
    if (!buildingGeoms[s].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(buildingGeoms[s]), facadeMaterials[s]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `facade_${s}`;
    scene.add(mesh);
  }
  if (roofGeoms.length) {
    const roofs = new THREE.Mesh(mergeGeometries(roofGeoms), new THREE.MeshStandardMaterial({ color: 0x6d7478, roughness: .9 }));
    roofs.castShadow = true;
    scene.add(roofs);
  }

  // --- shared materials for landmarks and props -------------------------------
  const glass = new THREE.MeshStandardMaterial({ color: 0x24566a, roughness: .18, metalness: .55, emissive: 0x0d2b38, emissiveIntensity: .5 });
  const goldMetal = new THREE.MeshStandardMaterial({ color: 0xe9b45c, roughness: .32, metalness: .75, emissive: 0x6b3b0d, emissiveIntensity: .35 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x38464e, roughness: .55, metalness: .4 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd9cbb2, roughness: 1 });
  const neon = (color) => {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    neonMaterials.push(m);
    return m;
  };

  function box(w, h, d, x, y, z, mat, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  function neonSign(title, subtitle, x, y, z, width, color, facing = 0) {
    const [word, tag] = BILLBOARD_WORDS.find((w) => w[0] === title) || [title, subtitle];
    const tex = makeBillboardTexture(word, tag, 0x132432, color);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.5),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(x, y, z);
    sign.rotation.y = facing;
    scene.add(sign);
    box(width + 1.2, width * 0.5 + 1.2, 0.5, x, y, z - Math.cos(facing) * 0.4, darkMetal, false).rotation.y = facing;
    return sign;
  }

  // SOLAR SPIRE — the central landmark tower.
  const tower = new THREE.Group();
  tower.position.set(44, 0, 44);
  scene.add(tower);
  const base = new THREE.Mesh(new THREE.BoxGeometry(42, 22, 42), concrete);
  base.position.y = 11; base.castShadow = true; base.receiveShadow = true; tower.add(base);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(26, 52, 26), glass);
  shaft.position.y = 48; shaft.castShadow = true; tower.add(shaft);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 18), glass);
  crown.position.y = 81; crown.castShadow = true; tower.add(crown);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.8, 8, 40), goldMetal);
  ring.rotation.x = Math.PI / 2; ring.position.y = 76; tower.add(ring);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 22, 8), goldMetal);
  spire.position.y = 99; tower.add(spire);
  for (let k = 0; k < 12; k++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 46, 0.4), neon(k % 2 ? 0x5ce0d0 : 0xf7c873));
    const ang = k * Math.PI / 6;
    strip.position.set(Math.sin(ang) * 13.2, 48, Math.cos(ang) * 13.2);
    strip.rotation.y = ang;
    tower.add(strip);
  }
  colliders.push({ x: 44, z: 44, hw: 22, hd: 22, height: 110 });
  neonSign('SOLAR SPIRE', 'VESPER BAY', 44, 63, 57.5, 22, 0xf7c873, 0);

  // VESPER ARENA — a ring stadium in the west.
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 15, 28), concrete);
  arena.position.set(-220, 7.5, -132);
  arena.castShadow = true; arena.receiveShadow = true;
  scene.add(arena);
  const arenaRing = new THREE.Mesh(new THREE.TorusGeometry(35, 1.1, 8, 36), neon(0x5ce0d0));
  arenaRing.rotation.x = Math.PI / 2; arenaRing.position.set(-220, 15.4, -132);
  scene.add(arenaRing);
  colliders.push({ x: -220, z: -132, hw: 36, hd: 36, height: 16 });
  neonSign('VOLT', 'CITY POWER CO.', -220, 22, -96, 20, 0x5ce0d0, 0);

  // ORO PLAZA — park, fountain and palms.
  const plaza = flatPlane(70, 70, new THREE.MeshStandardMaterial({ color: 0x8fb79b, roughness: 1 }), -44, 132, 0.05);
  scene.add(plaza);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.6, 24), concrete);
  fountain.position.set(-44, 0.9, 132); fountain.receiveShadow = true; scene.add(fountain);
  const fountainWater = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 0.2, 24), neon(0x63cfd2));
  fountainWater.position.set(-44, 1.8, 132); scene.add(fountainWater);
  colliders.push({ x: -44, z: 132, hw: 10, hd: 10, height: 2 });
  neonSign('CASTA', 'GOLDEN HOUR GOODS', -44, 24, 96, 18, 0xffb46b, 0);

  // ORO'S SAFEHOUSE — a small teal beacon where the player can save.
  const safeBase = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, .5, 24), concrete);
  safeBase.position.set(SAFEHOUSE.x, .25, SAFEHOUSE.z); safeBase.receiveShadow = true; scene.add(safeBase);
  const safeRing = new THREE.Mesh(new THREE.TorusGeometry(4.4, .28, 8, 32), neon(0x5ce0d0));
  safeRing.rotation.x = Math.PI / 2; safeRing.position.set(SAFEHOUSE.x, .6, SAFEHOUSE.z); scene.add(safeRing);
  neonSign('CASTA', 'SAFEHOUSE · SAVE HERE', SAFEHOUSE.x, 12, SAFEHOUSE.z + 6, 15, 0x5ce0d0, 0);

  // THE LANTERN ROOM and the harbor chop shop — job destinations.
  box(38, 34, 34, -220, 17, 220, glass);
  colliders.push({ x: -220, z: 220, hw: 19, hd: 17, height: 34 });
  neonSign('MIRADOR', 'SEE THE BAY', -220, 27, 237.5, 26, 0xff7f9e, 0);
  box(44, 16, 36, 132, 8, -220, darkMetal);
  colliders.push({ x: 132, z: -220, hw: 22, hd: 18, height: 16 });
  neonSign('ORO & SONS', 'FINE IMPORTS', 132, 13, -201.5, 26, 0xf7c873, 0);

  // GLASS PIER — a causeway, arcade deck and crates over the water.
  const causeway = flatPlane(92, 17, roadMat, 306, CITY.pierZ, 0.03);
  scene.add(causeway);
  const deck = box(74, 1.4, 30, 344, 0.7, CITY.pierZ, concrete);
  deck.receiveShadow = true;
  for (let k = 0; k < 9; k++) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 10, 8), darkMetal);
    pile.position.set(312 + k * 8, -4, CITY.pierZ + (k % 2 ? 12 : -12));
    scene.add(pile);
  }
  box(26, 13, 18, 354, 7.5, CITY.pierZ, glass);
  colliders.push({ x: 354, z: CITY.pierZ, hw: 13, hd: 9, height: 14 });
  neonSign('SOL-ADE', 'TASTE THE HEAT', 354, 15.5, CITY.pierZ + 9.2, 24, 0x5ce0d0, 0);
  for (let k = 0; k < 8; k++) {
    box(2.4, 2.4, 2.4, 320 + (k % 4) * 7, 1.9, CITY.pierZ - 9 + Math.floor(k / 4) * 5, randRange(rng, 0, 1) > .5 ? darkMetal : goldMetal);
  }

  // --- palms, lamps and small street furniture (merged) -----------------------
  const trunkGeoms = [], frondGeoms = [], poleGeoms = [], bulbGeoms = [];
  function addPalm(x, z, scale = 1) {
    const h = randRange(rng, 6, 9) * scale;
    const trunk = new THREE.CylinderGeometry(0.28, 0.42, h, 6);
    trunk.translate(x, h / 2, z);
    trunkGeoms.push(trunk);
    for (let f = 0; f < 7; f++) {
      const ang = f * Math.PI * 2 / 7 + rng() * .3;
      const frond = new THREE.BoxGeometry(0.9 * scale, 0.16 * scale, 5.2 * scale);
      frond.rotateX(-0.28 - rng() * 0.25);
      frond.rotateY(ang);
      frond.translate(x + Math.sin(ang) * 2.1, h + 0.4 + rng() * .4, z + Math.cos(ang) * 2.1);
      frondGeoms.push(frond);
    }
  }
  // Palms belong on the sidewalk corners of each block: clear of the driving
  // lanes (roadWidth/2) and clear of the building footprints (the central lot
  // strip). The old placement let `along` land inside a road, which put trees
  // in the middle of the street.
  for (let i = 0; i < 78; i++) {
    const a = randInt(rng, 0, CITY.grid - 2);
    const b = randInt(rng, 0, CITY.grid - 2);
    const cx = coord(a) + CITY.spacing / 2;
    const cz = coord(b) + CITY.spacing / 2;
    const inset = CITY.roadWidth / 2 + randRange(rng, 3, 6);
    const strip = CITY.spacing / 2 - inset;
    addPalm(cx + (chance(rng, .5) ? -strip : strip),
            cz + (chance(rng, .5) ? -strip : strip));
  }
  for (let k = 0; k < 16; k++) addPalm(-44 + randRange(rng, -30, 30), 132 + randRange(rng, -30, 30), .8);

  for (const n of nodes) {
    for (const sx of [-1, 1]) {
      const x = n.x + sx * (CITY.roadWidth / 2 + 2.4);
      const z = n.z + (CITY.roadWidth / 2 + 2.4);
      const pole = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
      pole.translate(x, 3.5, z); poleGeoms.push(pole);
      const arm = new THREE.BoxGeometry(2.4, 0.14, 0.14);
      arm.translate(x - sx * 1.1, 6.9, z); poleGeoms.push(arm);
      const bulb = new THREE.BoxGeometry(1.1, 0.22, 0.5);
      bulb.translate(x - sx * 2.1, 6.75, z); bulbGeoms.push(bulb);
    }
  }
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunkGeoms), new THREE.MeshStandardMaterial({ color: 0x8a6a4b, roughness: 1 }));
  const frondMesh = new THREE.Mesh(mergeGeometries(frondGeoms), new THREE.MeshStandardMaterial({ color: 0x3f7d55, roughness: .9, side: THREE.DoubleSide }));
  const poleMesh = new THREE.Mesh(mergeGeometries(poleGeoms), darkMetal);
  const bulbMesh = new THREE.Mesh(mergeGeometries(bulbGeoms), new THREE.MeshBasicMaterial({ color: 0xffe1a2, toneMapped: false }));
  for (const m of [trunkMesh, frondMesh, poleMesh, bulbMesh]) { m.castShadow = false; scene.add(m); }

  return {
    colliders, nodes, sidewalkLoops, neonMaterials,
    pier: { x: 330, z: CITY.pierZ },
    water,
    update(dt) {
      waterTex.offset.x += dt * 0.006;
      waterTex.offset.y += dt * 0.002;
      const pulse = 0.86 + Math.sin(performance.now() * 0.002) * 0.06;
      fountainWater.material.color.setHex(pulse > .85 ? 0x63cfd2 : 0x4fbfc6);
      ring.rotation.z += dt * 0.12;
    },
  };
}
