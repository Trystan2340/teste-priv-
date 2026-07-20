// ============================================================================
// main.js — Point d'entrée principal du jeu PixelCraft (version améliorée)
// ============================================================================

import * as THREE from 'three';
import { World } from './world/world.js';
import { Player } from './player/player.js';
import { Inventory } from './inventory/inventory.js';
import { input } from './utils/input.js';
import { TextureAtlas } from './utils/textureAtlas.js';
import { AudioManager } from './utils/audio.js';
import { EnemyManager } from './entities/enemui.js';
import { CHUNK_W, WORLD_H } from './world/terrainGenerator.js';

// Day/Night circle
let gameTime = 0.25; // Start at dawn (0.0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
const dayLength = 600; // 10 minutes per day (in seconds)
const showSunMoon = true; // Toggle to show sun/moon sprites

// Game state
const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  INVENTORY: 'inventory',
  DEAD: 'dead',
  SETTINGS: 'settings',
  LOADING: 'loading'
};

let state = STATE.MENU;

// Three.js setup
let scene, camera, renderer, clock;

// Day/Night cycle lighting
let hemiLight = null;
let dirLight = null;

// Game objects
let world = null;
let player = null;
let inventory = null;
let enemyManager = null; // <-- added
let hemiLight = null;    // Day/night hemisphere light
let dirLight = null;     // Day/night directional light

// Texture system
const textureLoader = new THREE.TextureLoader();
const textureAtlas = new TextureAtlas();
const blockTextures = {}; // blockId -> {topUV, sideUV, side2UV}

// Day/Night visuals
let sunMoonSprite = null;
const sunMoonDistance = 200; // Distance from player
const sunMoonSize = 20; // Size of sprite

// Audio system
const audio = new AudioManager();

// UI Elements
const ui = {
  // Overlays
  mainMenu: document.getElementById('main-menu'),
  settingsPanel: document.getElementById('settings-panel'),
  deathScreen: document.getElementById('death-screen'),
  inventoryOverlay: document.getElementById('inventory-overlay'),
  pauseOverlay: document.getElementById('pause-overlay'),
  loadingOverlay: document.getElementById('loading'),
  hud: document.getElementById('hud'),

  // Buttons
  btnNew: document.getElementById('btn-new'),
  btnContinue: document.getElementById('btn-continue'),
  btnSettings: document.getElementById('btn-settings'),
  btnQuit: document.getElementById('btn-quit'),
  btnSettingsBack: document.getElementById('btn-settings-back'),
  btnRespawn: document.getElementById('btn-respawn'),
  btnResume: document.getElementById('btn-resume'),
  btnPauseSettings: document.getElementById('btn-pause-settings'),
  btnSaveQuit: document.getElementById('btn-save-quit'),
  btnDelSave: document.getElementById('btn-del-save'),
  btnExportSave: document.getElementById('btn-export-save'),

  // HUD elements
  healthFill: document.getElementById('health-fill'),
  foodFill: document.getElementById('food-fill'),
  fpsCounter: document.getElementById('fps-counter'),
  crosshair: document.getElementById('crosshair'),
  targetInfo: document.getElementById('target-info'),

  // Hotbar
  hotbar: document.getElementById('hotbar'),

  // Settings controls
  volumeSlider: document.getElementById('set-volume'),
  sensSlider: document.getElementById('set-sens'),
  viewSlider: document.getElementById('set-view'),
  qualitySelect: document.getElementById('set-quality'),
  fpsCheckbox: document.getElementById('set-fps'),
  volumeValue: document.getElementById('val-volume'),
  sensValue: document.getElementById('val-sens'),
  viewValue: document.getElementById('val-view'),

  // Menu tip
  menuTip: document.getElementById('menu-tip'),

  // Crafting UI
  craftingOverlay: document.getElementById('crafting-overlay'),
  craftingGrid: document.getElementById('crafting-grid'),
  craftingResultSlot: document.getElementById('crafting-result'),
  craftingRecipeName: document.getElementById('crafting-recipe-name'),
  btnCraft: document.getElementById('btn-craft'),
  btnCraftClose: document.getElementById('btn-craft-close')
};

// Game data
let seed = Date.now();
let saveData = null;

// Crafting system
const craftingRecipes = {
  // Format: { result: {id, count}, ingredients: [{id, count}, ...] }
  'wooden_pickaxe': {
    result: {id: 5, count: 1}, // WOOD
    ingredients: [
      {id: 5, count: 3}, // WOOD
      {id: 2, count: 2}  // DIRT (as stick placeholder)
    ]
  },
  'stone_pickaxe': {
    result: {id: 3, count: 1}, // STONE
    ingredients: [
      {id: 3, count: 3}, // STONE
      {id: 5, count: 2}  // WOOD
    ]
  },
  'wooden_sword': {
    result: {id: 5, count: 1}, // WOOD (as sword placeholder)
    ingredients: [
      {id: 5, count: 2}, // WOOD
      {id: 2, count: 1}  // DIRT
    ]
  }
};

let selectedRecipe = null;
let craftingResult = null;

/**
 * Check if player has enough resources to craft a recipe
 * @param {string} recipeKey - The key of the recipe to check
 * @returns {boolean} True if player can craft the recipe
 */
function canCraftRecipe(recipeKey) {
  if (!inventory || !craftingRecipes[recipeKey]) return false;

  const recipe = craftingRecipes[recipeKey];
  for (const ing of recipe.ingredients) {
    const playerCount = inventory.countItem(ing.id);
    if (playerCount < ing.count) {
      return false;
    }
  }
  return true;
}

/**
 * Craft the selected recipe if possible
 */
function craftItem() {
  if (!selectedRecipe || !inventory || !canCraftRecipe(selectedRecipe)) return;

  const recipe = craftingRecipes[selectedRecipe];

  // Consume ingredients
  for (const ing of recipe.ingredients) {
    inventory.removeItem(ing.id, ing.count);
  }

  // Give result
  inventory.add(recipe.result.id, recipe.result.count);

  // Show success message
  showNotification(`Fabriqué : ${getRecipeName(selectedRecipe)} x${recipe.result.count}`);

  // Reset selection
  selectedRecipe = null;
  craftingResult = null;

  // Update UI
  updateCraftingUI();
  updateHUD(); // Update hotbar/inventory display
}

/**
 * Get the display name for a recipe
 * @param {string} recipeKey - The key of the recipe
 * @returns {string} Human-readable name
 */
