// GARGANTUA — GLSL sources. All scene rendering is done per-pixel in the fragment
// shader by integrating Schwarzschild null geodesics (exact planar orbit equation
// u'' + u = (3/2) rs u^2 expressed in Cartesian leapfrog form).

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SCENE_FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uCamMat;      // columns: right, up, forward
uniform float uFov;         // tan(fov/2)
uniform float uAspect;
uniform int   uSteps;
uniform int   uDebug;       // 0 normal, 1..9 debug views

uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBright;
uniform float uDiskTemp;
uniform float uTurb;
uniform float uTurbSpeed;
uniform float uDiskThick;
uniform float uDoppler;
uniform float uRedshift;
uniform float uBeamExp;
uniform float uStarBright;
uniform float uMWBright;
uniform float uMWTilt;
uniform float uPhotonGlow;
uniform float uShowDisk;   // 0/1 layer toggles used by debug views 7/8
uniform float uShowBG;

const float ESCAPE_R = 60.0;
const float HORIZON  = 1.0;   // Schwarzschild radius, all units in rs
const float PHOTON_R = 1.5;   // photon sphere = 3/2 rs

// ---------------------------------------------------------------- hashes / noise
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash33(i).x;
  float n100 = hash33(i + vec3(1,0,0)).x;
  float n010 = hash33(i + vec3(0,1,0)).x;
  float n110 = hash33(i + vec3(1,1,0)).x;
  float n001 = hash33(i + vec3(0,0,1)).x;
  float n101 = hash33(i + vec3(1,0,1)).x;
  float n011 = hash33(i + vec3(0,1,1)).x;
  float n111 = hash33(i + vec3(1,1,1)).x;
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; }
  return v;
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise3(p); p = p * 2.11 + 9.2; a *= 0.5; }
  return v;
}

// ---------------------------------------------------------------- background sky
vec3 starLayer(vec3 rd, float scale, float thresh) {
  vec3 p = rd * scale;
  vec3 id = floor(p);
  vec3 f  = fract(p);
  vec3 rnd = hash33(id);
  vec3 center = 0.12 + 0.76 * hash33(id + 11.13);
  float d = length(f - center);
  float core = smoothstep(0.22, 0.0, d);
  core *= core;
  float mag  = pow(fract(rnd.y * 91.7), 10.0) * 30.0 + 0.12;
  float tw   = 0.8 + 0.2 * sin(uTime * (0.4 + rnd.z * 2.0) + rnd.x * 6.2831);
  vec3 tint  = mix(vec3(1.0, 0.78, 0.55), vec3(0.62, 0.8, 1.0), fract(rnd.z * 57.3));
  return core * mag * tw * tint * step(thresh, rnd.x);
}

vec3 background(vec3 rd) {
  vec3 col = vec3(0.0);
  // Milky Way band (tilted great circle) with fbm3 structure and dark dust lanes
  vec3 mwN = normalize(vec3(sin(uMWTilt), cos(uMWTilt) * 0.82, 0.4 * cos(uMWTilt * 0.7)));
  float bd = abs(dot(rd, mwN));
  float band = exp(-pow(bd * 2.4, 1.6));
  float wisp = fbm3(rd * 3.2) * 0.7 + fbm3(rd * 8.6) * 0.3;
  float dust = fbm3(rd * 5.1 + 31.4);
  float lanes = smoothstep(0.35, 0.75, dust);
  vec3 mwCol = mix(vec3(0.36, 0.42, 0.62), vec3(0.55, 0.42, 0.30), wisp);
  col += mwCol * band * (0.15 + 1.5 * wisp) * (1.0 - 0.65 * lanes) * uMWBright;
  // star layers, dimmed inside the bright band
  vec3 st = starLayer(rd, 23.0, 0.900)
          + starLayer(rd, 41.0, 0.928) * 0.75
          + starLayer(rd, 79.0, 0.950) * 0.55;
  col += st * uStarBright * (0.55 + 0.45 * band);
  return col;
}

// ---------------------------------------------------------------- disk emission
vec3 applyShiftTint(vec3 c, float s) {
  float l = clamp(log(max(s, 1e-3)), -1.6, 1.6);
  c.r *= exp(-0.85 * l);
  c.b *= exp( 0.95 * l);
  c.g *= exp(-0.08 * l);
  return max(c, 0.0);
}

