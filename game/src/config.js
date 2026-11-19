// Shared tuning constants, palette, vehicle catalogue and story data for Vesper Bay.

export const CITY = {
  grid: 7,             // intersections per axis
  spacing: 88,         // metres between intersections
  roadWidth: 18,
  lotInset: 11,        // pavement edge inside each block
  limit: 300,          // drivable world radius
  oceanX: 318,
  pierZ: -88,
};

export const CAMERA = {
  footDistance: 7.6,
  carDistance: 12.5,
  footHeight: 2.2,
  carHeight: 4.4,
  fov: 62,
};

export const PALETTE = {
  gold: 0xf7c873,
  teal: 0x5ce0d0,
  red: 0xff6b57,
  asphalt: 0x2b3540,
  pavement: 0xcbb79a,
  sand: 0xe7c79a,
  ocean: 0x2e9aa6,
  fog: 0xe9ab7e,
};

// Original, invented vehicles. Handling values feed the arcade drive model.
export const VEHICLE_TYPES = [
  { name: 'CIVIC SUN',   speed: 25, accel: 13, grip: 4.2, mass: 1.0, body: 0.30 },
  { name: 'CASA 4',      speed: 27, accel: 12, grip: 4.0, mass: 1.1, body: 0.34 },
  { name: 'PICKUP ROCA', speed: 26, accel: 11, grip: 3.5, mass: 1.4, body: 0.42 },
  { name: 'NOVA COUPE',  speed: 33, accel: 17, grip: 5.0, mass: 0.9, body: 0.22 },
  { name: 'VULCAN GT',   speed: 42, accel: 21, grip: 5.6, mass: 0.85, body: 0.18 },
  { name: 'SOL VAN',     speed: 23, accel: 10, grip: 3.6, mass: 1.5, body: 0.46 },
  { name: 'CRUISER',     speed: 31, accel: 15, grip: 4.8, mass: 1.2, body: 0.30 },
];

export const CAR_COLORS = [
  0xd7523f, 0xe8b23c, 0x2d8f88, 0xe9e2d0, 0x34536e, 0x8e4d7a,
  0x5d9a55, 0xb6bcc3, 0xcf6d32, 0x39404b, 0x7fb8c9, 0xa7383c,
];

export const PED_COLORS = [
  0xe9c46a, 0x4ecdc4, 0xf4a261, 0xe76f51, 0x8ecae6, 0xb5659d,
  0x95d5b2, 0xf2e8d5, 0x5c6b8a, 0xd45050, 0x76b7ad, 0xe3a6b6,
];

export const FACADE_STYLES = [
  { wall: '#d9a07a', trim: '#f2cda8', style: 0 },
  { wall: '#c9d7cf', trim: '#eef4e8', style: 1 },
  { wall: '#d6c39c', trim: '#f5e4bb', style: 2 },
  { wall: '#a8b5bd', trim: '#d9e3e7', style: 3 },
  { wall: '#c78f7d', trim: '#f0c3ab', style: 4 },
  { wall: '#8fa9a6', trim: '#cfe2dd', style: 5 },
];

export const BILLBOARD_WORDS = [
  ['SOL-ADE', 'TASTE THE HEAT'],
  ['NOVA 9', 'DRIVE THE LIGHT'],
  ['CASTA', 'GOLDEN HOUR GOODS'],
  ['VOLT', 'CITY POWER CO.'],
  ['MIRADOR', 'SEE THE BAY'],
  ['ORO & SONS', 'FINE IMPORTS'],
];

export const STORY = {
  hero: "Mara 'Vex' Solis",
  fixer: "Oro",
  gang: 'The Chrome Kings',
  city: 'VESPER BAY',
};