function getRecipeName(recipeKey) {
  const names = {
    'wooden_pickaxe': 'Pioche en bois',
    'stone_pickaxe': 'Pioche en pierre',
    'wooden_sword': 'Épée en bois'
  };
  return names[recipeKey] || recipeKey;
}

const placeholderColors = {
  [0]: 0xffffff, // AIR (white)
  [1]: 0x6ad36a, // GRASS
  [2]: 0x8b4513, // DIRT
  [3]: 0x808080, // STONE
  [4]: 0x8b4513, // OAK_LOG
  [5]: 0x228b22, // OAK_LEAVES
  [6]: 0x1e90ff, // WATER
  [7]: 0xf4a460, // SAND
  [8]: 0x4b4b4b, // COAL (dark gray)
  [9]: 0xa0a0a0, // IRON (light gray)
  [10]: 0xb9f2ff, // DIAMOND (light blue)
  [11]: 0x2f4f4f, // BEDROCK
  [12]: 0x228b22, // SAPLING
  [13]: 0xffd700  // WHEAT
};

/**
 * Load all block textures and pack them into a texture atlas.
 * Returns a promise that resolves when all textures are processed.
 */
async function loadBlockTextures() {
  const loadTexture = (url) => {
    return new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err)
      );
    });
  };

  const textureMap = {
    // blockId: [top, side, side2] (side2 may be same as side)
    [1]:   ['grass_top.png', 'grass_side.png', 'grass_side.png'],
    [2]:   ['dirt.png', 'dirt.png', 'dirt.png'],
    [3]:   ['stone.png', 'stone.png', 'stone.png'],
    [4]:   ['sand.png', 'sand.png', 'sand.png'],
    [5]:   ['oak_log_top.png', 'oak_log.png', 'oak_log.png'],
    [6]:   ['oak_leaves.png', 'oak_leaves.png', 'oak_leaves.png'],
    [7]:   ['water.png', 'water.png', 'water.png'],
    [8]:   ['coal.png', 'coal.png', 'coal.png'],
    [9]:   ['iron.png', 'iron.png', 'iron.png'],
    [10]:  ['diamond.png', 'diamond.png', 'diamond.png'],
    [11]:  ['bedrock.png', 'bedrock.png', 'bedrock.png'],
    [12]:  ['wood_planks.png', 'wood_planks.png', 'wood_planks.png'],
    [13]:  ['glass.png', 'glass.png', 'glass.png'],
    [24]:  ['snow.png', 'snow.png', 'snow.png'],
    [25]:  ['ice.png', 'ice.png', 'ice.png'],
    [26]:  ['gravel.png', 'gravel.png', 'gravel.png']
  };

  for (const [blockId, [top, side, side2]] of Object.entries(textureMap)) {
    try {
      const topTex   = await loadTexture(`assets/textures/${top}`);
      const sideTex  = await loadTexture(`assets/textures/${side}`);
      const side2Tex = side2 === side ? sideTex : await loadTexture(`assets/textures/${side2}`);

      const topUV    = textureAtlas.add(`${blockId}_top`,   topTex);
      const sideUV   = textureAtlas.add(`${blockId}_side`,  sideTex);
      const side2UV  = textureAtlas.add(`${blockId}_side2`, side2Tex);

      blockTextures[blockId] = { topUV, sideUV, side2UV };
    } catch (e) {
      console.warn(`Failed to load texture set for block ${blockId}:`, e);
      // Create a canvas placeholder texture so the game still runs
      const color = placeholderColors[blockId] ?? 0x808080;
      const size = 8; // 8x8 pixels
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, size, size);
      // Draw a border to make it look like a tile
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const uv = textureAtlas.add(`${blockId}_placeholder`, tex);
      blockTextures[blockId] = { topUV: uv, sideUV: uv, side2UV: uv };
    }
  }
  console.log(`Loaded ${Object.keys(blockTextures).length} block textures into atlas`);
}

/**
 * Create the sun/moon sprite for day/night cycle
 */
function createSunMoonSprite() {
  // Create a circular texture for the sun/moon
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 64;
  canvas.height = 64;
  const center = 32;
  const radius = 28;

  // Draw a circle
  context.beginPath();
  context.arc(center, center, radius, 0, 2 * Math.PI, false);
  context.fillStyle = 'white'; // default, will be changed in update
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
  sunMoonSprite = new THREE.Sprite(material);
  sunMoonSprite.scale.set(4, 4, 1); // Adjust size as needed
  scene.add(sunMoonSprite);
}

/**
 * Update the day/night cycle
 * @param {number} delta - Time delta in seconds
 */
function updateDayNight(delta) {
  // Update time of day
  timeOfDay += delta / dayLength;
  if (timeOfDay >= 1.0) {
    timeOfDay -= 1.0;
  }

  // Calculate the sun/moon altitude and azimuth
  const angle = 2 * Math.PI * timeOfDay; // 0 to 2PI
  const altitudeDeg = -90 * Math.cos(angle); // altitude in degrees
  const altitude = THREE.MathUtils.degToRad(altitudeDeg); // convert to radians
  const azimuth = 2 * Math.PI * timeOfDay; // azimuth in radians (0 at sunrise, PI at noon, 2PI at sunset)

  // Calculate the direction vector for the sun/moon
  // We'll place it at a fixed distance from the world origin
  const distance = 200;
  const x = distance * Math.cos(altitude) * Math.sin(azimuth);
  const y = distance * Math.sin(altitude);
  const z = distance * Math.cos(altitude) * Math.cos(azimuth);

  // Update sun/moon sprite position
  if (sunMoonSprite) {
    sunMoonSprite.position.set(x, y, z);
    // Always face the camera
    sunMoonSprite.lookAt(camera.position);
  }

  // Calculate day/night factor for lighting (0 at midnight, 0.5 at sunrise/sunset, 1 at noon)
  const dayFactor = 0.5 * (1 - Math.cos(2 * Math.PI * timeOfDay)); // 0 to 1, peaking at noon
  const nightFactor = 1 - dayFactor;

  // Day colors
  const daySkyColor = new THREE.Color(0x87ceeb); // Sky blue
  const daySunColor = new THREE.Color(0xffffcc); // Soft yellow
  const dayGroundColor = new THREE.Color(0x4a4a4a); // Dark gray for ground

  // Night colors
  const nightSkyColor = new THREE.Color(0x0b0d1d); // Dark blue/black
  const nightMoonColor = new THREE.Color(0xf0f0f0); // Pale white
  const nightGroundColor = new THREE.Color(0x0a0a0a); // Very dark gray

  // Blend colors
  const skyColor = daySkyColor.clone().lerp(nightSkyColor, nightFactor);
  const sunColor = daySunColor.clone().lerp(nightMoonColor, nightFactor);
  const groundColor = dayGroundColor.clone().lerp(nightGroundColor, nightFactor);

  // Update lights
  if (hemiLight) {
    hemiLight.color.set(skyColor);
    hemiLight.groundColor.set(groundColor);
  }

  if (dirLight) {
    dirLight.color.set(sunColor);
    // Adjust intensity based on time of day (brighter at noon)
    const intensity = 0.5 + 0.5 * dayFactor; // 0.5 at night, 1.0 at day
    dirLight.intensity = intensity;
  }

  // Update fog color to match sky
  if (scene.fog) {
    scene.fog.color.set(skyColor);
  }

  // Update sun/moon sprite color
  if (sunMoonSprite && sunMoonSprite.material) {
    sunMoonSprite.material.color.set(sunColor);
  }
}

