// ============================================================================
// blockTextures.js — Atlas de textures pixel art procédurales
// ============================================================================
// Chaque tuile fait 64x64 px. L'atlas est 4x4 (16 tuiles max), donc 256x256.
// Les pixel-arts sont dessinés sur un canvas puis utilisés comme THREE.CanvasTexture
// avec un filtre nearest (look pixelisé).
// IMPORTANT : aucune texture copiée de Minecraft — tout est dessiné de zéro.
// ============================================================================

import * as THREE from 'three';

export const TILE = 64;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

// Petite RNG pour bruit contrôlé par hash (purement déterministe, sans dépendance)
function hashRand(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 5381) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
}

const palette = {
  grassTop:    '#5fa84a',
  grassDirtL1: '#6a4a2e',
  grassDirtL2: '#8a6a40',
  grassLine:   '#3c7a2f',
  dirtL:       '#7a5536',
  dirtD:       '#4d3a24',
  stoneL:      '#a8a8a8',
  stoneD:      '#6f6f6f',
  sandL:       '#f0d994',
  sandD:       '#d6b76d',
  woodTopL:    '#c79863',
  woodTopD:    '#8a6035',
  barkL:       '#7b5a36',
  barkD:       '#4c3520',
  leavesL:     '#5cb84a',
  leavesD:     '#386c2c',
  water1:      '#3a78c8',
  water2:      '#2c5e9c',
  coal:        '#2a2a2a',
  coalOreL:    '#3a3a3a',
  iron:        '#d8c69b',
  ironOre:     '#a08455',
  diamond:     '#9ee9f3',
  planksL:     '#c09869',
  planksD:     '#8a6c45',
};

