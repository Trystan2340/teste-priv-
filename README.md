# GARGANTUA — Schwarzschild Black Hole Raytracer

A full-screen interactive WebGL2 black hole, rendered **entirely in a fragment
shader** by integrating Schwarzschild null geodesics per pixel. No meshes, no
textures, no images, no video — every photon path is computed from the metric.

## Run it (any static server, no build step)

```bash
cd gargantua
python3 -m http.server 8080
# open http://localhost:8080
```

or `npx serve .`, `php -S localhost:8080`, etc. All dependencies
(`lib/three.module.js`, `lib/OrbitControls.js`) are local — works offline.

## How it renders

Each pixel shoots a ray that is integrated with a leapfrog scheme on the exact
planar null-orbit equation `u'' + u = (3/2)·rs·u²` (conserved impact parameter
form). The integrator yields, from first principles:

- **Event horizon** — rays crossing `r = rs` terminate in true black
- **Photon ring / critical curve** — rays asymptoting to the photon sphere at
  `r = 1.5 rs` (`bcrit = (3√3/2) rs`), with an optional glow term keyed to the
  minimum approach radius
- **Multi-crossing accretion disk** — the equatorial plane is tested every
  step, so primary, secondary (far-side, bent over/under the shadow) and
  higher-order disk images appear naturally with order-independent alpha
- **Procedural lensed starfield + Milky Way** — hash-grid stars and an
  fbm-structured galactic band sampled in the *deflected* ray direction, so
  the sky is lensed physically
- **Doppler beaming + gravitational redshift** — Keplerian disk velocities
  `β = √(rs/2r)`, full `δ = 1/(γ(1−β·n))` beaming with tunable exponent, and
  `√(1−rs/r)` redshift, applied to both intensity and color temperature
- **Animated turbulence** — co-rotating fbm density in the disk frame

Post chain (HDR half-float pipeline): threshold **bloom** (3 separable blur
iterations at half res), manual **ACES** tonemap, **vignette**, animated
**film grain** (kept out of the blacks), subtle radial **chromatic
aberration**.

## Controls

| Key | Action |
|---|---|
| drag / wheel | OrbitControls (orbit / zoom) |
| `0`–`9` | Debug views: beauty, min-radius, step cost, disk crossings, shift map, impact parameter, photon-ring mask, background only, disk only, critical curve |
| `Shift+1..4` | Presets: GARGANTUA · SGR A* · QUASAR · PHOTON LAB |
| `Space` | pause disk turbulence/time |
| `C` | cinematic camera path (Catmull-Rom sweep) |
| `O` | toggle OrbitControls |
| `H` / `G` | toggle telemetry HUD / control panel |
| `A` | synchronized audio drone (WebAudio, distance-reactive) |
| `Q` | cycle quality LOW / MEDIUM / HIGH |
| `R` | reset camera · `F` fullscreen |

The panel exposes **21 live parameters** (disk edges/brightness/temperature/
turbulence×2/thickness, Doppler, redshift, beaming exponent, photon glow,
stars, Milky Way ×2, exposure, bloom ×2, grain, vignette, chromatic
aberration, camera distance). Parameters, preset and quality persist in
`localStorage`.

## Quality profiles

| Profile | Steps/px | Render scale | Bloom |
|---|---|---|---|
| LOW | 160 | 0.66× | off |
| MEDIUM | 300 | 1.0× | on |
| HIGH | 440 | up to devicePixelRatio (Retina) | on |

Resizing is fully responsive; the canvas re-allocates HDR targets on the fly.
If the GPU context is lost, an overlay appears and the page recovers
automatically (state survives via persistence).

## Deterministic screenshot mode

`?shot=1` renders a fixed, reproducible frame (used for automated capture):

```
index.html?shot=1&t=6&preset=0&quality=high&az=35&pol=76&dist=11&debug=0
```

`t` freezes simulation time; `az`/`pol`/`dist` place the camera; UI is hidden;
after 8 frames `window.__shotReady` is set and the title becomes `SHOT_READY`.

## Verification results (headless Chromium, SwiftShader)

- ✅ No console errors or unhandled exceptions in any tested configuration
- ✅ No black screens: mean luminance 0.30–0.42 across presets/qualities
- ✅ Deterministic: two identical `?shot=1` runs produce byte-identical PNGs
- ✅ All four presets, debug views 0–9, bloom on/off, three quality profiles
  rendered and inspected — see `shots/`

## Files

```
index.html          entry (importmap → local three.js)
css/main.css        HUD / panel / overlays
js/shaders.js       geodesic integrator + post shaders (GLSL)
js/main.js          renderer, post pipeline, camera, UI, hotkeys, persistence
js/audio.js         WebAudio drone
lib/                three.module.js r160, OrbitControls.js (local)
shots/              verification renders
```
