// ============================================================================
// enemy.js – Simple enemy (zombie) that follows the player and deals damage on contact
// ============================================================================
import * as THREE from 'three';
import { input } from '../utils/input.js';
import { isSolid } from '../world/blockData.js';
import { WORLD_H } from '../world/terrainGenerator.js';

export class Enemy {
  constructor(scene, player, world, sceneHelpers = {}) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.helpers = sceneHelpers;

    // Stats
    this.health = 20;
    this.maxHealth = 20;
    this.damage = 2; // damage dealt to player on contact
    this.speed = 1.2; // units per second
    this.attackCooldown = 1.0; // seconds between attacks
    this.attackTimer = 0;

    // Visual representation (simple capsule)
    const geometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x8b0000 }); // dark red
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Position: spawn somewhere randomly near player but not too close
    this.resetPosition();
  }

  resetPosition() {
    // Find ground height by raycasting down from a high point
    const startX = this.player.getFootPos().x + (Math.cos(Math.random() * Math.PI * 2) * (10 + Math.random() * 10));
    const startZ = this.player.getFootPos().z + (Math.sin(Math.random() * Math.PI * 2) * (10 + Math.random() * 10));
    let groundY = 0;
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const id = this.world.getBlockAt(Math.floor(startX), y, Math.floor(startZ));
      if (isSolid(id)) {
        groundY = y;
        break;
      }
    }
    this.mesh.position.set(startX, groundY + 0.8, startZ); // center of capsule at feet + 0.8
    this.health = this.maxHealth;
    this.attackTimer = 0;
  }

  update(dt) {
    if (this.health <= 0) {
      // Dead: remove after a short delay
      this.mesh.visible = false;
      // Optionally remove from scene after a moment
      return;
    }

    // Move towards player on XZ plane
    const playerPos = this.player.getFootPos().clone();
    const enemyPos = this.mesh.position.clone();
    const dir = new THREE.Vector3(
      playerPos.x - enemyPos.x,
      0, // ignore Y for ground movement
      playerPos.z - enemyPos.z
    );
    const distance = dir.length();
    if (distance > 0.5) {
      dir.normalize();
      const move = dir.clone().multiplyScalar(this.speed * dt);
      const newPos = enemyPos.clone().add(move);

      // Check horizontal collision at feet level
      const feetY = this.mesh.position.y - 0.8; // feet position
      const newFeetY = feetY; // assume same ground level for collision check

      // Check if new position would be inside a solid block at feet level
      const blockAhead = this.world.getBlockAt(
        Math.floor(newPos.x),
        Math.floor(newFeetY),
        Math.floor(newPos.z)
      );
      const isSolidAhead = isSolid(blockAhead);

      if (!isSolidAhead) {
        // No collision, move freely
        this.mesh.position.x = newPos.x;
        this.mesh.position.z = newPos.z;
      } else {
        // Try to slide along X axis
        const moveX = new THREE.Vector3(dir.x, 0, 0).multiplyScalar(this.speed * dt);
        const posX = enemyPos.clone().add(moveX);
        const blockX = this.world.getBlockAt(
          Math.floor(posX.x),
          Math.floor(feetY),
          Math.floor(posX.z)
        );
        const solidX = isSolid(blockX);

        // Try to slide along Z axis
        const moveZ = new THREE.Vector3(0, 0, dir.z).multiplyScalar(this.speed * dt);
        const posZ = enemyPos.clone().add(moveZ);
        const blockZ = this.world.getBlockAt(
          Math.floor(enemyPos.x), // Fixed: use original enemy X position for Z-axis check
          Math.floor(feetY),
          Math.floor(posZ.z)
        );
        const solidZ = isSolid(blockZ);

        if (!solidX) {
          this.mesh.position.x = posX.x;
        }
        if (!solidZ) {
          this.mesh.position.z = posZ.z;
        }
        // If both blocked, don't move (stuck)
      }
    }

    // Always update Y to be on top of terrain
    const groundY = this._getGroundHeightAt(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = groundY + 0.8; // keep character standing on ground

    // Attack cooldown
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && distance < 1.5) {
      // Hit player
      this.player._takeDamage(this.damage, 'ennemi');
      this.attackTimer = this.attackCooldown;
    }

    // optional: rotate to face player
    if (distance > 0.1) {
      const angle = Math.atan2(playerPos.x - this.mesh.position.x, playerPos.z - this.mesh.position.z);
      this.mesh.rotation.y = angle;
    }
  }

  /** Helper to get ground height at (x,z) */
  _getGroundHeightAt(x, z) {
    // Raycast down from high point to find ground
    for (let y = WORLD_H - 1; y >= 0; y--) {
      const id = this.world.getBlockAt(Math.floor(x), y, Math.floor(z));
      if (isSolid(id)) {
        return y; // returns the Y of the solid block (ground level)
      }
    }
    return 0; // fallback to bedrock level
  }
}

// Simple health bar above enemy (optional)
// Not implemented for brevity

export class EnemyManager {
  constructor(scene, player, world, maxEnemies = 4) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.maxEnemies = maxEnemies;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 10; // seconds between spawn attempts
  }

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
      this.spawnEnemy();
      this.spawnTimer = this.spawnInterval;
    }
    // Update each enemy
    for (const enemy of this.enemies) {
      enemy.update(dt);
    }
    // Remove dead enemies after a while (optional cleanup)
    this.enemies = this.enemies.filter(e => e.health > 0 && e.mesh.visible);
  }

  spawnEnemy() {
    const enemy = new Enemy(this.scene, this.player, this.world);
    this.enemies.push(enemy);
  }

  // Call when player dies to clear enemies
  clear() {
    for (const e of this.enemies) {
      this.scene.remove(e.mesh);
    }
    this.enemies = [];
  }
}