/**
 * Initialize the game (Three.js scene, audio, UI events, etc.)
 */
async function init() {
  console.log('Initializing game...');

  // ----- THREE.JS SETUP -----
  scene = new THREE.Scene();

  // Lighting
  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 4, 1.2);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(-3, 10, -5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  dirLight.shadow.camera.left = -10;
  dirLight.shadow.camera.right = 10;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  scene.add(dirLight);

  // Optional fog (matches sky color)
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.0002);

  // Create sun/moon sprite if enabled
  if (showSunMoon) {
    createSunMoonSprite();
  }

  // Create sun/moon sprite if enabled
  if (showSunMoon) {
    createSunMoonSprite();
  }

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 0); // eye level

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  clock = new THREE.Clock();

  // ----- AUDIO INITIALIZATION -----
  try {
    // Load a few short SFX
    await Promise.all([
      audio.loadSound('step_dirty', 'assets/sounds/step_dirt.wav'),
      audio.loadSound('step_grass', 'assets/sounds/step_grass.wav'),
      audio.loadSound('step_sand', 'assets/sounds/step_sand.wav'), // we'll assume this exists or fallback
      audio.loadSound('step_snow', 'assets/sounds/step_snow.wav'), // placeholder
      audio.loadSound('step_ice', 'assets/sounds/step_ice.wav'),   // placeholder
      audio.loadSound('step_gravel', 'assets/sounds/step_gravel.wav'), // placeholder
      audio.loadSound('break_stone', 'assets/sounds/break_stone.wav'),
      audio.loadSound('place_wood', 'assets/sounds/place_wood.wav'),
      audio.loadSound('jump', 'assets/sounds/jump.wav'),
      audio.loadSound('hit', 'assets/sounds/hit.wav')
    ]);

    // Load ambient looping sound
    await audio.loadAmbient('ambient', 'assets/sounds/ambient_forest.wav');
    const ambient = audio.audioElements.get('ambient');
    if (ambient) {
      ambient.volume = 0.2;
      ambient.play().catch(() => {/* user gesture may be required; we'll try again later */});
      window.ambientAudio = ambient;
    }
  } catch (e) {
    console.warn('Some audio files failed to load:', e);
  }

  // ----- TEXTURE LOADING -----
  await loadBlockTextures();

  // ----- UI EVENT LISTENERS -----
  setupEventListeners();

  // Check for saved game
  checkForSave();

  // Start in menu
  showMenu();

  // Start animation loop
  animate();
}

/**
 * Set up all DOM event listeners (buttons, keyboard, mouse, resize, pointer lock).
 */
// Create sun/moon sprite if enabled
if (showSunMoon) {
  createSunMoonSprite();
}

// Menu buttons
ui.btnNew.addEventListener('click', startNewGame);
ui.btnContinue.addEventListener('click', continueGame);
ui.btnSettings.addEventListener('click', showSettings);
ui.btnQuit.addEventListener('click', () => { /* just close or do nothing */ });
ui.btnSettingsBack.addEventListener('click', showMenu);
ui.btnRespawn.addEventListener('click', respawnPlayer);
ui.btnResume.addEventListener('click', resumeGame);
ui.btnPauseSettings.addEventListener('click', () => {
  state = STATE.SETTINGS;
  ui.pauseOverlay.classList.add('hidden');
  ui.settingsPanel.classList.remove('hidden');
});
ui.btnSaveQuit.addEventListener('click', () => {
  saveGame();
  showMenu();
});
ui.btnDelSave.addEventListener('click', () => {
  if (confirm('Supprimer la sauvegarde actuelle ?')) {
    clearSave();
    ui.btnContinue.disabled = true;
  }
});
ui.btnExportSave.addEventListener('click', exportSave);

// Settings controls
ui.volumeSlider.addEventListener('input', (e) => {
  ui.volumeValue.textContent = `${Math.round(e.target.value * 100)}%`;
  // Apply volume to audio system (simple global gain)
  if (window.ambientAudio) window.ambientAudio.volume = e.target.value;
});
ui.sensSlider.addEventListener('input', (e) => {
  ui.sensValue.textContent = e.target.value;
  if (player) player.setSensitivity(parseFloat(e.target.value));
});
ui.viewSlider.addEventListener('input', (e) => {
  ui.viewValue.textContent = e.target.value;
  if (world) world.renderDistance = parseInt(e.target.value);
});
ui.qualitySelect.addEventListener('change', (e) => {
  const quality = e.target.value;
  if (world) {
    switch (quality) {
      case 'low': world.renderDistance = 3; break;
      case 'medium': world.renderDensity = 5; break;
      case 'high': window.world.renderDistance = 8; break;
    }
    ui.viewSlider.value = world.renderDistance;
    ui.viewValue.textContent = world.renderDistance;
  }
});
ui.fpsCheckbox.addEventListener('change', (e) => {
  ui.fpsCounter.style.display = e.target.checked ? 'block' : 'none';
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (state === STATE.PLAYING) {
      pauseGame();
    } else if (state === STATE.PAUSED) {
      resumeGame();
    } else if (state === STATE.INVENTORY) {
      closeInventory();
    } else if (state === STATE.INVENTORY && ui.craftingOverlay && !ui.craftingOverlay.classList.contains('hidden')) {
      closeCrafting();
    }
  } else if (event.code === 'KeyE' && state === STATE.PLAYING) {
    openInventory();
  } else if (event.code === 'KeyC' && state === STATE.PLAYING) {
    openCrafting();
  }
});

