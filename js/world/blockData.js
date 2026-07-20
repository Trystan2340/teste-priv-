// ============================================================================
// blockData.js — Définitions des types de blocs
// ============================================================================
// Chaque bloc est identifié par un entier (blockId). Ses propriétés définissent
// s'il est solide, transparent, sa dureté, ses drops et son index de texture
// pour chaque face (5 = haut, 4 = bas, 0..3 = N/S/E/W).
// ============================================================================

export const BLOCK = Object.freeze({
  AIR:      0,
  GRASS:    1,
  DIRT:     2,
  STONE:    3,
  SAND:     4,
  WOOD:     5,
  LEAVES:   6,
  WATER:    7,
  COAL:     8,
  IRON:     9,
  DIAMOND:  10,
  BEDROCK:  11,
  PLANKS:   12,
  GLASS:    13,
  SNOW:     24,
  ICE:      25,
  GRAVEL:   26,
});

// Catalogue complet des blocs : {nom, transparent, solide, dureté, drop,
// textureAtlas[index des 6 faces : +x, -x, +y, -y, +z, -z] }
// Les index correspondent aux tuiles de l'atlas généré par blockTextures.js
// (référez-vous à la fonction createBlockAtlas ci-dessous).
export const BLOCKS = {
  [BLOCK.AIR]: {
    name: 'air', transparent: true, solid: false, hardness: 0, drop: null,
  },
  [BLOCK.GRASS]: {
    name: 'grass', transparent: false, solid: true, hardness: 0.6, drop: BLOCK.DIRT,
    // top = grass, sides = dirt_top, bottom = dirt
    textures: [1, 1, 0, 2, 1, 1], // +x -x +y -y +z -z
  },
  [BLOCK.DIRT]: {
    name: 'dirt', transparent: false, solid: true, hardness: 0.5, drop: BLOCK.DIRT,
    textures: [2, 2, 2, 2, 2, 2],
  },
  [BLOCK.STONE]: {
    name: 'stone', transparent: false, solid: true, hardness: 1.5, drop: BLOCK.STONE,
    textures: [3, 3, 3, 3, 3, 3],
  },
  [BLOCK.SAND]: {
    name: 'sand', transparent: false, solid: true, hardness: 0.5, drop: BLOCK.SAND,
    textures: [4, 4, 4, 4, 4, 4],
  },
  [BLOCK.WOOD]: {
    name: 'wood', transparent: false, solid: true, hardness: 2.0, drop: BLOCK.WOOD,
    // top/bottom = wood_ring, sides = bark
    textures: [6, 6, 5, 5, 6, 6],
  },
  [BLOCK.LEAVES]: {
    name: 'leaves', transparent: true, solid: true, hardness: 0.2, drop: BLOCK.LEAVES,
    textures: [7, 7, 7, 7, 7, 7],
  },
  [BLOCK.WATER]: {
    name: 'water', transparent: true, solid: false, hardness: 0, drop: null,
    textures: [8, 8, 8, 8, 8, 8],
  },
  [BLOCK.COAL]: {
    name: 'coal', transparent: false, solid: true, hardness: 2.0, drop: BLOCK.COAL,
    textures: [9, 9, 9, 9, 9, 9],
  },
  [BLOCK.IRON]: {
    name: 'iron', transparent: false, solid: true, hardness: 4.0, drop: BLOCK.IRON,
    textures: [10, 10, 10, 10, 10, 10],
  },
  [BLOCK.DIAMOND]: {
    name: 'diamond', transparent: false, solid: true, hardness: 6.0, drop: BLOCK.DIAMOND,
    textures: [11, 11, 11, 11, 11, 11],
  },
  [BLOCK.BEDROCK]: {
    name: 'bedrock', transparent: false, solid: true, hardness: Infinity, drop: null,
    textures: [3, 3, 3, 3, 3, 3],
  },
  [BLOCK.PLANKS]: {
    name: 'planks', transparent: false, solid: true, hardness: 1.0, drop: BLOCK.PLANKS,
    textures: [12, 12, 12, 12, 12, 12],
  },
  [BLOCK.GLASS]: {
    name: 'glass', transparent: true, solid: true, hardness: 0.3, drop: BLOCK.GLASS,
    textures: [13, 13, 13, 13, 13, 13],
  },
  [BLOCK.SNOW]: {
    name: 'snow', transparent: false, solid: true, hardness: 0.1, drop: BLOCK.SNOW,
    textures: [14, 14, 14, 14, 14, 14],
  },
  [BLOCK.ICE]: {
    name: 'ice', transparent: true, solid: true, hardness: 0.5, drop: BLOCK.ICE,
    textures: [15, 15, 15, 15, 15, 15],
  },
  [BLOCK.GRAVEL]: {
    name: 'gravel', transparent: false, solid: true, hardness: 0.6, drop: BLOCK.GRAVEL,
    textures: [16, 16, 16, 16, 16, 16],
  },
};

/** Récupère les propriétés d'un bloc en toute sécurité. */
export function getBlockProps(id) {
  return BLOCKS[id] || BLOCKS[BLOCK.AIR];
}
export function isSolid(id)      { return getBlockProps(id).solid; }
export function isTransparent(id){ return getBlockProps(id).transparent; }
