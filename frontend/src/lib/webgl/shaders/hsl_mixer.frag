#version 300 es
precision highp float;

uniform sampler2D u_texture;
// Per-hue adjustments: Red, Orange, Yellow, Green, Cyan, Blue
uniform float u_hsl_hue[6];
uniform float u_hsl_sat[6];
uniform float u_hsl_lum[6];

in vec2 v_texCoord;
out vec4 fragColor;

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;

  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

    if (maxC == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 hsl = rgb2hsl(color.rgb);

  // Hue band centers (0-1): Red=0, Orange=1/12, Yellow=1/6, Green=2/6, Cyan=3/6, Blue=4/6
  float hueCenters[6] = float[6](0.0, 1.0/12.0, 1.0/6.0, 2.0/6.0, 3.0/6.0, 4.0/6.0);

  float totalWeight = 0.0;
  float hueAdj = 0.0;
  float satAdj = 0.0;
  float lumAdj = 0.0;

  for (int i = 0; i < 6; i++) {
    // Calculate hue distance with wrapping
    float dist = abs(hsl.x - hueCenters[i]);
    dist = min(dist, 1.0 - dist);

    // Weight: smooth falloff over ~60 degrees (1/6 of hue wheel)
    float weight = 1.0 - smoothstep(0.0, 1.0 / 6.0, dist);

    hueAdj += u_hsl_hue[i] / 360.0 * weight;
    satAdj += u_hsl_sat[i] / 100.0 * weight;
    lumAdj += u_hsl_lum[i] / 100.0 * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0.0) {
    hueAdj /= totalWeight;
    satAdj /= totalWeight;
    lumAdj /= totalWeight;
  }

  hsl.x = fract(hsl.x + hueAdj);
  hsl.y = clamp(hsl.y * (1.0 + satAdj), 0.0, 1.0);
  hsl.z = clamp(hsl.z + lumAdj * 0.5, 0.0, 1.0);

  fragColor = vec4(hsl2rgb(hsl), color.a);
}
