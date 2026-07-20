// ============================================================================
// inventory.js — Système d'inventaire (stacks d'items)
// ============================================================================
// Un item est { id: blockId, count: int }. La pile max est 64 par case.
// L'inventaire complet = 27 cases (3 rangées de 9), accessible via E.
// La barre rapide = 9 premières cases (= sous-ensemble de l'inventaire).
// ============================================================================

export const SLOT_COUNT = 27;     // inventaire complet
export const HOTBAR_SIZE = 9;

export class Inventory {
  constructor() {
    /** stacks[id] = {id, count} */
    this.stacks = new Array(SLOT_COUNT).fill(null);
    this.selected = 0; // index dans hotbar
    this._listeners = [];
  }

  onChange(fn) { this._listeners.push(fn); }
  _emit() { this._listeners.forEach(fn => fn(this)); }

  /** Renvoie la stack actuellement sélectionnée. */
  current() { return this.stacks[this.selected]; }

  /** Renvoie la stack à un index donné. */
  at(i) { return this.stacks[i] ?? null; }

  /** Sélectionne un slot du hotbar. */
  select(i) { if (i >= 0 && i < HOTBAR_SIZE) this.selected = i; this._emit(); }

  /** Cycle d'un cran (utilisé par la molette). */
  cycle(delta) {
    this.selected = ((this.selected + delta) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE;
    this._emit();
  }

  /**
   * Ajoute `count` items à l'inventaire. Retourne le nombre non-inséré (0 = tout).
   * Stratégie : remplir les stacks existants du même id, puis les cases vides.
   */
  add(id, count = 1) {
    let remaining = count;
    // D'abord remplir les stacks existants
    for (let i = 0; i < SLOT_COUNT && remaining > 0; i++) {
      const s = this.stacks[i];
      if (s && s.id === id && s.count < 64) {
        const can = Math.min(64 - s.count, remaining);
        s.count += can; remaining -= can;
      }
    }
    // Puis occuper les cases vides
    for (let i = 0; i < SLOT_COUNT && remaining > 0; i++) {
      if (!this.stacks[i]) {
        const can = Math.min(64, remaining);
        this.stacks[i] = { id, count: can };
        remaining -= can;
      }
    }
    this._emit();
    return remaining;
  }

  /** Retire `count` items de la stack à l'index i. Retourne combien retirés. */
  take(i, count = 1) {
    const s = this.stacks[i];
    if (!s) return 0;
    const take = Math.min(s.count, count);
    s.count -= take;
    if (s.count <= 0) this.stacks[i] = null;
    this._emit();
    return take;
  }

  /** Déplace une stack d'un index à un autre (utilisé dans l'UI inventaire). */
  move(from, to) {
    if (from === to) return;
    const a = this.stacks[from];
    const b = this.stacks[to];
    if (!a) return;
    if (b && b.id === a.id) {
      // Fusion
      const can = Math.min(64 - b.count, a.count);
      b.count += can;
      a.count -= can;
      if (a.count <= 0) this.stacks[from] = null;
    } else {
      // Swap ou place
      this.stacks[to] = a;
      this.stacks[from] = b ?? null;
    }
    this._emit();
  }

  /** Retourne le nombre total d'items avec l'id donné dans tout l'inventaire. */
  countItem(id) {
    let total = 0;
    for (const s of this.stacks) {
      if (s && s.id === id) total += s.count;
    }
    return total;
  }

  /**
   * Retire jusqu'à `count` items avec l'id donné de l'inventaire (pris depuis n'importe quelle slot).
   * Retourne le nombre réellement retiré.
   */
  removeItem(id, count = 1) {
    let toRemove = count;
    // On parcourt les slots et on retire autant que possible
    for (let i = 0; i < SLOT_COUNT && toRemove > 0; i++) {
      const s = this.stacks[i];
      if (s && s.id === id) {
        const taken = Math.min(s.count, toRemove);
        s.count -= taken;
        if (s.count <= 0) this.stacks[i] = null;
        toRemove -= taken;
      }
    }
    this._emit();
    return count - toRemove; // nombre réellement retiré
  }

  /** Vider entièrement (mort du joueur par ex.). */
  clear() { this.stacks.fill(null); this._emit(); }

  /** Sérialise en tableau plat pour la sauvegarde. */
  serialize() {
    return this.stacks.map(s => s ? { id: s.id, count: s.count } : null);
  }

  /** Restaure depuis une sérialisation. */
  deserialize(data) {
    if (!Array.isArray(data)) return;
    this.stacks = new Array(SLOT_COUNT).fill(null);
    for (let i = 0; i < Math.min(SLOT_COUNT, data.length); i++) {
      const v = data[i];
      if (v && typeof v.id === 'number' && typeof v.count === 'number') {
        this.stacks[i] = { id: v.id, count: v.count };
      }
    }
    this._emit();
  }
}
