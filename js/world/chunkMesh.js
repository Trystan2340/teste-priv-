// ============================================================================
// chunkMesh.js — Construction du mesh d'un chunk (avec face culling)
// ============================================================================
// Pour chaque bloc, on teste ses 6 voisins. Si le voisin occulterait
// une face (tous deux opaques), on n'émet pas cette face.
// On sépare solides (matériau opaque) et transparents (eau/feuilles/glass)
// dans deux meshes distincts pour rendre correctement la transparence.
// ============================================================================

import * as THREE from 'three';
import { Chunk } from './chunk.js';
import { CHUNK_W, CHUNK_D, WORLD_H } from './terrainGenerator.js';
import { BLOCKS, BLOCK, isTransparent } from './blockData.js';

/**
 * Directions : +X (right), -X, +Y (up), -Y, +Z (front), -Z (back)
 * Chaque entrée : [dx, dy, dz, normalX, normalY, normalZ, axisIdxForUV]
 */
const FACES = [
  { dir: [ 1, 0, 0], n: [ 1, 0, 0] }, // +X est
  { dir: [-1, 0, 0], n: [-1, 0, 0] }, // -X ouest
  { dir: [ 0, 1, 0], n: [ 0, 1, 0] }, // +Y haut
  { dir: [ 0,-1, 0], n: [ 0,-1, 0] }, // -Y bas
  { dir: [ 0, 0, 1], n: [ 0, 0, 1] }, // +Z sud (avant)
  { dir: [ 0, 0,-1], n: [ 0, 0,-1] }, // -Z nord
];

/**
 * Renvoie l'ID du bloc voisin : soit dans ce chunk, soit dans un chunk voisin
 * fourni par getNeighbor(id).
 */
function getNeighborBlock(chunk, getNeighbor, lx, ly, lz) {
  if (lx >= 0 && lx < CHUNK_W && ly >= 0 && ly < WORLD_H && lz >= 0 && lz < CHUNK_D) {
    return chunk.blocks[Chunk.indexOf(lx, ly, lz)];
  }
  // Calculer position monde et chercher dans chunk voisin
  const wx = chunk.cx * CHUNK_W + lx;
  const wy = ly;
  const wz = chunk.cz * CHUNK_D + lz;
  return getNeighbor(wx, wy, wz);
}

/**
 * Construit (ou reconstruit) les deux meshes du chunk :
 *   chunk.mesh        : blocs opaques
 *   chunk.transparentMesh : blocs transparents
 * @param {Chunk} chunk chunk à mailler
 * @param {(x,y,z)=>Uint8} getNeighbor fonction pour aller chercher les blocs hors chunk
 * @param {{uvForTile:(i)=>{u0,v0,u1,v1}}} atlasModule
 */
