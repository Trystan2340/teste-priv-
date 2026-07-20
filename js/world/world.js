// ============================================================================
// world.js — Gestionnaire de chunks (chargement / déchargement)
// ============================================================================
// World orchestre :
//   - une Map<string, Chunk> de chunks actifs
//   - le chargement / déchargement par proximité du joueur
//   - la fonction getBlockAt(x,y,z) qui traverse les chunks voisins
//   - la file de génération asynchrone pour ne pas freezer
// Tous les blocs modifiés par le joueur sont stockés dans
// `blockChanges` (delta global) pour la sauvegarde.
// ============================================================================

import * as THREE from 'three';
import { Chunk } from './chunk.js';
import { CHUNK_W, CHUNK_D, WORLD_H, createTerrainGenerator } from './terrainGenerator.js';
import { BLOCK } from './blockData.js';
import { buildChunkMesh } from './chunkMesh.js';
import { CHUNK_W as _CHUNK_W } from './terrainGenerator.js';

export class World {
  constructor({ seed, renderDistance = 5, atlas, callbacks = {} }) {
    this.seed = seed >>> 0;
    this.renderDistance = renderDistance;
    this.atlas = atlas; // { texture, uvForTile, material, transparentMaterial }
    this.terrain = createTerrainGenerator(this.seed);

    /** Map "cx,cz" → Chunk */
    this.chunks = new Map();
    /** Modifications locales : "wx|wy|wz" → blockId (pour sauvegarde) */
    this.blockChanges = new Map();

    /** File de génération à exécuter */
    this._genQueue = [];
    /** Chunks actuellement vus comme dirty (pending rebuild) */
    this._dirty = new Set();

    /** Conteneur scène */
    this.group = new THREE.Group();
    this.group.name = 'world';

    this.callbacks = callbacks;
  }

  /** Clé pour Map "cx,cz". */
  static key(cx, cz) { return `${cx},${cz}`; }

  /** Depuis clé, récupère cx,cz. */
  static parseKey(k) {
    const [a, b] = k.split(',');
    return [parseInt(a, 10), parseInt(b, 10)];
  }

