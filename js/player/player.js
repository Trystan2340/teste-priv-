// ============================================================================
// player.js — Contrôleur du joueur (mouvement, collisions, raycast, mine/place)
// ============================================================================
// Responsabilités :
//   - Lecture de l'input (ZQSD/WASD, Espace, Shift, souris)
//   - Verrou de pointeur + caméra FPS
//   - Physique simple : gravité, saut, sprint, collisions AABB par axe
//   - Auto-step : permet de monter automatiquement par-dessus 1 bloc
//   - Raycast voxel (DDA) pour cibler / casser / poser des blocs
// ============================================================================

import * as THREE from 'three';
import { input } from '../utils/input.js';
import { BLOCK, isSolid } from '../world/blockData.js';
import { CHUNK_W, WORLD_H } from '../world/terrainGenerator.js';

const WIDTH  = 0.6;
const HEIGHT = 1.7;
const EYE_HEIGHT = 1.55;
const STEP_UP = 1.05; // hauteur max d'un bloc auto-stepable
const GRAVITY = -28.0;
const JUMP_VEL = 9.4;
const MAX_FALL_DMG_SPEED = 27; // au-delà : commence à prendre des dégâts
const FALL_DMG_SCALE = 2.6;

export class Player {
  constructor(camera, world, events = {}) {
    this.camera = camera;
    this.world  = world;
    this.events = events;

    /** Position du joueur (pied) en coordonnées monde. */
    this.pos    = new THREE.Vector3(0, WORLD_H - 8, 0);
    this.vel    = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this.yaw   = 0;
    this.pitch = 0;

    this.walkSpeed = 4.5;
    this.runMul    = 1.7;
    this.sens      = 0.0022;

    this.eyeHeight = EYE_HEIGHT;

    /** Bloc ciblé par le raycast. */
    this.target = null;   // {wx, wy, wz, id, normal}
    this.mineProgress = 0;
    this.mineTarget   = null;

    /** Stats de survie. */
    this.health    = 100;
    this.maxHealth = 100;
    this.hunger    = 100;
    this.maxHunger = 100;
    this.regenTimer = 0;
    this.hungerTimer = 0;

    this.lastFallSpeed = 0;
    this.dead = false;

    /** Anti-spam mine pour casse instantanée. */
    this.lastClickTime = 0;

    // Pose initiale des yeux
    this._updateCamera();
  }

  /** Setter de la position (utile pour chargement de sauvegarde). */
  setPositionFromSave({ x, y, z, yaw, pitch }) {
    this.pos.set(x, y, z);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this._updateCamera();
  }

  /** Donne la position des pieds. */
  getFootPos() { return this.pos; }

