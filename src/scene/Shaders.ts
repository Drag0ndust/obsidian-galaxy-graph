/**
 * Shaders.ts — Custom GLSL for the galaxy visualization.
 *
 * Phase 3 adds:
 *  - aHighlight attribute: 1.0 = normal, >1.0 = flare, <1.0 = dimmed
 *  - Search flare makes a found star burst bright white then settle
 *  - Filtered-out stars dim to near-invisible
 */

// ─────────────────────────────────────────────────────────────────
// STAR POINT SPRITE SHADER
// ─────────────────────────────────────────────────────────────────

export const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPulsePhase;
  attribute vec3 aColor;
  attribute float aHighlight; // 1.0=normal, 0.0=hidden, 2.0+=flare

  uniform float uTime;
  uniform float uSizeMultiplier;

  varying vec3 vColor;
  varying float vGlow;
  varying float vHighlight;

  void main() {
    vColor = aColor;
    vHighlight = aHighlight;

    float pulse = 1.0 + 0.12 * sin(uTime * 1.5 + aPulsePhase);
    vGlow = pulse;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Flare scaling, zoom-aware: at close range the perspective term already
    // makes stars large, so dampen the flare's multiplicative growth so the
    // burst stays proportional instead of filling the screen.
    float zoomDamp = clamp(-mvPosition.z / 80.0, 0.4, 1.0);
    float flareBoost = max(0.0, aHighlight - 1.0) * zoomDamp;
    float highlightScale = mix(0.3, 1.0, clamp(aHighlight, 0.0, 1.0)) * (1.0 + flareBoost);

    float size = aSize * uSizeMultiplier * pulse * highlightScale;
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 0.5, 80.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vGlow;
  varying float vHighlight;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv) * 2.0;

    if (dist > 1.0) discard;

    float coreBrightness = exp(-dist * dist * 8.0);
    float haloBrightness = exp(-dist * dist * 2.0);

    // During flare (highlight > 1), core goes white-hot and expands
    float flareIntensity = max(0.0, vHighlight - 1.0);
    float flareBrightness = exp(-dist * dist * (8.0 - flareIntensity * 4.0));

    vec3 core = vec3(1.0) * (coreBrightness + flareBrightness * flareIntensity);
    vec3 halo = vColor * haloBrightness * 0.8;

    vec3 finalColor = core + halo;

    // Dim factor for filtered-out stars
    float dimFactor = clamp(vHighlight, 0.05, 1.0);
    float alpha = haloBrightness * vGlow * dimFactor;

    // Flare adds extra brightness
    alpha += flareIntensity * flareBrightness * 0.5;

    gl_FragColor = vec4(finalColor * dimFactor + vec3(flareIntensity * flareBrightness * 0.8), alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────
// STAR GLOW HALO SHADER
// ─────────────────────────────────────────────────────────────────

export const glowVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPulsePhase;
  attribute vec3 aColor;
  attribute float aHighlight;

  uniform float uTime;
  uniform float uSizeMultiplier;

  varying vec3 vColor;
  varying float vHighlight;

  void main() {
    vColor = aColor;
    vHighlight = aHighlight;

    float pulse = 1.0 + 0.15 * sin(uTime * 0.8 + aPulsePhase * 0.7);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Same zoom damping as the core star so the halo doesn't balloon at close range.
    float zoomDamp = clamp(-mvPosition.z / 80.0, 0.4, 1.0);
    float flareBoost = max(0.0, aHighlight - 1.0) * zoomDamp;
    float highlightScale = mix(0.2, 1.0, clamp(aHighlight, 0.0, 1.0)) * (1.0 + flareBoost);

    float size = aSize * uSizeMultiplier * pulse * 4.0 * highlightScale;
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 160.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const glowFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vHighlight;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv) * 2.0;

    if (dist > 1.0) discard;

    float glow = exp(-dist * dist * 3.0) * 0.3;

    float dimFactor = clamp(vHighlight, 0.03, 1.0);
    float flareIntensity = max(0.0, vHighlight - 1.0);

    // Flare expands the glow halo dramatically
    glow += flareIntensity * exp(-dist * dist * 1.5) * 0.6;

    gl_FragColor = vec4(vColor * glow * dimFactor + vec3(flareIntensity * glow * 0.4), glow * dimFactor);
  }
`;

// ─────────────────────────────────────────────────────────────────
// ANIMATED LINK LINE SHADER
// ─────────────────────────────────────────────────────────────────

export const linkVertexShader = /* glsl */ `
  attribute float aEdgeProgress;
  attribute vec3 aSourceColor;
  attribute vec3 aTargetColor;
  attribute float aLinkHighlight; // 1.0=normal, 0.0=hidden

  uniform float uTime;

  varying float vProgress;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vLinkHighlight;

  void main() {
    vProgress = aEdgeProgress;
    vLinkHighlight = aLinkHighlight;

    vColor = mix(aSourceColor, aTargetColor, aEdgeProgress);

    // Only the selected star's edges animate; everything else stays steady.
    float blink = step(1.5, aLinkHighlight);
    float wave = sin((aEdgeProgress - uTime * 0.3) * 6.2832 * 2.0) * 0.5 + 0.5;
    vEnergy = mix(0.35, wave * 0.4 + 0.1, blink);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const linkFragmentShader = /* glsl */ `
  varying float vProgress;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vLinkHighlight;

  void main() {
    float endFade = smoothstep(0.0, 0.05, vProgress) * smoothstep(1.0, 0.95, vProgress);

    float alpha = vEnergy * endFade * clamp(vLinkHighlight, 0.02, 1.0);

    // Highlighted links glow brighter
    float extra = max(0.0, vLinkHighlight - 1.0) * 0.5;

    gl_FragColor = vec4(vColor * (vEnergy + extra) * 1.5, alpha);
  }
`;