vec3 diskEmit(vec3 hit, float hr, vec3 rayV, out float shiftOut, out float alphaOut) {
  float r01 = clamp((hr - uDiskInner) / (uDiskOuter - uDiskInner), 0.0, 1.0);

  // Keplerian orbital velocity (units: rs = 1, c = 1): beta = sqrt(rs / 2r)
  vec3 tang = normalize(cross(vec3(0.0, 1.0, 0.0), hit));
  float beta = sqrt(0.5 / hr);
  vec3 n = -normalize(rayV);                       // photon direction toward observer
  float gam = inversesqrt(max(1.0 - beta * beta, 1e-4));
  float dop = 1.0 / (gam * (1.0 - dot(tang * beta, n)));
  dop = mix(1.0, dop, uDoppler);
  float grav = sqrt(max(1.0 - 1.0 / hr, 0.02));    // gravitational redshift sqrt(1 - rs/r)
  grav = mix(1.0, grav, uRedshift);
  float shift = dop * grav;
  shiftOut = shift;

  // temperature palette: hot inner rim -> amber mid -> ember outer edge
  float heat = pow(1.0 - r01, 1.7) * uDiskTemp;
  vec3 cold = vec3(0.62, 0.12, 0.015);
  vec3 mid  = vec3(1.00, 0.62, 0.25);
  vec3 hot  = vec3(0.80, 0.90, 1.20);
  vec3 base = mix(cold, mid, clamp(heat * 1.7, 0.0, 1.0));
  base = mix(base, hot, clamp(heat * heat * 1.5 - 0.12, 0.0, 1.0));

  // animated turbulence in a co-rotating polar frame
  float ang = atan(hit.z, hit.x);
  float om  = inversesqrt(hr * hr * hr) * uTurbSpeed;   // Keplerian angular rate
  vec2 pc = vec2(ang * 2.2 + uTime * om * 2.4, hr * 1.7);
  float tb = fbm(pc + 0.9 * fbm(pc * 1.8 + 4.7));
  float dens = 0.30 + 1.55 * tb;
  dens = mix(1.0, dens, uTurb);

  // radial profile: hot bright inner rim, steep physical falloff outward
  float edgeIn  = smoothstep(0.0, 0.05 + 0.10 * uDiskThick, r01);
  float edgeOut = smoothstep(1.0, 0.55 - 0.25 * uDiskThick, r01);
  float profile = edgeIn * edgeOut * (0.06 + 0.94 * pow(1.0 - r01, 2.3));

  // relativistic beaming, clamped so the approaching side can't blow out
  float sb = clamp(shift, 0.25, 1.8);
  float I = uDiskBright * dens * profile * 0.55;
  I *= pow(sb, uBeamExp);
  alphaOut = clamp(profile * (0.55 + 0.45 * uTurb * tb), 0.0, 0.96);

  vec3 c = base * I;
  c = applyShiftTint(c, mix(1.0, shift, max(uDoppler, uRedshift)));
  return c;
}

// ---------------------------------------------------------------- geodesic trace
float gMinR;
int   gSteps;
int   gCross;
float gShift;
float gB;

vec3 trace(vec3 ro, vec3 rd) {
  vec3 p = ro;
  vec3 v = rd;
  float h2 = dot(cross(p, v), cross(p, v));   // conserved |p x v|^2
  gB = sqrt(h2);
  gMinR = length(p);
  gSteps = 0;
  gCross = 0;
  gShift = 1.0;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;
  bool escaped  = false;
  vec3 pp = p;

  for (int i = 0; i < 512; i++) {
    if (i >= uSteps) break;
    gSteps = i;
    float r = length(p);
    if (r < gMinR) gMinR = r;

    float r5 = r * r * r * r * r;
    vec3 acc = -1.5 * h2 * p / max(r5, 1e-5);   // null geodesic: u'' + u = 3/2 rs u^2
    float dt = clamp(0.10 * (r - 0.85), 0.010, 0.42);

    v += acc * dt;
    pp = p;
    p += v * dt;

    // ---- accretion disk crossing (equatorial plane y = 0), order-independent
    if (pp.y * p.y < 0.0 && trans > 0.012) {
      float ft = pp.y / (pp.y - p.y);
      vec3 hit = mix(pp, p, ft);
      float hr = length(hit.xz);
      if (hr > uDiskInner && hr < uDiskOuter) {
        gCross++;
        float sh, al;
        vec3 em = diskEmit(hit, hr, v, sh, al);
        gShift = sh;
        col += trans * em * uShowDisk;
        trans *= (1.0 - al * uShowDisk);
      }
    }

    float rn = length(p);
    if (rn < HORIZON) { captured = true; break; }
    if (rn > ESCAPE_R) { escaped = true; break; }
  }
  if (!captured && !escaped) escaped = (length(p) > HORIZON * 1.02);

  if (escaped) {
    vec3 bdir = normalize(v);
    col += trans * background(bdir) * uShowBG;
    // photon-ring glow: rays that skimmed the photon sphere
    float ring = exp(-pow((gMinR - PHOTON_R) * 5.0, 2.0));
    float ring2 = exp(-pow((gMinR - PHOTON_R) * 16.0, 2.0));
    col += trans * (vec3(0.65, 0.78, 1.0) * ring * 0.35 + vec3(1.0) * ring2 * 0.55) * uPhotonGlow;
  }
  // captured rays contribute nothing: the event horizon is truly black.
  return col;
}

