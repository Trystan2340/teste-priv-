// ============================================================================
// noise.js — Génération de bruit pseudo-aléatoire seedé
// ============================================================================
// Ce module fournit :
//   - mulberry32 : PRNG (générateur de nombres pseudo-aléatoires) simple
//   - createNoise2D : bruit pseudo-Perlin 2D pour le terrain
//   - createNoise3D : bruit pseudo-Perlin 3D pour les grottes et minerais
// Utiliser un PRNG seedé garantit que le même monde est généré à partir d'une même seed.
// ============================================================================

/**
 * PRNG Mulberry32 — rapide, bonne distribution pour usage gameplay.
 * @param {number} seed entier quelconque
 * @returns {() => number} fonction produisant un float entre 0 et 1
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bruit de type Perlin 2D cache-mémoïrisé.
 * @param {number} seed seed de génération
 */
export function createNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Mélange de Fisher-Yates
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // Vecteurs de gradient unitaires (8 directions)
  const grads = [
    [1,1],[-1,1],[1,-1],[-1,-1],
    [1,0],[-1,0],[0,1],[0,-1]
  ];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const dot2 = (g, x, y) => g[0] * x + g[1] * y;

  return function (x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[X + perm[Y]] & 7;
    const ab = perm[X + perm[Y + 1]] & 7;
    const ba = perm[X + 1 + perm[Y]] & 7;
    const bb = perm[X + 1 + perm[Y + 1]] & 7;

    const x1 = lerp(dot2(grads[aa], xf, yf),       dot2(grads[ba], xf - 1, yf),       u);
    const x2 = lerp(dot2(grads[ab], xf, yf - 1),   dot2(grads[bb], xf - 1, yf - 1),   u);
    return lerp(x1, x2, v) * 0.7071; // normaliser vers ~[-1,1]
  };
}

/**
 * Bruit 3D simple basé sur hashage — suffisant pour grottes/minerais.
 */
export function createNoise3D(seed) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const dot3 = (g, x, y, z) => g[0]*x + g[1]*y + g[2]*z;

  return function (x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const A  = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B  = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;

    const lerpN = (a, b, t) => lerp(dot3(grad3[a & 11], xf, yf, zf),
                                    dot3(grad3[b & 11], xf-1, yf-1, zf-1), t);

    const x1 = lerp(lerpN(perm[AA],   perm[BA],   u),
                    lerpN(perm[AB],   perm[BB],   u), v);
    const x2 = lerp(lerpN(perm[AA+1], perm[BA+1], u),
                    lerpN(perm[AB+1], perm[BB+1], u), v);
    return lerp(x1, x2, w);
  };
}

/**
 * Bruit fractionnaire brownien (FBM) — empile plusieurs octaves
 * pour des reliefs plus riches. Très utile pour le terrain.
 */
export function fbm2(noise2D, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 1.0;
  let freq = 1.0;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
