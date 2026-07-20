// ============================================================================
// input.js — Gestionnaire centralisé clavier / souris
// ============================================================================
// Centralise la détection des touches (avec support ZQSD et WASD),
// des clics souris et de la molette. Utilise le verrou de pointeur
// (pointerLock) pour la caméra à la première personne.
// ============================================================================

class InputManager {
  constructor() {
    // État des touches, exposé en lecture
    this.keys = new Set();
    // Mémorise les clics et scrolls consommés cette frame
    this._clicks = [];     // { button, type:'down'|'up', x, y }
    this._scrollDelta = 0;
    this._mouseDX = 0;
    this._mouseDY = 0;
    // Callback pour les events one-shot (touches fonction, molette API externe)
    this._listeners = { keydown: [], keyup: [], scroll: [] };

    this._setup();
  }

  _setup() {
    window.addEventListener('keydown', (e) => {
      // Empêcher le scroll de page sur espace, etc.
      if ([' ', 'Tab'].includes(e.key)) e.preventDefault();

      // Touche numérique pour sélection hotbar
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this._fire('scroll', { hotbar: n - 1 });
      }

      // Touche fonction E pour inventaire, Échap pour menu
      if (e.key === 'e' || e.key === 'E') this._fire('keydown', { action: 'inventory' });
      if (e.key === 'Escape') this._fire('keydown', { action: 'escape' });

      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Souris — n'enregistre clics + mouvement que quand le pointer est verrouillé
    document.addEventListener('mousedown', (e) => {
      this._clicks.push({ button: e.button, type: 'down' });
    });
    document.addEventListener('mouseup', (e) => {
      this._clicks.push({ button: e.button, type: 'up' });
    });

    document.addEventListener('wheel', (e) => {
      this._scrollDelta += Math.sign(e.deltaY);
    }, { passive: true });

    // Mouvement souris pour la rotation caméra — seulement si pointerLock actif
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this._mouseDX += e.movementX;
        this._mouseDY += e.movementY;
      }
    });
  }

  on(evt, fn) { if (this._listeners[evt]) this._listeners[evt].push(fn); }
  _fire(evt, data) { (this._listeners[evt] || []).forEach(fn => fn(data)); }

  /** Demande le verrou de pointeur (canvas). */
  requestPointerLock(el) {
    if (el.requestPointerLock) el.requestPointerLock();
  }

  isLocked() { return document.pointerLockElement !== null; }

  /** Lecture de l'input WASD/ZQSD + Shift (sprint) + Espace (saut). */
  /** Retourne {forward, right, jump, sprint} normalisés. */
  getMove() {
    const fwd    = (this.keys.has('KeyW') || this.keys.has('KeyZ')) ? 1 : 0
                 - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0)
                 - (this.keys.has('KeyA') || this.keys.has('KeyQ') ? 1 : 0);
    const jump   = this.keys.has('Space');
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    return { forward: fwd, right: strafe, jump, sprint };
  }

  /** Récupère et réinitialise le delta souris (caméra). */
  consumeMouseDelta() {
    const d = { dx: this._mouseDX, dy: this._mouseDY };
    this._mouseDX = 0; this._mouseDY = 0;
    return d;
  }

  /** Récupère les clics de la frame (et vide la file). */
  consumeClicks() {
    const c = this._clicks.slice();
    this._clicks.length = 0;
    return c;
  }

  /** Récupère et réinitialise le delta de molette. */
  consumeScroll() {
    const v = this._scrollDelta;
    this._scrollDelta = 0;
    return v;
  }
}

// Singleton : exporté pour partage dans toute l'app
export const input = new InputManager();
