// ============================================================================
// textureAtlas.js – Simple atlas builder for block textures
// ============================================================================
import * as THREE from 'three';

export class TextureAtlas {
  constructor() {
    this.texture = null;
    this.uvMap   = new Map(); // blockId → {x,y,w,h} in UV space (0‑1)
    this._nextX  = 0;
    this._nextY  = 0;
    this._rowHeight = 0;
    this._maxSize   = 2048; // atlas will grow up to this size (power of two)
  }

  /** Add a texture (already loaded) and return its UV rectangle */
  add(blockId, texture) {
    // Power‑of‑two padding (optional but helps on some GPUs)
    const w = texture.image.width;
    const h = texture.image.height;

    // Wrap to next line if needed
    if (this._nextX + w > this._maxSize) {
      this._nextX = 0;
      this._nextY += this._rowHeight;
      this._rowHeight = 0;
    }
    if (this._nextY + h > this._maxSize) {
      // Atlas full – fallback to individual texture (should not happen with 16×16)
      console.warn(`Texture atlas full, falling back to individual texture for ${blockId}`);
      return null;
    }

    // Copy pixels into a canvas at the current position
    if (!this.texture) {
      const canvas = document.createElement('canvas');
      canvas.width = this._maxSize;
      canvas.height = this._maxSize;
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.needsUpdate = true;
    }

    const ctx = this.texture.image.getContext('2d');
    ctx.drawImage(texture.image, this._nextX, this._nextY);

    const u = this._nextX / this._maxSize;
    const v = this._nextY / this._maxSize;
    const uw = w / this._maxSize;
    const vh = h / this._maxSize;

    this.uvMap.set(blockId, { u, v, uw, vh });

    // Advance cursor
    this._nextX += w;
    this._rowHeight = Math.max(this._rowHeight, h);
    this.texture.needsUpdate = true;

    return { u, v, uw, vh };
  }

  get textureObject() { return this.texture; }
  getUV(blockId) { return this.uvMap.get(blockId) || null; }
}