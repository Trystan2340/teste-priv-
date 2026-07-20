// ============================================================================
// terrainGenerator.js — Génération procédurale du terrain
// ============================================================================
// Pour un chunk (cx, cz) données, calcule la valeur (x,y,z) → id de bloc.
// Combine plusieurs couches de bruit pour le relief, génère grottes
// (bruit 3D), arbres (poisson + bruit) et minerais (poisson + bruit).
// ============================================================================

import { BLOCK } from './blockData.js';
import { createNoise2D, createNoise3D, fbm2, mulberry32 } from '../utils/noise.js';

export const CHUNK_W = 16;    // largeur X d'un chunk (blocs)
export const CHUNK_D = 16;    // profondeur Z d'un chunk (blocs)
export const WORLD_H = 48;    // hauteur max (du sol au ciel)
export const SEA_LEVEL = 14;

const oreStones = [
  // [blockId, tailleMin, tailleMax, minesAltitudeMax, fréquence]
  [BLOCK.COAL,    4, 10, 32, 22],
  [BLOCK.IRON,    3, 7,  24, 14],
  [BLOCK.DIAMOND, 2, 5,  10, 6],
];

/**
 * Crée un générateur de terrain deterministic à partir d'une seed.
 */
export function createTerrainGenerator(seed) {
  const n2Height   = createNoise2D(seed);
  const n2Biome    = createNoise2D(seed ^ 0x1234);
  const n2Tree     = createNoise2D(seed ^ 0x7890);
  const n3Caves    = createNoise3D(seed ^ 0x55aa);
  const n3Ore      = createNoise3D(seed ^ 0xdead);
  const oreRand    = mulberry32(seed ^ 0xc0de);

  // Pré-calcul des graines pour les minerais
  const oreSeeds = oreStones.map(() => ({ seed: Math.floor(oreRand() * 1e9) }));

  /**
   * Calcule la hauteur du sol (en blocs) en (worldX, worldZ).
   */
  function getHeight(worldX, worldZ) {
    const base = 18;
    const amp  = 14;
    const f = fbm2(n2Height, worldX * 0.012, worldZ * 0.012, 4, 2.0, 0.5);
    return Math.floor(base + f * amp);
  }

  /**
   * Renvoie le bloc à (worldX, worldY, worldZ) DANS CE CHUNK, après
   * application des grottes et minerais.
   * Retourne aussi un flag isTreeBase pour incrémenter la construction d'arbres.
   */
  function getBlock(worldX, worldY, worldZ) {
    if (worldY < 0) return BLOCK.BEDROCK;
    if (worldY >= WORLD_H) return BLOCK.AIR; // ciel

    const h = getHeight(worldX, worldZ);

    // Couche bedrock au fond
    if (worldY === 0) return BLOCK.BEDROCK;

    // Eau → bloc solide jusqu'au sol, surface eau au-dessus
    // (Le bloc EAU est purement cosmétique — on simule une inondation plus bas)
    const height = worldY;

    // --- Carving des grottes (uniquement dans la pierre) ---
    let caveFactor = 0;
    if (height < h - 1 && height > 1 && height < 28) {
      const c = n3Caves(worldX * 0.08, height * 0.12, worldZ * 0.08);
      caveFactor = c;
    }

    if (height > h) {
      // Au-dessus du sol
      if (height <= SEA_LEVEL) {
        // Vérifier si l'eau est gelée (en utilisant un bruit basé sur la position)
        const freezeNoise = n2Biome(worldX * 0.05, worldZ * 0.05);
        if (freezeNoise > 0.5) {
          return BLOCK.ICE;
        }
        return BLOCK.WATER; // eau
      }
      return BLOCK.AIR;
    }

    // Sous le niveau du sol
    if (caveFactor > 0.55) return BLOCK.AIR;

    // Couche herbe/dirt/sand avec neige sur les hautes montagnes
    if (height === h) {
      // Surface : neige sur les hautes montagnes, sable près de l'eau, herbe ailleurs
      if (h > 30) {
        return BLOCK.SNOW; // neige en altitude
      }
      if (h <= SEA_LEVEL + 1) return BLOCK.SAND;
      return BLOCK.GRASS;
    }
    if (height >= h - 3 && h > SEA_LEVEL + 1) {
      return BLOCK.DIRT;
    }
    if (height >= h - 1) {
      // Sous le sable → sable continuation
      if (h <= SEA_LEVEL + 1) return BLOCK.SAND;
      return BLOCK.DIRT;
    }
    return BLOCK.STONE;
  }

  /**
   * Décide si on doit placer un arbre à (worldX, worldZ) (uniquement en surface herbe).
   * Utilise un bruit pour des emplacements épars et un PRNG par coordonnée pour la hauteur.
   */
  function shouldPlaceTree(worldX, worldZ) {
    const h = getHeight(worldX, worldZ);
    if (h <= SEA_LEVEL + 1) return false;
    const f = n2Tree(worldX * 0.18, worldZ * 0.18);
    const fx = (Math.floor(worldX) * 73856093) ^ (Math.floor(worldZ) * 19349663);
    const cellRand = ((fx ^ (fx >>> 13)) * 0x5bd1e995) >>> 0;
    const r = (cellRand & 0xff) / 255;
    return r > 0.92 && f > -0.05 && f < 0.5;
  }

  /** Hauteur d'un arbre en (worldX, worldZ). Aléatoire entre 4 et 6. */
  function getTreeHeight(worldX, worldZ) {
    const fx = (Math.floor(worldX) * 1140671485) ^ (Math.floor(worldZ) * 12289);
    const r = ((fx ^ (fx >>> 5)) & 0xff) / 255;
    return 4 + Math.floor(r * 3);
  }

  /** Renvoie le bloc placé par un arbre, en coordonnées locales du chunk. */
  function getTreeBlockAt(worldX, worldY, worldZ) {
    const h = getHeight(worldX, worldZ);
    if (shouldPlaceTree(worldX, worldZ)) {
      const th = getTreeHeight(worldX, worldZ);
      // Tronc vertical
      if (worldY >= h + 1 && worldY <= h + th) {
        // un peu de décalage pour faire un tronc naturel (1 bloc de large)
        const lx = worldX - Math.floor(worldX);
        const lz = worldZ - Math.floor(worldZ);
        // Le tronc est exactement à (x,z) entiers ; on le pose pour les 4 cellules où
        // (wx,wz) tombent autour d'un coin. On le limite à une cellule cible.
        const corner = pickCornerTreeBase(worldX, worldZ);
        if (corner.x === Math.floor(worldX) && corner.z === Math.floor(worldZ)) {
          return BLOCK.WOOD;
        }
      }
      // Couronne de feuilles : cube 5x4x5 autour du sommet
      if (worldY >= h + th - 1 && worldY <= h + th + 2) {
        const top = h + th + 1;
        const radius = (worldY === top + 2) ? 1 : 2;
        const corner = pickCornerTreeBase(worldX, worldZ);
        const cx = corner.x, cz = corner.z;
        if (worldX >= cx - radius && worldX <= cx + radius
         && worldZ >= cz - radius && worldZ <= cz + radius) {
          if (worldX === cx + radius && worldZ === cx // dummy
           || true) {
            return BLOCK.LEAVES;
          }
        }
      }
    }
    return null;
  }

  /**
   *_coordonnée entière (x,z) où est planté le tronc central de l'arbre
   * pour la cellule contenant (worldX, worldZ).
   * Renvoie un coin parmi les 4 (cellule du coin haut-gauche) pour diversité.
   */
  function pickCornerTreeBase(worldX, worldZ) {
    const fx = (Math.floor(worldX) * 73856093) ^ (Math.floor(worldZ) * 19349663);
    const cellRand = ((fx ^ (fx >>> 7)) & 0xff);
    const cx = Math.floor(worldX);
    const cz = Math.floor(worldZ);
    const offX = (cellRand & 1) ? 0 : 1;
    const offZ = (cellRand & 2) ? 0 : 1;
    return { x: cx - (offX ? 1 : 0), z: cz - (offZ ? 1 : 0) };
  }

  /**
   * Pose les minerais dans la pierre. Renvoie le bloc s'il s'agit d'un minerai,
   * sinon null.
   */
  function getOreAt(worldX, worldY, worldZ) {
    if (worldY < 1 || worldY > 32) return null;
    // Vérifier qu'on est bien dans la pierre (les couches plus haut n'ont pas de minerai)
    const h = getHeight(worldX, worldZ);
    if (worldY >= h - 3) return null;
    for (let i = 0; i < oreStones.length; i++) {
      const [id, min, max, maxY, freq] = oreStones[i];
      if (worldY > maxY) continue;
      const noise = n3Ore(worldX * 0.4 + oreSeeds[i].seed, worldY * 0.4, worldZ * 0.4 + oreSeeds[i].seed);
      if (noise > 0.7 - freq * 0.005) {
        return id;
      }
    }
    return null;
  }

  /**
   * Remplit le tableau `blocks` du chunk (taille CHUNK_W * CHUNK_D * WORLD_H).
   * Renvoie { treePositions: [{x,z}], surfaces: [{x,y,z,kind}] }
   */
  function generateChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_W * WORLD_H * CHUNK_D);
    const indexAt = (lx, ly, lz) => ly * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx;
    const surfaceCells = []; // positions de surface (pour spawn d'animaux)

    for (let lz = 0; lz < CHUNK_D; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = cx * CHUNK_W + lx;
        const wz = cz * CHUNK_D + lz;
        const h = getHeight(wx, wz);

        for (let ly = 0; ly < WORLD_H; ly++) {
          let b = getBlock(wx, ly, wz);
          // Override minerai uniquement si on est dans la pierre
          if (b === BLOCK.STONE) {
            const ore = getOreAt(wx, ly, wz);
            if (ore !== null) b = ore;
          }
          blocks[indexAt(lx, ly, lz)] = b;
        }

        // Sauve la position surface pour spawn d'animaux
        surfaceCells.push({ x: wx, y: h + 1, z: wz, kind: h > SEA_LEVEL + 1 ? 'grass' : 'sand' });
      }
    }

    // Placer les arbres PAR-DESSUS la couche normale
    const treePositions = [];
    for (let lz = 0; lz < CHUNK_D; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const wx = cx * CHUNK_W + lx;
        const wz = cz * CHUNK_D + lz;
        if (!shouldPlaceTree(wx, wz)) continue;
        const h = getHeight(wx, wz);
        const th = getTreeHeight(wx, wz);
        const corner = pickCornerTreeBase(wx, wz);
        const tx = corner.x, tz = corner.z;

        // Tronc
        for (let y = h + 1; y <= h + th; y++) {
          const lxx = tx - cx * CHUNK_W;
          const lzz = tz - cz * CHUNK_D;
          if (lxx < 0 || lxx >= CHUNK_W || lzz < 0 || lzz >= CHUNK_D || y >= WORLD_H) continue;
          blocks[indexAt(lxx, y, lzz)] = BLOCK.WOOD;
        }

        // Feuilles : couronne sphérique/ronde
        const topY = h + th + 1;
        // Croix en haut
        for (let dy = -2; dy <= 3; dy++) {
          const y = topY + dy - 1;
          if (y < 0 || y >= WORLD_H) continue;
          const r = (dy === 3) ? 0 : (Math.abs(dy) <= 1 ? 2 : 1);
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) + Math.abs(dz) > r * 1.5) continue;
              if (Math.random() < 0.18 && (dy !== 2 || (dx !== 0 && dz !== 0))) continue;
              const lxx = tx + dx - cx * CHUNK_W;
              const lzz = tz + dz - cz * CHUNK_D;
              if (lxx < 0 || lxx >= CHUNK_W || lzz < 0 || lzz >= CHUNK_D) continue;
              // Ne pas écraser le tronc
              if (dx === 0 && dz === 0 && y <= topY) continue;
              const existing = blocks[indexAt(lxx, y, lzz)];
              if (existing === BLOCK.AIR) {
                blocks[indexAt(lxx, y, lzz)] = BLOCK.LEAVES;
              }
            }
          }
        }

        treePositions.push({ x: tx, y: h + 1, z: tz });
      }
    }

    return { blocks, surfaceCells, treePositions };
  }

  return {
    getHeight,
    shouldPlaceTree,
    getTreeHeight,
    pickCornerTreeBase,
    getBlock,
    getOreAt,
    generateChunk,
    CHUNK_W, CHUNK_D, WORLD_H, SEA_LEVEL,
  };
}