/** Remplit une tuile avec un motif damier-irrégulier. */
function noiseFill(ctx, base, dark, salt, count = 28) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hashRand(i, 0, salt) * TILE);
    const y = Math.floor(hashRand(0, i, salt + 1) * TILE);
    const r = 2 + Math.floor(hashRand(i, i, salt + 2) * 3);
    ctx.fillStyle = hashRand(i, 99, salt + 3) > 0.45 ? dark : base;
    ctx.fillRect(x, y, r, r);
  }
  // Quelques pixels clairs pour texture
  for (let i = 0; i < count * 0.5; i++) {
    const x = Math.floor(hashRand(i * 2, 1, salt + 5) * TILE);
    const y = Math.floor(hashRand(1, i * 2, salt + 6) * TILE);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Dessine la tuile demandée dans le tileRect du context fourni. */
function drawTile(ctx, idx) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TILE, TILE); // fond par défaut

  switch (idx) {
    case 0: // grass top
      ctx.fillStyle = palette.grassTop;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, '#67b955', palette.grassLine, 100, 18);
      break;
    case 1: // grass-side (bande verte + terre)
      ctx.fillStyle = palette.dirtL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.dirtL, palette.dirtD, 101);
      // Bande herbe supérieure
      ctx.fillStyle = palette.grassTop;
      ctx.fillRect(0, 0, TILE, 12);
      ctx.fillStyle = palette.grassLine;
      for (let x = 0; x < TILE; x += 4) ctx.fillRect(x, 8 + (x%8===0?2:0), 2, 4);
      ctx.fillStyle = palette.dirtL;
      for (let x = 0; x < TILE; x += 6) ctx.fillRect(x, 12, 2, 2);
      break;
    case 2: // dirt
      ctx.fillStyle = palette.dirtL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.dirtL, palette.dirtD, 102);
      break;
    case 3: // stone
      ctx.fillStyle = palette.stoneL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.stoneL, palette.stoneD, 103, 36);
      // Craquelures
      ctx.fillStyle = palette.stoneD;
      for (let i = 0; i < 6; i++) {
        const x = hashRand(i, 1, 200)*TILE | 0;
        const y = hashRand(1, i, 201)*TILE | 0;
        ctx.fillRect(x, y, 6, 1);
      }
      break;
    case 4: // sand
      ctx.fillStyle = palette.sandL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.sandL, palette.sandD, 104);
      break;
    case 5: // wood top (anneaux)
      ctx.fillStyle = palette.woodTopD;
      ctx.fillRect(0,0,TILE,TILE);
      ctx.fillStyle = palette.woodTopL;
      ctx.fillRect(8, 8, TILE-16, TILE-16);
      ctx.fillStyle = palette.woodTopD;
      ctx.fillRect(16, 16, TILE-32, TILE-32);
      ctx.fillStyle = palette.woodTopL;
      ctx.fillRect(24, 24, TILE-48, TILE-48);
      break;
    case 6: // wood bark (côtés)
      ctx.fillStyle = palette.barkD;
      ctx.fillRect(0,0,TILE,TILE);
      // stries verticales
      for (let x = 0; x < TILE; x += 6) {
        ctx.fillStyle = x % 12 === 0 ? palette.barkL : palette.barkD;
        ctx.fillRect(x, 0, 3, TILE);
      }
      noiseFill(ctx, palette.barkL, palette.barkD, 105, 14);
      break;
    case 7: // leaves
      ctx.fillStyle = palette.leavesD;
      ctx.fillRect(0,0,TILE,TILE);
      for (let i = 0; i < 28; i++) {
        const x = hashRand(i,4,300)*TILE | 0;
        const y = hashRand(4,i,301)*TILE | 0;
        const r = 4 + (hashRand(i,i,302)*4 | 0);
        ctx.fillStyle = hashRand(i,99,303) > 0.5 ? palette.leavesL : palette.leavesD;
        ctx.fillRect(x, y, r, r);
      }
      break;
    case 8: // water
      ctx.fillStyle = palette.water2;
      ctx.fillRect(0,0,TILE,TILE);
      for (let y = 0; y < TILE; y += 4) {
        ctx.fillStyle = y % 8 === 0 ? palette.water1 : palette.water2;
        ctx.fillRect((y*3) % TILE, y, TILE, 2);
      }
      break;
    case 9: // coal ore
      ctx.fillStyle = palette.stoneL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.stoneL, palette.stoneD, 106, 24);
      // Veines de charbon
      for (let i = 0; i < 8; i++) {
        const x = hashRand(i,0,400)*TILE | 0;
        const y = hashRand(0,i,401)*TILE | 0;
        ctx.fillStyle = palette.coal;
        ctx.fillRect(x, y, 5, 4);
        ctx.fillStyle = palette.coalOreL;
        ctx.fillRect(x+1, y+1, 1, 1);
      }
      break;
    case 10: // iron ore
      ctx.fillStyle = palette.stoneL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.stoneL, palette.stoneD, 107, 24);
      for (let i = 0; i < 6; i++) {
        const x = hashRand(i,0,500)*TILE | 0;
        const y = hashRand(0,i,501)*TILE | 0;
        ctx.fillStyle = palette.ironOre;
        ctx.fillRect(x, y, 6, 5);
        ctx.fillStyle = palette.iron;
        ctx.fillRect(x+1, y, 2, 1);
      }
      break;
    case 11: // diamond ore
      ctx.fillStyle = palette.stoneL;
      ctx.fillRect(0,0,TILE,TILE);
      noiseFill(ctx, palette.stoneL, palette.stoneD, 108, 24);
      for (let i = 0; i < 4; i++) {
        const x = hashRand(i,0,600)*TILE | 0;
        const y = hashRand(0,i,601)*TILE | 0;
        ctx.fillStyle = palette.diamond;
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x+1, y+1, 1, 1);
      }
      break;
    case 12: // planks
      ctx.fillStyle = palette.planksD;
      ctx.fillRect(0,0,TILE,TILE);
      // Lignes de planches horizontales
      const rows = 4;
      const rh = TILE / rows;
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = r % 2 === 0 ? palette.planksL : palette.planksD;
        ctx.fillRect(0, r*rh, TILE, rh-1);
      }
      // Nervures verticales décalées
      for (let r = 0; r < rows; r++) {
        const off = r % 2 === 0 ? 0 : TILE/2;
        ctx.fillStyle = palette.planksD;
        ctx.fillRect(off + 8, r*rh, 1, rh-1);
        ctx.fillRect(off + 20, r*rh, 1, rh-1);
        ctx.fillRect(off + 36, r*rh, 1, rh-1);
        ctx.fillRect(off + 52, r*rh, 1, rh-1);
      }
      break;
    case 13: // glass
      ctx.fillStyle = '#a8d8ec';
      ctx.fillRect(0,0,TILE,TILE);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(2,2,TILE-4,TILE-4);
      // Reflets
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 8, 8, 2);
      ctx.fillRect(20, 8, 4, 2);
      ctx.fillRect(8, 18, 4, 2);
      break;
    default:
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(0,0,TILE,TILE);
  }
}

/** Crée l'atlas complet et retourne THREE.CanvasTexture + helper UV. */
export function createBlockAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * ATLAS_COLS;
  canvas.height = TILE * ATLAS_ROWS;
  const ctx = canvas.getContext('2d');

  for (let idx = 0; idx < ATLAS_ROWS * ATLAS_COLS; idx++) {
    const cx = (idx % ATLAS_COLS) * TILE;
    const cy = Math.floor(idx / ATLAS_COLS) * TILE;
    ctx.save();
    ctx.translate(cx, cy);
    drawTile(ctx, idx);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  tex.needsUpdate = true;

  /**
   * Convertit un index de tuile en offset UV (coin supérieur-gauche et taille).
   * Appelé pour générer les UVs d'un quad du mesh d'un chunk.
   */
  function uvForTile(idx) {
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    const u0 = col / ATLAS_COLS;
    const v0 = 1 - (row + 1) / ATLAS_ROWS; // Three.js UV : v augmente vers le haut
    const u1 = (col + 1) / ATLAS_COLS;
    const v1 = 1 - row / ATLAS_ROWS;
    return { u0, v0, u1, v1 };
  }

  return { texture: tex, canvas, uvForTile };
}