// Mouse lock for pointer lock API (FPS controls)
const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (state === STATE.PLAYING) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  const element = document.pointerLockElement || document.mozPointerLockElement;
  if (element === canvas) {
    // Pointer locked -> enable first person controls
    input.enabled = true;
  } else {
    // Pointer unlocked -> disable first person controls
    input.enabled = false;
  }
});

// Initialize input system
input.init(canvas);

// Hide loading overlay initially (will be shown when needed)
ui.loadingOverlay.classList.add('hidden');

// Crafting button events
ui.btnCraft.addEventListener('click', openCrafting);
ui.btnCraftClose.addEventListener('click', closeCrafting);

/**
 * Show the crafting overlay
 */
function openCrafting() {
  if (state !== STATE.PLAYING && state !== STATE.PAUSED) return;
  setState(STATE.INVENTORY); // Reuse inventory state for pause-like behavior
  ui.craftingOverlay.classList.remove('hidden');
  ui.inventoryOverlay.classList.add('hidden'); // Hide inventory if open
  updateCraftingUI();
  document.exitPointerLock();
}

/**
 * Close the crafting overlay
 */
function closeCrafting() {
  setState(STATE.PLAYING);
  ui.craftingOverlay.classList.add('hidden');
  renderer.domElement.requestPointerLock();
}

/**
 * Update the crafting UI based on selected recipe
 */
function updateCraftingUI() {
  // Clear grid
  ui.craftingGrid.innerHTML = '';

  // If no recipe selected, show all recipes as buttons
  if (!selectedRecipe) {
    const recipes = Object.keys(craftingRecipes);
    recipes.forEach(recipeKey => {
      const recipe = craftingRecipes[recipeKey];
      const button = document.createElement('div');
      button.className = 'crafting-recipe-button';

      // Show result item
      const resultImg = document.createElement('img');
      const resultUv = blockTextures[recipe.result.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
      const texSize = 32;
      const canvas = document.createElement('canvas');
      canvas.width = texSize;
      canvas.height = texSize;
      const ctx = canvas.getContext('2d');
      if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
        const imgSrc = textureAtlas.textureObject.image;
        ctx.drawImage(
          imgSrc,
          Math.round(resultUv.u * imgSrc.width),
          Math.round(resultUv.v * imgSrc.height),
          Math.round(resultUv.uw * imgSrc.width),
          Math.round(resultUv.vh * imgSrc.height),
          0, 0, texSize, texSize
        );
      } else {
        const color = placeholderColors[recipe.result.id] ?? 0x808080;
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, texSize, texSize);
      }
      resultImg.src = canvas.toDataURL('image/png');
      resultImg.alt = `Result`;
      button.appendChild(resultImg);

      // Show result count if > 1
      if (recipe.result.count > 1) {
        const countEl = document.createElement('div');
        countEl.className = 'q';
        countEl.textContent = recipe.result.count;
        button.appendChild(countEl);
      }

      button.addEventListener('click', () => {
        selectedRecipe = recipeKey;
        updateCraftingUI();
      });

      // Show ingredients needed
      recipe.ingredients.forEach(ing => {
        const ingImg = document.createElement('img');
        const ingUv = blockTextures[ing.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
        const ingCanvas = document.createElement('canvas');
        ingCanvas.width = texSize;
        ingCanvas.height = texSize;
        const ingCtx = ingCanvas.getContext('2d');
        if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
          const imgSrc = textureAtlas.textureObject.image;
          ingCtx.drawImage(
            imgSrc,
            Math.round(ingUv.u * imgSrc.width),
            Math.round(ingUv.v * imgSrc.height),
            Math.round(ingUv.uw * imgSrc.width),
            Math.round(ingUv.vh * imgSrc.height),
            0, 0, texSize, texSize
          );
        } else {
          const color = placeholderColors[ing.id] ?? 0x808080;
          ingCtx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          ingCtx.fillRect(0, 0, texSize, texSize);
        }
        ingImg.src = ingCanvas.toDataURL('image/png');
        ingImg.alt = `Ingredient`;
        button.appendChild(ingImg);

        // Show ingredient count if > 1
        if (ing.count > 1) {
          const countEl = document.createElement('div');
          countEl.className = 'q';
          countEl.textContent = `x${ing.count}`;
          button.appendChild(countEl);
        }
      });

      ui.craftingGrid.appendChild(button);
    });

    // Show "Select a recipe" message
    const msg = document.createElement('div');
    msg.className = 'crafting-message';
    msg.textContent = 'Select a recipe to craft';
    ui.craftingGrid.appendChild(msg);

    // Hide result slot
    ui.craftingResultSlot.classList.add('hidden');
    ui.craftingRecipeName.textContent = '';
  } else {
    // Show selected recipe details
    const recipe = craftingRecipes[selectedRecipe];

    // Show result
    const resultImg = document.createElement('img');
    const resultUv = blockTextures[recipe.result.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
    const texSize = 64;
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = texSize;
    resultCanvas.height = texSize;
    const resultCtx = resultCanvas.getContext('2d');
    if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
      const imgSrc = textureAtlas.textureObject.image;
      resultCtx.drawImage(
        imgSrc,
        Math.round(resultUv.u * imgSrc.width),
        Math.round(resultUv.v * imgSrc.height),
        Math.round(resultUv.uw * imgSrc.width),
        Math.round(resultUv.vh * imgSrc.height),
        0, 0, texSize, texSize
      );
    } else {
      const color = placeholderColors[recipe.result.id] ?? 0x808080;
      resultCtx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      resultCtx.fillRect(0, 0, texSize, texSize);
    }
    resultImg.src = resultCanvas.toDataURL('image/png');
    resultImg.alt = `Result`;
    ui.craftingResultSlot.appendChild(resultImg);

    // Show result count
    if (recipe.result.count > 1) {
      const countEl = document.createElement('div');
      countEl.className = 'q';
      countEl.textContent = `x${recipe.result.count}`;
      ui.craftingResultSlot.appendChild(countEl);
    }

    ui.craftingResultSlot.classList.remove('hidden');
    ui.craftingRecipeName.textContent = getRecipeName(selectedRecipe);

    // Show ingredients needed in 3x3 grid
    ui.craftingGrid.innerHTML = '';
    const slots = 9;
    for (let i = 0; i < slots; i++) {
      const slot = document.createElement('div');
      slot.className = 'crafting-slot';

      // Check if this slot should have an ingredient (simple placement for now)
      // In a real game, we'd have a proper 3x3 grid mapping
      if (i < recipe.ingredients.length) {
        const ing = recipe.ingredients[i];
        const ingImg = document.createElement('img');
        const ingUv = blockTextures[ing.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
        const ingCanvas = document.createElement('canvas');
        ingCanvas.width = texSize;
        ingCanvas.height = texSize;
        const ingCtx = ingCanvas.getContext('2d');
        if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
          const imgSrc = textureAtlas.textureObject.image;
          ingCtx.drawImage(
            imgSrc,
            Math.round(ingUv.u * imgSrc.width),
            Math.round(ingUv.v * imgSrc.height),
            Math.round(ingUv.uw * imgSrc.width),
            Math.round(ingUv.vh * imgSrc.height),
            0, 0, texSize, texSize
          );
        } else {
          const color = placeholderColors[ing.id] ?? 0x808080;
          ingCtx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          ingCtx.fillRect(0, 0, texSize, texSize);
        }
        ingImg.src = ingCanvas.toDataURL('image/png');
        ingImg.alt = `Ingredient`;
        slot.appendChild(ingImg);

        // Show ingredient count if > 1
        if (ing.count > 1) {
          const countEl = document.createElement('div');
          countEl.className = 'q';
          countEl.textContent = `x${ing.count}`;
          slot.appendChild(countEl);
        }
      }

      ui.craftingGrid.appendChild(slot);
    }

    // Check if we can craft
    const canCraft = canCraftRecipe(selectedRecipe);
    ui.btnCraft.disabled = !canCraft;
    ui.btnCraft.style.opacity = canCraft ? '1' : '0.5';
  }
}

