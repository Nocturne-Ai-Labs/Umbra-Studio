#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform int u_kind;
uniform int u_blendMode;
uniform float u_opacity;

uniform int u_regionMode; // 0 global, 1 linear, 2 radial
uniform vec2 u_regionCenter;
uniform float u_regionRadius;
uniform float u_regionFeather;
uniform float u_regionAngle;
uniform float u_regionOffset;
uniform int u_regionInvert;

uniform float u_param0;
uniform float u_param1;
uniform float u_param2;
uniform float u_param3;
uniform float u_param4;
uniform float u_param5;
uniform float u_param6;
uniform float u_param7;

in vec2 v_texCoord;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 screenBlend(vec3 a, vec3 b) {
  return 1.0 - (1.0 - a) * (1.0 - b);
}

float regionWeight(vec2 uv) {
  float w = 1.0;
  if (u_regionMode == 1) {
    vec2 dir = vec2(cos(u_regionAngle), sin(u_regionAngle));
    float d = dot(uv - u_regionCenter, dir) + u_regionOffset;
    float feather = max(0.001, u_regionFeather);
    w = smoothstep(-feather, feather, d);
  } else if (u_regionMode == 2) {
    float d = distance(uv, u_regionCenter);
    float feather = max(0.0001, u_regionFeather);
    float inner = max(0.0, u_regionRadius * (1.0 - feather));
    float outer = max(inner + 0.0001, u_regionRadius);
    w = 1.0 - smoothstep(inner, outer, d);
  }
  if (u_regionInvert == 1) w = 1.0 - w;
  return clamp(w, 0.0, 1.0);
}

vec3 effectColor(vec2 uv, vec3 base) {
  if (u_kind == 0) {
    // vignette
    float amount = clamp(u_param0, 0.0, 1.5);
    float midpoint = clamp(u_param1, 0.05, 1.0);
    float feather = clamp(u_param2, 0.01, 1.0);
    float roundness = clamp(u_param3, -1.0, 1.0);
    vec2 p = uv - 0.5;
    float sx = mix(1.35, 0.75, roundness * 0.5 + 0.5);
    float sy = mix(0.75, 1.35, roundness * 0.5 + 0.5);
    p *= vec2(sx, sy);
    float d = length(p) * 1.4142;
    float vig = 1.0 - smoothstep(midpoint - feather, midpoint + feather, d) * amount;
    return clamp(base * vig, 0.0, 1.0);
  }

  if (u_kind == 1) {
    // tilt shift
    float blur = clamp(u_param0, 0.0, 2.0);
    float band = clamp(u_param1, 0.02, 0.6);
    float feather = clamp(u_param2, 0.01, 0.8);
    float angle = u_param3;
    vec2 dir = vec2(cos(angle), sin(angle));
    float d = abs(dot(uv - u_regionCenter, dir));
    float mask = smoothstep(band, band + feather, d);
    vec3 acc = vec3(0.0);
    float taps = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 o = vec2(float(x), float(y)) * u_texelSize * (2.0 + blur * 7.0);
        acc += texture(u_texture, uv + o).rgb;
        taps += 1.0;
      }
    }
    vec3 blurred = acc / max(taps, 1.0);
    return mix(base, blurred, mask);
  }

  if (u_kind == 2) {
    // pixelate
    float block = max(1.0, u_param0);
    vec2 grid = block * u_texelSize;
    vec2 q = (floor(uv / grid) + 0.5) * grid;
    return texture(u_texture, q).rgb;
  }

  if (u_kind == 3) {
    // ripple
    float amp = u_param0 * 0.0015;
    float freq = max(0.1, u_param1);
    float phase = u_param2;
    vec2 p = uv - u_regionCenter;
    float d = length(p);
    vec2 dir = d > 1e-4 ? normalize(p) : vec2(0.0, 0.0);
    vec2 rippleUv = uv + dir * sin(d * freq - phase) * amp;
    return texture(u_texture, rippleUv).rgb;
  }

  if (u_kind == 4) {
    // swirl
    float radius = max(0.001, u_param0);
    float angle = u_param1;
    vec2 p = uv - u_regionCenter;
    float d = length(p);
    if (d < radius) {
      float t = (radius - d) / radius;
      float a = angle * t * t;
      float s = sin(a);
      float c = cos(a);
      p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }
    return texture(u_texture, p + u_regionCenter).rgb;
  }

  if (u_kind == 5) {
    // pinch / bulge
    float radius = max(0.001, u_param0);
    float strength = clamp(u_param1, -1.0, 1.0);
    vec2 p = uv - u_regionCenter;
    float d = length(p);
    if (d < radius) {
      float t = d / radius;
      float f = mix(1.0, pow(t, 1.0 + strength * 1.6), abs(strength));
      p *= max(0.0001, f);
    }
    return texture(u_texture, p + u_regionCenter).rgb;
  }

  if (u_kind == 6) {
    // chromatic aberration
    float amt = u_param0 * 0.0015;
    float radialBias = clamp(u_param1, 0.0, 1.0);
    vec2 d = uv - u_regionCenter;
    vec2 dir = length(d) > 1e-4 ? normalize(d) : vec2(1.0, 0.0);
    vec2 offs = mix(vec2(1.0, 0.0), dir, radialBias) * amt;
    float r = texture(u_texture, uv + offs).r;
    float g = texture(u_texture, uv).g;
    float b = texture(u_texture, uv - offs).b;
    return vec3(r, g, b);
  }

  if (u_kind == 7) {
    // film grain
    float intensity = clamp(u_param0, 0.0, 1.0);
    float size = max(0.0001, u_param1);
    float mono = u_param2;
    float t = u_param3;
    vec2 p = floor((uv + t * 0.01) / (u_texelSize * (2.0 * size)));
    float n = hash21(p) - 0.5;
    vec3 n3 = mono > 0.5
      ? vec3(n)
      : vec3(
          hash21(p + vec2(7.3, 1.7)) - 0.5,
          hash21(p + vec2(2.1, 9.2)) - 0.5,
          hash21(p + vec2(4.9, 5.6)) - 0.5
        );
    return clamp(base + n3 * intensity * 0.35, 0.0, 1.0);
  }

  return base;
}

void main() {
  vec4 src = texture(u_texture, v_texCoord);
  vec3 base = src.rgb;
  vec3 fx = effectColor(v_texCoord, base);

  vec3 blended = fx;
  if (u_blendMode == 1) blended = screenBlend(base, fx);
  else if (u_blendMode == 2) blended = base * fx;

  float w = clamp(u_opacity, 0.0, 1.0) * regionWeight(v_texCoord);
  vec3 outColor = mix(base, blended, w);
  fragColor = vec4(clamp(outColor, 0.0, 1.0), src.a);
}