// ---------------------------------------------------------------- debug palettes
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  return mix(mix(vec3(0.02,0.02,0.10), vec3(0.7,0.1,0.05), smoothstep(0.0,0.55,t)),
             vec3(1.0,0.95,0.6), smoothstep(0.55,1.0,t));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamMat * vec3(ndc.x * uFov * uAspect, ndc.y * uFov, 1.0));
  vec3 col = trace(uCamPos, rd);

  if (uDebug == 1) col = heat(clamp((gMinR - 1.0) / 6.0, 0.0, 1.0));          // min approach radius
  else if (uDebug == 2) col = heat(float(gSteps) / float(max(uSteps,1)));      // integration cost
  else if (uDebug == 3) col = heat(float(gCross) / 4.0);                       // disk crossings
  else if (uDebug == 4) col = vec3(clamp(1.0-gShift,0.0,1.0), 0.12, clamp(gShift-1.0,0.0,1.0)); // shift map
  else if (uDebug == 5) col = vec3(clamp(gB/2.598 - 1.0, 0.0, 1.0) * 0.15,     // impact parameter vs bcrit
                                   clamp(1.0 - abs(gB/2.598 - 1.0) * 6.0, 0.0, 1.0),
                                   clamp(1.0 - gB/2.598, 0.0, 1.0) * 0.6);
  else if (uDebug == 6) col = heat(exp(-pow((gMinR - PHOTON_R) * 5.0, 2.0)));  // photon-ring mask
  else if (uDebug == 9) col = heat(exp(-pow((gB / 2.598076 - 1.0) * 16.0, 2.0))); // critical curve
  // uDebug 7 (background only) and 8 (disk only) are handled via uShowDisk/uShowBG
  gl_FragColor = vec4(col, 1.0);
}
`;

// Debug views 7/8/9 need alternative compositions; handled via uniforms in a
// second variant below to keep the main loop single-pass.
export const SCENE_FRAG_BG_ONLY = SCENE_FRAG; // (kept for API stability)

// ---------------------------------------------------------------- post shaders
export const BRIGHT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThresh;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThresh, uThresh + 0.7, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;   // texel-scaled direction
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  c += (texture2D(tDiffuse, vUv + o1).rgb + texture2D(tDiffuse, vUv - o1).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + o2).rgb + texture2D(tDiffuse, vUv - o2).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2  uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uGrain;
uniform float uVignette;
uniform float uCA;

float chash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x) {  // manual ACES (Narkowicz fit)
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);

  // subtle radial chromatic aberration
  vec2 caOff = d * uCA * r2;
  vec3 scene;
  scene.r = texture2D(tScene, vUv - caOff).r;
  scene.g = texture2D(tScene, vUv).g;
  scene.b = texture2D(tScene, vUv + caOff).b;

  vec3 col = scene + texture2D(tBloom, vUv).rgb * uBloom;
  col *= uExposure;
  col = aces(col);

  // vignette keeps the corners dark without lifting the horizon blacks
  col *= 1.0 - uVignette * smoothstep(0.18, 0.85, r2);

  // animated film grain, kept out of the deep blacks so the horizon stays clean
  float g = chash(vUv * uRes + fract(uTime * 13.7) * 271.0);
  float lum = clamp(dot(col, vec3(0.3333)), 0.0, 1.0);
  col += (g - 0.5) * uGrain * (0.08 + 0.92 * lum);

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;