/**
 * Show the main menu and hide all other overlays.
 */
function showMenu() {
  setState(STATE.MENU);
  ui.mainMenu.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  hideAllOverlaysExcept(ui.mainMenu);
}

/**
 * Show settings panel.
 */
function showSettings() {
  setState(STATE.SETTINGS);
  ui.settingsPanel.classList.remove('hidden');
  ui.mainMenu.classList.add('hidden');

  // Sync UI with current world settings
  if (world) {
    ui.viewSlider.value = world.renderDistance;
    ui.viewValue.textContent = world.renderDistance;
  }
  // Default values (could be loaded from persistent settings)
  ui.volumeSlider.value = 0.5;
  ui.volumeValue.textContent = '50%';
  ui.sensSlider.value = 0.2;
  ui.sensValue.textContent = '0.20';
  ui.qualitySelect.value = 'medium';
  ui.fpsCheckbox.checked = true;
}

/**
 * Start a new game (generate new world, player, inventory).
 */
function startNewGame() {
  // Generate a new seed
  seed = Date.now() + Math.floor(Math.random() * 10000);

  showLoading('Génération du monde...');
  // Delay to let the loading screen be visible
  setTimeout(() => {
    initWorldAndPlayer(seed);
    hideLoading();
    startPlaying();
  }, 800);
}

/**
 * Continue a saved game.
 */
function continueGame() {
  if (!saveData) {
    showMenu();
    return;
  }
  showLoading('Chargement de la sauvegarde...');
  setTimeout(() => {
    loadWorldAndPlayer(saveData);
    hideLoading();
    startPlaying();
  }, 800);
}

/**
 * Enter the playing state (hide menus, show HUD, lock pointer).
 */
function startPlaying() {
  setState(STATE.PLAYING);
  ui.mainMenu.classList.add('hidden');
  ui.hud.classList.remove('hidden');

  // Lock pointer for FPS controls
  renderer.domElement.requestPointerLock();
}

/**
 * Pause the game.
 */
function pauseGame() {
  if (state !== STATE.PLAYING) return;
  setState(STATE.PAUSED);
  ui.pauseOverlay.classList.remove('hidden');
  document.exitPointerLock();
}

/**
 * Resume from pause.
 */
function resumeGame() {
  if (state !== STATE.PAUSED) return;
  setState(STATE.PLAYING);
  ui.pauseOverlay.classList.add('hidden');
  renderer.domElement.requestPointerLock();
}

/**
 * Open the inventory screen.
 */
function openInventory() {
  if (state !== STATE.PLAYING && state !== STATE.PAUSED) return;
  setState(STATE.INVENTORY);
  ui.inventoryOverlay.classList.remove('hidden');
  updateInventoryDisplay();
  document.exitPointerLock();
}

/**
 * Close the inventory screen.
 */
function closeInventory() {
  if (state !== STATE.INVENTORY) return;
  setState(STATE.PLAYING);
  ui.inventoryOverlay.classList.add('hidden');
  renderer.domElement.requestPointerLock();
}

/**
 * Show death screen.
 */
function showDeathScreen(reason = 'Vous êtes mort') {
  setState(STATE.DEAD);
  ui.deathScreen.classList.remove('hidden');
  ui.hud.classList.add('hidden');
  const deathReasonEl = document.getElementById('death-reason');
  if (deathReasonEl) {
    deathReasonEl.textContent = reason;
  }
  document.exitPointerLock();
  // Clear enemies when player dies
  if (enemyManager) {
    enemyManager.clear();
  }
}

/**
 * Respawn the player after death.
 */
function respawnPlayer() {
  if (state !== STATE.DEAD) return;

  // Respawn at world spawn (0, ~WORLD_H-8, 0) or load from spawn point
  const spawnY = WORLD_H - 8; // Spawn near top of world
  player.setPositionFromSave({ x: 0, y: spawnY, z: 0, yaw: 0, pitch: 0 });
  player.health = player.maxHealth;
  player.hunger = player.maxHunger;
  player.dead = false;

  startPlaying();
  ui.deathScreen.classList.add('hidden');
}

/**
 * Save the current game to localStorage.
 */
function saveGame() {
  if (!world || !player) return;

  const saveData = {
    seed: world.seed,
    player: player.getSaveState(),
    inventory: inventory.serialize(),
    worldChanges: Arraui.from(world.blockChanges.entries()) // Convert Map to array for storage
  };

  localStorage.setItem('pixelcraftSave', JSON.stringify(saveData));
  showNotification('Partie sauvegardée !');
}

/**
 * Load a saved game from data object.
 */
function loadWorldAndPlayer(data) {
  // Initialize world with saved seed
  initWorldAndPlayer(data.seed);

  // Load player state
  if (data.player) {
    player.setPositionFromSave(data.player);
    player.health = data.player.hp || 100;
    player.hunger = data.player.hunger || 100;
  }

  // Load inventory
  if (data.inventory) {
    inventory.deserialize(data.inventory);
  }

  // Load world changes (player-placed/removed blocks)
  if (data.worldChanges) {
    world.blockChanges.clear();
    for (const [key, value] of data.worldChanges) {
      world.blockChanges.set(key, value);
    }
  }

  saveData = data;
}