  /** Centre des yeux (pour caméra). */
  getEyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }

  /** Renvoie la position + yaw/pitch sauvegardable. */
  getSaveState() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch,
      hp: this.health, hunger: this.hunger,
    };
  }

  /** Mise à jour de la position/orientation de la caméra. */
  _updateCamera() {
    this.camera.position.copy(this.getEyePos());
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  /** Rotation de la caméra avec la souris. */
  rotate(dx, dy) {
    const sens = this.sens;
    this.yaw   -= dx * sens;
    this.pitch -= dy * sens;
    // Limite le pitch entre -89° et +89°
    const lim = Math.PI / 2 - 0.01;
    if (this.pitch >  lim) this.pitch =  lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  setSensitivity(s) { this.sens = s; }

  /**
   * Met à jour le joueur (à appeler chaque frame).
   */
  update(dt) {
    if (this.dead) return;
    const move = input.getMove();

    // Vecteur avant/droite basé sur yaw (ignorer pitch → on regarde vers l'avant horizontal)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let vx = 0, vz = 0;
    if (move.forward !== 0) { vx += forward.x * move.forward; vz += forward.z * move.forward; }
    if (move.right   !== 0) { vx += right.x   * move.right;   vz += right.z   * move.right; }
    const len = Math.hypot(vx, vz);
    if (len > 0) { vx /= len; vz /= len; }

    const speed = this.walkSpeed * (move.sprint ? this.runMul : 1);

    // --- Saut ---
    if (move.jump && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
      if (this.events.onJump) this.events.onJump();
    }

    // --- Gravité ---
    this.vel.y += GRAVITY * dt;
    if (this.vel.y < -55) this.vel.y = -55; // bom vitesse

    // --- Eteindre la chute progressive avec frame rate ---
    const step = Math.min(dt, 0.05);

    // --- Mouvements séparés par axe (avec collision) ---
    const mx = vx * speed * step;
    const mz = vz * speed * step;
    const my = this.vel.y * step;

    // Essayer d'escalader automatiquement un bloc (auto-step)
    if (this.onGround && (mx !== 0 || mz !== 0)) {
      const aheadStep = this._tryStepUp(mx, mz);
      if (aheadStep !== null) {
        this.pos.y += aheadStep;
        this.pos.x += mx;
        this.pos.z += mz;
        // Considérer qu'on est toujours grounded après le step-up
        this.onGround = true;
      } else {
        this.pos.x = this._moveAxis('x', mx, this.pos.x);
        this.pos.z = this._moveAxis('z', mz, this.pos.z);
      }
    } else {
      this.pos.x = this._moveAxis('x', mx, this.pos.x);
      this.pos.z = this._moveAxis('z', mz, this.pos.z);
    }

    const beforeY = this.pos.y;
    const newY    = this._moveAxis('y', my, this.pos.y);
    if (my < 0 && newY > beforeY) {
      // On a touché le sol : garde la chute cumulée
      this.lastFallSpeed = -this.vel.y;
      this.vel.y = 0;
      this.onGround = true;
    } else if (my > 0) {
      // En train de monter, vérifier bump de tête
      this.onGround = false;
    } else {
      this.onGround = false;
    }
    this.pos.y = newY;

    // --- Dégâts de chute ---
    if (this.onGround && this.lastFallSpeed > MAX_FALL_DMG_SPEED) {
      const fallSpeed = this.lastFallSpeed;
      const dmg = Math.floor((fallSpeed - MAX_FALL_DMG_SPEED) * FALL_DMG_SCALE);
      if (dmg > 0) this._takeDamage(dmg, 'chute');
    }
    if (this.lastFallSpeed < MAX_FALL_DMG_SPEED) this.lastFallSpeed = 0;

    // --- Régénération ---
    if (this.health < this.maxHealth && this.hunger > 6) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.regenTimer = 0;
        this.hunger = Math.max(0, this.hunger - 0.1);
      }
    }
    // Diminution lente de la faim
    this.hungerTimer += dt;
    if (this.hungerTimer > 12) {
      this.hunger = Math.max(0, this.hunger - 1);
      this.hungerTimer = 0;
    }
    if (this.hunger <= 0 && this.health > 0) {
      // Pas de dégâts frame par frame — accumulation par tickTimer (12s)
      this.starvationTimer = (this.starvationTimer || 0) + dt;
      if (this.starvationTimer >= 12) {
        this.starvationTimer = 0;
        this._takeDamage(1, 'faim');
      }
    } else {
      this.starvationTimer = 0;
    }

    // --- Raycast pour cible / minage ---
    this._raycastTarget();

    // --- Gestion du minage (en continu tant que clic maintenu) ---
    if (this.mineTarget) {
      this.mineProgress += dt;
      const props = this._propsFor(this.mineTarget.id);
      const hardness = props?.hardness ?? 1;
      // On "casse" après un délai proportionnel à la dureté
      if (this.mineProgress >= Math.max(0.25, hardness * 0.6)) {
        this._breakBlock(this.mineTarget);
        this.mineProgress = 0;
        this.mineTarget = null;
      }
    }

    this._updateCamera();
  }

  /**
   * Essayer de monter un bloc : si le mouvement horizontal est bloqué par
   * un bloc solide de hauteur ≤ STEP_UP, tenter de le franchir.
   */
  _tryStepUp(dmx, dmz) {
    const EPS = 0.01;
    const newX = this.pos.x + dmx;
    const newZ = this.pos.z + dmz;
    // Tester la hauteur du sol à la nouvelle position
    const floorY = this._floorBelowCandidate(newX, this.pos.y, newZ);
    const topY   = this.pos.y + 0.001;
    if (floorY === null) return null;
    const diff = Math.floor(floorY + EPS) - Math.floor(topY);
    if (diff <= 0) return null;
    if (diff > STEP_UP) return null;
    // Vérifier qu'on a l'espace au-dessus pour passer
    const headY = this.pos.y + HEIGHT + diff;
    if (this._anyBlockInBox(newX, headY - HEIGHT, newZ, newX + WIDTH, headY)) {
      return null;
    }
    return diff;
  }

  /** Renvoie la coordonnée Y du dessus du bloc juste sous la position donnée (ou null). */
  _floorBelowCandidate(x, y, z) {
    // Vérifier la cellule même sous la position
    const my = Math.floor(y - 0.05);
    if (this._isSolidAt(x, my, z)) return my + 1;
    return null;
  }

  _isSolidAt(x, y, z) {
    const id = this.world.getBlockAt(Math.floor(x), y, Math.floor(z));
    return isSolid(id);
  }

  _propsFor(id) { return { hardness: 1.0, drop: id, isSolid: (id) => isSolid(id) }; }

  /**
   * Teste si la box AABB du joueur intersecte un bloc plein après
   * déplacement sur l'axe `axis`.
   * Bloque le déplacement au ras du bloc (collision response).
   */
  _collidesAt(x, y, z) {
    const minX = Math.floor(x - WIDTH/2);
    const maxX = Math.floor(x + WIDTH/2);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + HEIGHT);
    const minZ = Math.floor(z - WIDTH/2);
    const maxZ = Math.floor(z + WIDTH/2);
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (this._isSolidAt(bx + 0.5, by + 0.5, bz + 0.5)) {
            // Le point central est dans ce bloc → collision
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Renvoie true si un bloc solide existe dans la box donnée. */
  _anyBlockInBox(x0, y0, z0, x1, y1, z1) {
    const minX = Math.floor(x0), maxX = Math.floor(x1 - 0.001);
    const minY = Math.floor(y0), maxY = Math.floor(y1 - 0.001);
    const minZ = Math.floor(z0), maxZ = Math.floor(z1 - 0.001);
    for (let by = minY; by <= maxY; by++)
      for (let bz = minZ; bz <= maxZ; bz++)
        for (let bx = minX; bx <= maxX; bx++)
          if (this._isSolidAt(bx + 0.5, by + 0.5, bz + 0.5)) return true;
    return false;
  }

  /**
   * Déplace la composante `axis` du joueur en gérant la collision
   * avec des itérations de poussée (sortie rapide).
   */
  _moveAxis(axis, delta, current) {
    if (delta === 0) return current;
    const newPos = current + delta;
    if (axis === 'x') {
      if (!this._collidesAt(newPos, this.pos.y, this.pos.z)) return newPos;
      // Sub-step
      const safe = this._subStepAxis('x', current, delta);
      return safe;
    } else if (axis === 'z') {
      if (!this._collidesAt(this.pos.x, this.pos.y, newPos)) return newPos;
      return this._subStepAxis('z', current, delta);
    } else {
      // Y : la hitbox du joueur est [pos.y .. pos.y+HEIGHT] (pieds vers tête)
      if (delta > 0) { // montée (saut) → bloquer si on cogne le plafond
        if (this._collidesAt(this.pos.x, newPos, this.pos.z)) return current;
        return newPos;
      } else { // descente (gravité) → bloquer quand on touche le sol
        if (this._collidesAt(this.pos.x, newPos, this.pos.z)) {
          return current;
        }
        return newPos;
      }
    }
  }

  _subStepAxis(axis, cur, delta) {
    const steps = Math.max(1, Math.ceil(Math.abs(delta) * 16));
    let v = cur;
    const sgn = Math.sign(delta);
    for (let i = 0; i < steps; i++) {
      const step = delta / steps;
      const next = v + step;
      const collides = axis === 'x'
        ? this._collidesAt(next, this.pos.y, this.pos.z)
        : this._collidesAt(this.pos.x, this.pos.y, next);
      if (collides) return v;
      v = next;
    }
    return v;
  }

  /**
   * Raycast voxel (DDA Amanatides & Woo).
   * Met à jour this.target. Renvoie la cible {wx,wy,wz,id,normal}.
   */
  _raycastTarget(maxDist = 7) {
    const eye = this.getEyePos();
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
       Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    const wx = eye.x, wy = eye.y, wz = eye.z;
    let ix = Math.floor(wx), iy = Math.floor(wy), iz = Math.floor(wz);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    const tMaxX = ((stepX > 0 ? (ix + 1) : ix) - wx) * tDeltaX;
    const tMaxY = ((stepY > 0 ? (iy + 1) : iy) - wy) * tDeltaY;
    const tMaxZ = ((stepZ > 0 ? (iz + 1) : iz) - wz) * tDeltaZ;

    let face = { nx: 0, ny: 0, nz: 0 };
    let t = 0;
    while (t <= maxDist) {
      const id = this.world.getBlockAt(ix, iy, iz);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) {
        this.target = { wx: ix, wy: iy, wz: iz, id, normal: { ...face } };
        return this.target;
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { ix += stepX; t = tMaxX; tMaxX += tDeltaX; face = { nx: -stepX, ny: 0, nz: 0 }; }
        else              { iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = { nx: 0, ny: 0, nz: -stepZ }; }
      } else {
        if (tMaxY < tMaxZ) { iy += stepY; t = tMaxY; tMaxY += tDeltaY; face = { nx: 0, ny: -stepY, nz: 0 }; }
        else              { iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = { nx: 0, ny: 0, nz: -stepZ }; }
      }
    }
    this.target = null;
    return null;
  }

  /** Renvoie les cellules voisines où placer un bloc (par rapport à la cible). */
  getPlacementCell() {
    if (!this.target) return null;
    const n = this.target.normal;
    return {
      wx: this.target.wx + n.nx,
      wy: this.target.wy + n.ny,
      wz: this.target.wz + n.nz,
     };
  }

  /** Casse le bloc ciblé, ajoute à l'inventaire du joueur. */
  _breakBlock(target) {
    const props = this._propsFor(target.id);
    if (target.id === BLOCK.BEDROCK) return; // incassable
    this.world.setBlockAt(target.wx, target.wy, target.wz, BLOCK.AIR);
    // Mark chunk dirty for mesh rebuild (setBlockAt already does this via _markDirty)
    // Rebuild chunk immediately (optional, but we rely on dirty chunk system in main loop)
    const chunkX = Math.floor(target.wx / CHUNK_W);
    const chunkZ = Math.floor(target.wz / CHUNK_W);
    this.world.rebuildChunk(chunkX, chunkZ);
    // Pour le mesh mesh atlas, la reconstruction prend déjà en compte
    const dropId = props?.drop ?? null;
    if (this.events.onBlockBroken) this.events.onBlockBroken(dropId);
    if (this.events.onBreak) this.events.onBreak({ wx: target.wx, wy: target.wy, wz: target.wz, id: target.id });
  }

  /** Place un bloc. Vérifie qu'on ne le met pas dans le joueur. */
  placeBlock(blockId) {
    const cell = this.getPlacementCell();
    if (!cell) return false;
    if (cell.wy < 0 || cell.wy >= WORLD_H) return false;
    if (this.world.getBlockAt(cell.wx, cell.wy, cell.wz) !== BLOCK.AIR) return false;
    // Vérifier qu'on ne place pas dans la hitbox du joueur
    if (this._collidesAt(cell.wx + 0.5, cell.wy, cell.wz + 0.5)) return false;
    this.world.setBlockAt(cell.wx, cell.wy, cell.wz, blockId);
    this.world.rebuildChunk(
      Math.floor(cell.wx / CHUNK_W),
      Math.floor(cell.wz / CHUNK_W)
    );
    if (this.events.onPlace) this.events.onPlace({ wx: cell.wx, wy: cell.wy, wz: cell.wz, id: blockId });
    return true;
  }

  /** Démarre un minage (appelé sur clic gauche enfoncé). */
  startMining() {
    if (!this.target) return;
    if (this.target.id === BLOCK.BEDROCK) return;
    this.mineTarget = { ...this.target };
    this.mineProgress = 0;
  }

  /** Stoppe le minage (clic gauche relâché). */
  stopMining() {
    this.mineTarget = null;
    this.mineProgress = 0;
  }

  /** Dégâts infligés au joueur. */
  _takeDamage(amount, reason = 'inconnu') {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      if (this.events.onDeath) this.events.onDeath({ reason });
    }
    if (this.events.onDamage) this.events.onDamage({ amount, reason, hp: this.health });
  }

  /** Soigne le joueur. */
  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  setHealth(h) { this.health = h; this.dead = this.health <= 0; }
  setHunger(h) { this.hunger = h; }
}