  /** Renvoie le bloc aux coordonnées monde — gère les bords de chunks. */
  getBlockAt(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_W);
    const cz = Math.floor(wz / CHUNK_D);
    const k = World.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk) {
      // Si le chunk n'est pas encore chargé, on génère à la volée
      // un "standing-in" pour les tests hors mesh (raycast, collision).
      return this.terrain.getBlock(wx, wy, wz);
    }
    const lx = wx - cx * CHUNK_W;
    const ly = wy;
    const lz = wz - cz * CHUNK_D;
    if (ly < 0 || ly >= WORLD_H) return BLOCK.AIR;
    return chunk.blocks[Chunk.indexOf(lx, ly, lz)];
  }

  /** Pose un bloc aux coordonnées monde. Marque dirty les chunks concernés. */
  setBlockAt(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_H) return;
    const cx = Math.floor(wx / CHUNK_W);
    const cz = Math.floor(wz / CHUNK_D);
    const k = World.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk) return;
    const lx = wx - cx * CHUNK_W;
    const lz = wz - cz * CHUNK_D;
    chunk.set(lx, wy, lz, id);
    chunk.localChanges.set(`${lx}|${ly}|${lz}`, id);
    this.blockChanges.set(`${wx}|${wy}|${wz}`, id);

    // Le mesh des chunks adjacents peut aussi devoir être reconstruit
    // si on est en bordure
    const onEdge = (lx === 0 || lx === CHUNK_W - 1 || lz === 0 || lz === CHUNK_D - 1);
    if (onEdge) {
      if (lx === 0) this._markDirty(cx - 1, cz);
      if (lx === CHUNK_W - 1) this._markDirty(cx + 1, cz);
      if (lz === 0) this._markDirty(cx, cz - 1);
      if (lz === CHUNK_D - 1) this._markDirty(cx, cz + 1);
    }
    this._markDirty(cx, cz);
  }

  _markDirty(cx, cz) {
    const k = World.key(cx, cz);
    const c = this.chunks.get(k);
    if (c) {
      c.dirty = true;
      this._dirty.add(k);
    }
  }

  /**
   * Met à jour le chargement en fonction de la position du joueur.
   * Idempotent — peut être appelé chaque frame.
   * @param {number} playerX position monde X
   * @param {number} playerZ position monde Z
   * @param {Object} report {onProgress?: (loaded, total)=>void}
   */
  updateAroundPlayer(playerX, playerZ, report = {}) {
    const centerCX = Math.floor(playerX / CHUNK_W);
    const centerCZ = Math.floor(playerZ / CHUNK_D);
    const r = this.renderDistance;
    const wanted = new Set();

    // Charger chunks dans le rayon de rendu
    let total = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = centerCX + dx;
        const cz = centerCZ + dz;
        wanted.add(World.key(cx, cz));
        if (!this.chunks.has(World.key(cx, cz))) {
          // Charger en file
          if (!this._genQueue.find(q => q.cx === cx && q.cz === cz)) {
            this._genQueue.push({ cx, cz, status: 'pending' });
          }
        }
        total++;
      }
    }

    // Décharger chunks lointains
    for (const k of this.chunks.keys()) {
      if (!wanted.has(k)) {
        const [cx, cz] = World.parseKey(k);
        if (Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ)) > r + 1) {
          this._unloadChunk(k);
        }
      }
    }

    if (report.onProgress) report.onProgress(this.chunks.size, total);
  }

  _unloadChunk(k) {
    const chunk = this.chunks.get(k);
    if (!chunk) return;
    if (chunk.mesh)         { this.group.remove(chunk.mesh);         chunk.mesh.geometry.dispose(); }
    if (chunk.transparentMesh) { this.group.remove(chunk.transparentMesh); chunk.transparentMesh.geometry.dispose(); }
    this.chunks.delete(k);
    this._dirty.delete(k);
  }

  /** Traite UN chunk de la file (à appeler chaque frame). */
  _processQueueOne() {
    if (this._genQueue.length === 0) return;
    // Priorité aux chunks les plus proches du joueur
    this._genQueue.sort((a, b) => (a._p || 0) - (b._p || 0));
    const item = this._genQueue.shift();
    if (item.status === 'done') return;

    const gen = this.terrain.generateChunk(item.cx, item.cz);
    const chunk = new Chunk(item.cx, item.cz);

    // Restaure d'abord les données générées, puis applique les modifications joueurs
    chunk.blocks.set(gen.blocks);

    // Si on a un delta enregistré pour ce chunk, on l'applique
    for (let lx = 0; lx < CHUNK_W; lx++) {
      for (let lz = 0; lz < CHUNK_D; lz++) {
        for (let ly = 0; ly < WORLD_H; ly++) {
          const wx = item.cx * CHUNK_W + lx;
          const wz = item.cz * CHUNK_D + lz;
          const k = `${wx}|${ly}|${wz}`;
          if (this.blockChanges.has(k)) {
            chunk.blocks[Chunk.indexOf(lx, ly, lz)] = this.blockChanges.get(k);
          }
        }
      }
    }

    chunk.dirty = true;
    this.chunks.set(World.key(item.cx, item.cz), chunk);
    this._dirty.add(World.key(item.cx, item.cz));
  }

  /** Retourne combien de chunks sont en attente. */
  pendingCount() { return this._genQueue.length; }

  /** Reconstruit les meshes de tous les chunks dirty (à appeler en batch). */
  rebuildDirtyMeshes() {
    if (this._dirty.size === 0) return;
    const getNeighbor = (wx, wy, wz) => this.getBlockAt(wx, wy, wz);
    let built = 0;
    for (const k of this._dirty) {
      const chunk = this.chunks.get(k);
      if (!chunk) continue;
      // Construit le mesh
      buildChunkMesh(chunk, getNeighbor, this.atlas);
      // Anciens meshes, ajout
      if (chunk.mesh) {
        if (chunk.mesh.parent) chunk.mesh.parent.remove(chunk.mesh);
        this.group.add(chunk.mesh);
      }
      if (chunk.transparentMesh) {
        if (chunk.transparentMesh.parent) chunk.transparentMesh.parent.remove(chunk.transparentMesh);
        this.group.add(chunk.transparentMesh);
      }
      built++;
    }
    this._dirty.clear();
    if (this.callbacks.onMeshRebuilt) this.callbacks.onMeshRebuilt(built);
  }

  /** Force la mise à jour du mesh d'un chunk donné (utilisé après edit joueur). */
  rebuildChunk(cx, cz) {
    this._markDirty(cx, cz);
    this.rebuildDirtyMeshes();
  }

  /** Nettoie toutes les ressources (shutdown). */
  dispose() {
    for (const k of this.chunks.keys()) {
      this._unloadChunk(k);
    }
    this.chunks.clear();
    this.blockChanges.clear();
    this._genQueue.length = 0;
    this._dirty.clear();
  }
}
