#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_sharpen;    // 0 to 150
uniform float u_clarity;    // -100 to +100
uniform vec2 u_texelSize;   // 1.0 / textureSize

in vec2 v_texCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 center = texture(u_texture, v_texCoord);

  // 3x3 box blur for unsharp mask
  vec3 blur = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      blur += texture(u_texture, v_texCoord + vec2(float(x), float(y)) * u_texelSize).rgb;
    }
  }
  blur /= 9.0;

  vec3 detail = center.rgb - blur;
  float lum = luminance(center.rgb);

  // Sharpen: add detail back (all tones)
  float sharpenAmount = u_sharpen / 100.0;
  vec3 sharpened = center.rgb + detail * sharpenAmount;

  // Clarity: add detail to midtones only
  float midtoneMask = 1.0 - abs(lum - 0.5) * 2.0; // peaks at lum=0.5
  midtoneMask = midtoneMask * midtoneMask; // sharper falloff
  float clarityAmount = u_clarity / 100.0;
  vec3 result = sharpened + detail * clarityAmount * midtoneMask;

  fragColor = vec4(clamp(result, 0.0, 1.0), center.a);
}