/**
 * Clear saved game.
 */
function clearSave() {
  localStorage.removeItem('pixelcraftSave');
  saveData = null;
  ui.btnContinue.disabled = true;
}

/**
 * Export saved game as a downloadable JSON file.
 */
function exportSave() {
  if (!saveData) {
    showNotification('Aucune sauvegarde à exporter');
    return;
  }

  const dataStr = JSON.stringify(saveData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `pixelcraft_save_${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Check for existing saved game and enable Continue button.
 */
function checkForSave() {
  const saved = localStorage.getItem('pixelcraftSave');
  if (saved) {
    try {
      saveData = JSON.parse(saved);
      ui.btnContinue.disabled = false;
    } catch (e) {
      console.error('Failed to parse save data:', e);
      localStorage.removeItem('pixelcraftSave');
      ui.btnContinue.disabled = true;
    }
  } else {
    ui.btnContinue.disabled = true;
  }
}

/**
 * Initialize world and player with a given seed.
 */
function initWorldAndPlayer(seed) {
  console.log('Initializing world and player with seed:', seed);

  // Clean up old world if exists
  if (world) {
    console.log('Disposing old world');
    world.dispose();
    world = null;
  }
  // Clear existing enemies if any
  if (enemyManager) {
    enemyManager.clear();
  }

  try {
    // Create world
    console.log('Creating World instance...');
    world = new World({
      seed: seed,
      renderDistance: 5,
      atlas: {
        texture: textureAtlas.textureObject, // the big atlas image
        uvForTile: (blockId, face) => {
          // face: 0=top,1=bottom,2=north,3=south,4=west,5=east (as used in chunkMesh.js)
          const base = blockTextures[blockId];
          if (!base) return new THREE.Vector4(0, 0, 1, 1); // fallback
          let uv;
          switch (face) {
            case 0: uv = base.topUV;    break;
            case 1: uv = base.topUV;    break; // bottom uses same as top (you can make a separate one)
            case 2:
            case 3:
            case 4:
            case 5: uv = (face % 2 === 0) ? base.sideUV : base.side2UV; break;
            default: uv = base.sideUV;
          }
          return new THREE.Vector4(uv.u, uv.v, uv.uw, uv.vh);
        },
        material: new THREE.MeshStandardMaterial({ // more realistic material
          map: textureAtlas.textureObject,
        }),
        transparentMaterial: new THREE.MeshStandardMaterial({
          map: textureAtlas.textureObject,
          transparent: true,
          opacity: 0.9
        })
      },
      callbacks: {
        onMeshRebuilt: (count:      {
          // console.log(`Rebuilt ${count} chunk meshes`);
        }
      }
    });
  }

  console.log('World created, adding to scene');
  scene.add(world.group);

  // Create player
  console.log('Creating Player instance...');
  player = new Player(camera, world, {
    onJump: () => {
      // Play jump sound
      audio.play('jump', 0.4);
    },
    onDamage: (data) => {
      if (data.amount > 0) {
        showNotification(`-${data.amount} HP`);
      }
      if (player.health <= 0) {
        showDeathScreen('Vous êtes mort de vos blessures');
      }
    },
    onDeath: (data) => {
      showDeathScreen(data.reason || 'Vous êtes mort');
    },
    onBlockBroken: (dropId) => {
      if (dropId !== null && dropId !== undefined) {
        inventory.add(dropId, 1);
        // Optionally play a pickup sound or show a small effect
      }
    }
  });

  // Create inventory
  console.log('Creating Inventory instance...');
  inventory = new Inventory();

  // Give starting items
  console.log('Adding starting items to inventory');
  inventory.add(1, 5);   // GRASS
  inventory.add(2, 10);  // DIRT
  inventory.add(9, 5);   // WOOD_PLANKS

  console.log('World and player initialized successfully', {
    world: !!world,
    player: !!player,
    inventory: !!inventory
  });

  // Create enemy manager
  enemyManager = new EnemyManager(scene, player, world, 4);
  // Optional expose for debugging
  window.enemyManager = enemyManager;
} catch (error) {
  console.error('Failed to initialize world:', error);

  // Show error in UI
  showNotification('Erreur d\'initialisation du monde: ' + error.message);

  // Add a test cube so we can see if rendering works at all
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  cube.position.set(0, 1, 0);

  // Still create minimal player/camera controls so UI works
  player = new Player(camera, {
    getBlockAt: () => 0, // AIR
    setBlockAt: () => {},
    reboundChunk: () => {},
    group: new THREE.Group()
  }, {});
  inventory = new Inventory();

  // Ensure enemy manager exists even if world init fails (will be empty)
  if (!enemyManager) {
    enemyManager = new EnemyManager(scene, player || new Player(camera, {
      getBlockAt: () => 0,
      setBlockAt: () => {},
      rebuildChunk: () => {},
      group: new THREE.Group()
    }, {}), world || new World({seed:0, renderDistance:1, atlas:{texture:null, uvForTile:()=>new THREE.Vector4(0,0,1,1), material:new THREE.MeshStandardMaterial(), transparentMaterial:new THREE.MeshStandardMaterial({transparent:true,opacity:0.9)}}, callbacks:{onMeshRebuilt:()=>{}}}, 0));
    window.enemyManager = enemyManager;
  }
}

/**
 * Show loading overlay with optional text.
 */
function showLoading(text) {
  setState(STATE.LOADING);
  document.getElementById('loading-text').textContent = text || 'Chargement...';
  document.getElementById('loading-fill').style.width = '0%';

  // Simulate loading progress
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 30;
    if (progress > 100) {
      progress = 100;
      clearInterval(interval);
    }
    document.getElementById('loading-fill').style.width = `${progress}%`;
  }, 50);

  ui.loadingOverlay.classList.remove('hidden');
}

/**
 * Hide loading overlaui.
 */
function hideLoading() {
  ui.loadingOverlay.classList.add('hidden');
}

/**
 * Show a toast notification.
 */
function showNotification(message) {
  // Create toast element if not exists
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.position = 'fixed';
    toast.style.top = '16px';
    toast.style.right = '16px';
    toast.style.background = 'rgba(0,0,0,0.7)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 16px';
    toast.style.borderRadius = '4px';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    toast.style.transition = 'opacity 0.2s ease';
    toast.style.zIndex = '1000';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

/**
 * Set the current game state and update input handling.
 */
function setState(newState) {
  state = newState;

  // Update input handling based on state
  if (newState === STATE.PLAYING) {
    input.enabled = true;
    // Lock pointer if not already
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  } else {
    input.enabled = false;
    document.exitPointerLock();
  }
}

/**
 * Hide all overlays except the one provided.
 */
function hideAllOverlaysExcept(except) {
  const overlays = [
    ui.mainMenu,
    ui.settingsPanel,
    ui.deathScreen,
    ui.inventoryOverlay,
    ui.pauseOverlay,
    ui.loadingOverlay
  ];

  overlays.forEach(overlay => {
    if (overlay !== except) {
      overlay.classList.add('hidden');
    }
  });
}

/**
 * Update HUD elements (health, hunger, hotbar, etc.).
 */
function updateHUD() {
  if (!player) return;

  // Health bar
  const healthPercent = player.health / player.maxHealth;
  ui.healthFill.style.width = `${healthPercent * 100}%`;
  ui.healthFill.textContent = `${Math.floor(player.health)}/${player.maxHealth}`;

  // Food bar
  const foodPercent = player.hunger / player.maxHunger;
  ui.foodFill.style.width = `${foodPercent * 100}%`;
  ui.foodFill.textContent = `${Math.floor(player.hunger)}/${player.maxHunger}`;

  // Hotbar
  updateHotbar();

  // Update crafting UI if visible
  if (ui.craftingOverlay && !ui.craftingOverlay.classList.contains('hidden')) {
    updateCraftingUI();
  }

  // Crosshair and target info (updated in game loop)
}

/**
 * Update the hotbar UI based on inventory.
 */
function updateHotbar() {
  // Clear hotbar
  ui.hotbar.innerHTML = '';

  // Add 9 slots
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement('div');
    slot.className = 'hot-slot';
    if (i === inventory.selected) {
      slot.classList.add('selected');
    }

    // Add slot index
    const indexEl = document.createElement('div');
    indexEl.className = 'idx';
    indexEl.textContent = i + 1;
    slot.appendChild(indexEl);

    // Add item if exists
    const item = inventory.at(i);
    if (item) {
      const img = document.createElement('img');
      // Use the texture atlas to get the sub‑texture for this block id
      const uv = blockTextures[item.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
      // Create a canvas that shows just that UV region (simple approach)
      const texSize = 64; // pixel size of the icon
      const canvas = document.createElement('canvas');
      canvas.width = texSize;
      canvas.height = texSize;
      const ctx = canvas.getContext('2d');
      // If we have the atlas image, draw the sub‑region
      if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
        const imgSrc = textureAtlas.textureObject.image;
        ctx.drawImage(
          imgSrc,
          Math.round(uv.u * imgSrc.width),
          Math.round(uv.v * imgSrc.height),
          Math.round(uv.uw * imgSrc.width),
          Math.round(uv.vh * imgSrc.height),
          0, 0, texSize, texSize
        );
      } else {
        // fallback: fill with placeholder color
        const color = placeholderColors[item.id] ?? 0x808080;
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ui.fillRect(0, 0, texSize, texSize);
      }
      img.src = canvas.toDataURL('image/png');
      img.alt = `Item ${item.id}`;
      slot.appendChild(img);

      // Add count if > 1
      if (item.count > 1) {
        const countEl = document.createElement('div');
        countEl.className = 'q';
        countEl.textContent = item.count;
        slot.appendChild(countEl);
      }
    }

    ui.hotbar.appendChild(slot);
  }
}

/**
 * Update the inventory grid UI.
 */
function updateInventoryDisplay() {
  const invGrid = document.getElementById('inv-grid');
  if (!invGrid) return;

  // Clear grid
  invGrid.innerHTML = '';

  // Add 27 slots (3 rows of 9)
  for (let i = 0; i < 27; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    // Store index as data attribute for potential click handling
    slot.dataset.index = i;

    // Add item if exists
    const item = inventory.at(i);
    if (item) {
      const img = document.createElement('img');
      const uv = blockTextures[item.id]?.sideUV ?? { u: 0, v: 0, uw: 1, vh: 1 };
      const texSize = 48; // inventory slot size
      const canvas = document.createElement('canvas');
      canvas.width = texSize;
      canvas.height = texSize;
      const ctx = canvas.getContext('2d');
      if (textureAtlas.textureObject && textureAtlas.textureObject.image) {
        const imgSrc = textureAtlas.textureObject.image;
        ctx.drawImage(
          imgSrc,
          Math.round(uv.u * imgSrc.width),
          Math.round(uv.v * imgSrc.height),
          Math.round(uv.uw * imgSrc.width),
          Math.round(uv.vh * imgSrc.height),
          0, 0, texSize, texSize
        );
      } else {
        const color = placeholderColors[item.id] ?? 0x808080;
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, texSize, texSize);
      }
      img.src = canvas.toDataURL('image/png');
      img.alt = `Item ${item.id}`;
      slot.appendChild(img);

      // Add count if > 1
      if (item.count > 1) {
        const countEl = document.createElement('div');
        countEl.className = 'q';
        countEl.textContent = item.count;
        slot.appendChild(countEl);
      }
    }

    invGrid.appendChild(slot);
  }
}

/**
 * Main animation loop.
 */
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update game state
  if (state === STATE.PLAYING) {
    updateGame(delta);
  } else if (state === STATE.PAUSED) {
    // Update pause menu if needed
  } else if (state === STATE.INVENTORY) {
    // Inventory is mostly static
  }

  // Update HUD
  if (state === STATE.PLAYING || state === STATE.PAUSED || state === STATE.INVENTORY) {
    updateHUD();

    // Update FPS counter
    if (!animate.lastFpsTime) animate.lastFpsTime = 0;
    if (!animate.frameCount) animate.frameCount = 0;
    animate.frameCount++;
    const now = performance.now();
    if (now - animate.lastFpsTime >= 1000) {
      const fps = Math.round((animate.frameCount * 1000) / (now - animate.lastFpsTime));
      ui.fpsCounter.textContent = `FPS: ${fps}`;
      animate.frameCount = 0;
      animate.lastFpsTime = now;
    }
  }

  // Render
  renderer.render(scene, camera);
}

/**
 * Game logic update (called each frame when playing).
 */
function updateGame(delta) {
  if (!world || !player) return;

  // Update player
  player.update(delta);

  // Update day/night cycle
  updateDayNight(delta);

  // Update world (chunk loading/unloading)
  world.updateAroundPlayer(player.pos.x, player.pos.z, {
    onProgress: (loaded, total) => {
      // Update loading progress if we're in loading state
      if (state === STATE.LOADING) {
        const percent = (loaded / total) * 100;
        document.getElementById('loading-fill').style.width = `${percent}%`;
      }
    }
  });

  // Process a few chunks from the generation queue each frame
  const chunksToProcess = 4;
  for (let i = 0; i < chunksToProcess && world.pendingCount() > 0; i++) {
    world._processQueueOne();
  }

  // Rebuild meshes for changed chunks
  world.rebuildDirtyMeshes();

  // Handle player actions (breaking/placing blocks)
  handlePlayerActions();

  // Update crosshair and target info
  updateTargetInfo();

  // Footstep sounds (simple timer based)
  updateFootsteps(delta);

  // Update enemies
  if (enemyManager) {
    enemyManager.update(delta);
  }
}

/**
 * Handle player input for block breaking and placing.
 */
function handlePlayerActions() {
  if (!player || !world || !inventory) return;

  // Get mouse clicks from input manager
  const clicks = input.consumeClicks();

  // Process left click (button 0) - break block
  const leftClick = clicks.find(c => c.button === 0 && c.type === 'down');
  if (leftClick && player.target) {
    if (!player.mineTarget) {
      player.startMining();
      // Play hit sound on start of mining (optional)
      audio.play('hit', 0.3);
    }
  } else if (!leftClick) {
    // Only stop mining if there's no active left click
    player.stopMining();
  }

  // Process right click (button 2) - place block
  const rightClick = clicks.find(c => c.button === 2 && c.type === 'down');
  if (rightClick && player.target) {
    const item = inventory.current(); // Currently selected item
    if (item && item.id !== 0) { // 0 is AIR
      const success = player.world.setBlockAt(
        player.target.wx + player.target.normal.x,
        player.target.wy + player.target.normal.y,
        player.target.wz + player.target.normal.z,
        item.id
      );

      if (success) {
        // Remove one item from inventory
        inventory.take(inventory.selected, 1);

        // Play place block sound
        audio.play('place_wood', 0.4);

        // Switch to next item if current stack is empty
        if (inventory.current() === null) {
          // Find next non-empty slot
          for (let i = 1; i <= 9; i++) {
            const idx = (inventory.selected + i) % 9;
            if (inventory.at(idx) !== null) {
              inventory.select(idx);
              break;
            }
          }
          // If all empty, select first slot
          if (inventory.current() === null) {
            inventory.select(0);
          }
        }

        // Show hit effect
        ui.showEffect(player.target);
      }
    }
  }
}

/**
 * Simple footstep sound timer.
 */
function updateFootsteps(delta) {
  if (!player || !world) return;

  // Only play footsteps when moving and on ground
  const move = input.getMove();
  const moving = (move.forward !== 0 || move.right !== 0);
  if (moving && player.onGround) {
    footstepTimer += delty;
    if (footstepTimer >= footstepInterval) {
      footstepTimer = 0;
      // Determine block under player (feet position slightly below)
      const underPos = player.getFootPos().clone().sub(new THREE.Vector3(0, 0.1, 0));
      const blockUnder = world.getBlockAt(Math.floor(underPos.x), Math.floor(underPos.y), Math.floor(underPos.z));
      let stepSound = 'step_dirty'; // default
      switch (blockUnder) {
        case 1: stepSound = 'step_grass'; break;
        case 2: stepSound = 'step_dirty'; break; // dirt
        case 3: stepSound = 'step_dirty'; break; // stone - use dirt sound as fallback
        case 4: stepSound = 'step_sand'; break; // sand
        case 24: stepSound = 'step_snow'; break; // snow
        case 25: stepSound = 'step_ice'; break; // ice
        case 26: stepSound = 'step_gravel'; break; // gravel
        case 7: stepSound = 'step_dirty'; break; // water - no stepping sound, use dirt or silence
        default: stepSound = 'step_dirty';
      }
      // Play footstep sound (low volume)
      audio.play(stepSound, 0.2);
    }
  } else {
    footstepTimer = 0; // reset when not moving or in air
  }
}

/**
 * Update crosshair and target info HUD.
 */
function updateTargetInfo() {
  if (!player || !player.target) {
    ui.targetInfo.classList.add('hidden');
    return;
  }

  const target = player.target;
  const blockName = getBlockName(target.id);

  ui.targetInfo.textContent = `${blockName}`;
  ui.targetInfo.classList.remove('hidden');

  // Position near crosshair
  const rect = renderer.domElement.getBoundingClientRect();
  ui.targetInfo.style.left = `${rect.left + window.innerWidth / 2}px`;
  ui.targetInfo.style.top = `${rect.top + window.innerHeight / 2 - 20}px`;
}

/**
 * Get a friendly name for a block ID.
 */
function getBlockName(blockId) {
  const names = {
    [0]: 'Air',
    [1]: 'Herbe',
    [2]: 'Terre',
    [3]: 'Pierre',
    [4]: 'Sable',
    [5]: 'Bois',
    [6]: 'Feuilles',
    [7]: 'Eau',
    [8]: 'Charbon',
    [9]: 'Fer',
    [10]: 'Diamant',
    [11]: 'Roche mère',
    [12]: 'Planche de bois',
    [13]: 'Verre',
    [24]: 'Neige',
    [25]: 'Glace',
    [26]: 'Gravier'
  };
  return names[blockId] || `Bloc ${blockId}`;
}

/**
 * Show a brief hit effect (flash crosshair red).
 */
function showHitEffect(target) {
  // For now, just flash the crosshair
  const originalColor = ui.crosshair.style.backgroundColor;
  ui.crosshair.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';

  setTimeout(() => {
    ui.crosshair.style.backgroundColor = originalColor;
  }, 100);
}

/**
 * Handle window resize.
 */
function onWindowResize() {
  aera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialise footstep tracking variables
let footstepTimer = 0;
const footstepInterval = 0.35; // seconds between steps

// Initialize the game when the page loads
window.addEventListener('load', () => {
  init().catch(err => {
    console.error('Failed to initialize game:', err);
    ui.showNotification('Erreur d\'initialisation: ' + err.message);

    // Show error on screen
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '20px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.background = 'rgba(255,0,0,0.8)';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '15px';
    errorDiv.style.borderRadius = '5px';
    errorDiv.style.zIndex = '1000';
    errorDiv.style.maxWidth = '80%';
    errorDiv.textContent = `Erreur: ${err.message}\nVoir la console pour plus de détails`;
    document.body.appendChild(errorDiv);
  });
});