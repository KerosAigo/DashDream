function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = THREE.MathUtils.lerp;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- État global ----------
let world = 'out';       // 'out' (prairie) | 'back' (backrooms)

// ---------- La porte ----------
const CELL = 4.5;                           // taille d'une cellule des backrooms (BK.S)
const WALL_T = 0.2;
const WALL_Z = 0;
const DOOR_CX = CELL / 2;
const DOOR_CZ = WALL_Z;
const OPEN_X1 = DOOR_CX - 0.75, OPEN_X2 = DOOR_CX + 0.75, OPEN_H = 2.7;
const JAMB = 0.05;
const CASING_W = 0.09, CASING_T = 0.025;
const FOV = 90;

// ---------- Prairie ----------
const P = 120;                       // l'extérieur est un tore de côté P
const FOG_COLOR = 0xbfdcf5;
const BK_FOG = 0xcdbd74;             // brouillard des backrooms
const SPAWN = { x: DOOR_CX, z: WALL_Z - 12 };