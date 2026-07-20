// ============================================================================
// chunk.js — Stockage de données d'un chunk
// ============================================================================
// Chaque chunk possède : sa position (cx, cz), un tableau Uint8Array
// (CHUNK_W × WORLD_H × CHUNK_D), un flag dirty pour savoir s'il faut
// reconstruire le mesh, et une éventuelle modification locale (joueur
// qui a cassé/posé un bloc).
// ============================================================================

import { CHUNK_W, CHUNK_D, WORLD_H } from './terrainGenerator.js';

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    /** blocs Uint8Array indexés : i = ly * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx */
    this.blocks = new Uint8Array(CHUNK_W * WORLD_H * CHUNK_D);
    this.dirty = true;
    /** modifications locales (joueur a posé/cassé) — dict {key → id} */
    this.localChanges = new Map();
    /** références Three.js pour nettoyage mémoire */
    this.mesh = null;
    this.transparentMesh = null;
  }

  /** Index d'un bloc en coords locales (lx, ly, lz). */
  static indexOf(lx, ly, lz) {
    return ly * CHUNK_W * CHUNK_D + lz * CHUNK_W + lx;
  }

  get(lx, ly, lz) {
    if (ly < 0 || ly >= WORLD_H) return 0;
    if (lx < 0 || lx >= CHUNK_W) return 0;
    if (lz < 0 || lz >= CHUNK_D) return 0;
    return this.blocks[Chunk.indexOf(lx, ly, lz)];
  }

  set(lx, ly, lz, id) {
    if (ly < 0 || ly >= WORLD_H) return;
    if (lx < 0 || lx >= CHUNK_W) return;
    if (lz < 0 || lz >= CHUNK_D) return;
    this.blocks[Chunk.indexOf(lx, ly, lz)] = id;
    this.dirty = true;
  }

  /** Vide proprement la géométrie du chunk pour éviter les fuites mémoire. */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.transparentMesh) {
      this.transparentMesh.geometry.dispose();
      this.transparentMesh = null;
    }
  }
}