// Data-driven jobs. Each step is checked by MissionSystem; reaching the last
// step pays the reward and records the completion in localStorage.
export const MISSIONS = [
  {
    id: 'cold-delivery',
    name: 'COLD DELIVERY',
    brief: 'Oro wants a case pulled off the Glass Pier before the Chrome Kings get it.',
    steps: [
      { type: 'goto', point: [330, -88], radius: 13, text: 'Reach the Glass Pier docks' },
      { type: 'pickup', text: 'Collect the sunstone case' },
      { type: 'goto', point: [-176, 176], radius: 13, text: 'Deliver the case to The Lantern Room' },
      { type: 'complete', reward: 2500, text: 'Hand the case to Oro' },
    ],
    ambushAtStep: 1,
  },
  {
    id: 'hot-wheels',
    name: 'HOT WHEELS',
    brief: 'A Vulcan GT is the only way out of town. Steal one and park it in the harbor chop shop.',
    steps: [
      { type: 'stealVehicle', vehicle: 'VULCAN GT', text: 'Steal a VULCAN GT' },
      { type: 'goto', point: [176, -176], radius: 13, requiresVehicle: 'VULCAN GT', text: 'Drive it to the harbor chop shop' },
      { type: 'complete', reward: 1800, text: 'Park it. Walk away.' },
    ],
    ambushAtStep: 1,
  },
];

// Repeatable side-job catalogue. Each has a distinct step type so the jobs play
// differently: chase, escort, timed delivery and a straight shootout.
export const JOBS = [
  {
    id: 'shadow-run',
    name: 'SHADOW RUN',
    brief: 'A Chrome Kings courier is fleeing across the bay. Run him off the road.',
    steps: [
      { type: 'goto', point: [176, 176], radius: 14, text: 'Reach the east overpass' },
      { type: 'chase', vehicle: 'NOVA COUPE', x: 176, z: 88, heading: Math.PI / 2, text: 'Wreck the courier’s car' },
      { type: 'complete', reward: 3200, text: 'Collect the bounty' },
    ],
  },
  {
    id: 'convoy',
    name: 'CONVOY',
    brief: 'Escort an Oro & Sons van to the harbor without losing it.',
    steps: [
      { type: 'escortPickup', point: [-176, 8], radius: 12, text: 'Meet the convoy van' },
      { type: 'escort', point: [176, -176], radius: 16, text: 'Lead the van to the harbor' },
      { type: 'complete', reward: 3600, text: 'Park the van. Job done.' },
    ],
  },
  {
    id: 'last-call',
    name: 'LAST CALL',
    brief: 'A hot package has to reach the Lantern Room before the clock dies.',
    steps: [
      { type: 'timedGoto', point: [-176, 176], radius: 13, time: 52, text: 'Beat the clock to The Lantern Room' },
      { type: 'complete', reward: 2800, text: 'Hand over the package' },
    ],
  },
  {
    id: 'crossfire',
    name: 'CROSSFIRE',
    brief: 'The Chrome Kings hold Oro Plaza. Clear it out.',
    steps: [
      { type: 'shootout', point: [-44, 132], count: 5, text: 'Clear Oro Plaza of hostiles' },
      { type: 'complete', reward: 4200, text: 'The plaza is ours' },
    ],
  },
];

// Two original sidearms. Switching with the weapon key changes damage, fire
// rate and magazine size, and the HUD follows along.
export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', damage: 34, ammo: 12, cooldown: .16, color: 0xffe09a, range: 78 },
  { id: 'smg', name: 'BURST SMG', damage: 19, ammo: 40, cooldown: .085, color: 0xffd27a, range: 62 },
];

export const PICKUPS = [
  { type: 'health', x: -88, z: 0, amount: 35 },
  { type: 'armor', x: 88, z: 0, amount: 40 },
  { type: 'ammo', x: 176, z: 176, amount: 24 },
  { type: 'health', x: 0, z: -176, amount: 35 },
];

export const SAFEHOUSE = { x: -176, z: 0, name: 'ORO’S SAFEHOUSE' };

export const POLICE_CONFIG = {
  roadblockStars: 3,   // cruisers park across the road ahead at 3+ stars
  heliStars: 4,        // a search helicopter joins at 4-5 stars
  maxUnits: 12,
};

export const WEATHER = {
  cycleSeconds: 210,   // one dawn-to-dawn day
  goldenHour: 0.26,    // phase the opening story is art-directed around
};

export const START_POSITION = { x: -88, z: 88 };