export function buildChunkMesh(chunk, getNeighbor, atlasModule) {
  const solidPos = [], solidNorm = [], solidUv = [], solidIdx = [];
  const transPos = [], transNorm = [], transUv = [], transIdx = [];
  const uvForTile = atlasModule.uvForTile;

  const pushFace = (buf, lx, ly, lz, face, tile) => {
    const base = buf.pos.length / 3;
    const { u0, v0, u1, v1 } = uvForTile(tile);

    // 4 coins du quad. Selon la direction de la face, l'ordre des vertices change
    // pour rester cohérent avec la normale (sens anti-horaire vu de l'extérieur).
    let corners;
    switch (face.dir[0] !== 0 ? 'x' : face.dir[1] !== 0 ? 'y' : 'z') {
      case 'x': { // ±X
        const x = lx + (face.dir[0] > 0 ? 1 : 0);
        corners = [
          [x, ly,     lz    ],
          [x, ly,     lz + 1],
          [x, ly + 1, lz + 1],
          [x, ly + 1, lz    ],
        ];
        break;
      }
      case 'y': { // ±Y
        const y = ly + (face.dir[1] > 0 ? 1 : 0);
        corners = [
          [lx,     y, lz    ],
          [lx + 1, y, lz    ],
          [lx + 1, y, lz + 1],
          [lx,     y, lz + 1],
        ];
        break;
      }
      case 'z': { // ±Z
        const z = lz + (face.dir[2] > 0 ? 1 : 0);
        corners = [
          [lx,     ly,     z],
          [lx,     ly + 1, z],
          [lx + 1, ly + 1, z],
          [lx + 1, ly,     z],
        ];
        break;
      }
    }

    // Coordonnées locales chunk → monde
    for (const c of corners) {
      buf.pos.push(
        c[0] + chunk.cx * CHUNK_W,
        c[1],
        c[2] + chunk.cz * CHUNK_D
      );
      buf.norm.push(face.n[0], face.n[1], face.n[2]);
    }

    // UV : on pad de 0.001 pour éviter le bleed entre tuiles
    const eps = 0.001;
    buf.uv.push(u0+eps, v1+eps,  u1-eps, v1+eps,  u1-eps, v0+eps,  u0+eps, v0+eps);

    // 2 triangles (CCW vu de l'extérieur)
    buf.idx.push(base, base+1, base+2,  base, base+2, base+3);
  };

  for (let ly = 0; ly < WORLD_H; ly++) {
    for (let lz = 0; lz < CHUNK_D; lz++) {
      for (let lx = 0; lx < CHUNK_W; lx++) {
        const id = chunk.blocks[Chunk.indexOf(lx, ly, lz)];
        if (id === BLOCK.AIR) continue;
        const props = BLOCKS[id];
        if (!props.textures) continue;
        const transparent = isTransparent(id);

        // Pour chaque face : tester le voisin
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nId = getNeighborBlock(chunk, getNeighbor,
            lx + face.dir[0], ly + face.dir[1], lz + face.dir[2]);

          // Si voisin existe et que les deux blocs sont opaques et identiques → pas de face
          // Si voisin est transparent → on émet la face
          // Si voisin est air → on émet la face
          // Cas spécial eau contre eau : ne pas générer de double-render visible
          if (nId !== BLOCK.AIR) {
            const nProps = BLOCKS[nId];
            if (!nProps.transparent && !transparent) {
              // Tous deux opaques → pas besoin de la face
              continue;
            }
            // Eau vs eau : ne pas générer de face entre deux cellules d'eau collées
            if (id === BLOCK.WATER && nId === BLOCK.WATER) continue;
            // Leaves adjacents : éviter le bruit visuel
            if (id === BLOCK.LEAVES && nId === BLOCK.LEAVES) continue;
          }

          const buf = transparent ? {
            pos: transPos, norm: transNorm, uv: transUv, idx: transIdx,
          } : {
            pos: solidPos, norm: solidNorm, uv: solidUv, idx: solidIdx,
          };
          pushFace(buf, lx, ly, lz, face, props.textures[f]);
        }
      }
    }
  }

  // Libère ancienne géométrie avant d'assigner la nouvelle pour éviter les leaks
  if (chunk.mesh) chunk.mesh.geometry.dispose();
  if (chunk.transparentMesh) chunk.transparentMesh.geometry.dispose();

  if (solidIdx.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(solidPos, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(solidNorm, 3));
    geom.setAttribute('uv',       new THREE.Float32BufferAttribute(solidUv, 2));
    geom.setIndex(solidIdx);
    geom.computeBoundingSphere();
    chunk.mesh = new THREE.Mesh(geom, atlasModule.material);
    chunk.mesh.frustumCulled = true;
    chunk.mesh.userData.chunk = chunk;
  } else {
    chunk.mesh = null;
  }

  if (transIdx.length > 0 && atlasModule.transparentMaterial) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(transPos, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(transNorm, 3));
    geom.setAttribute('uv',       new THREE.Float32BufferAttribute(transUv, 2));
    geom.setIndex(transIdx);
    geom.computeBoundingSphere();
    chunk.transparentMesh = new THREE.Mesh(geom, atlasModule.transparentMaterial);
    chunk.transparentMesh.renderOrder = 2;
    chunk.transparentMesh.frustumCulled = true;
    chunk.transparentMesh.userData.chunk = chunk;
  } else {
    chunk.transparentMesh = null;
  }

  chunk.dirty = false;
}
