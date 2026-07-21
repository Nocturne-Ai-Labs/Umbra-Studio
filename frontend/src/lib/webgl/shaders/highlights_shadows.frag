#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_highlights; // -100 to +100
uniform float u_shadows;    // -100 to +100
uniform float u_whites;     // -100 to +100
uniform float u_blacks;     // -100 to +100

in vec2 v_texCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float lum = luminance(color.rgb);

  // Shadow mask: strongest at lum=0, fades to 0 at lum=0.5
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
  // Highlight mask: 0 at lum=0.5, strongest at lum=1
  float highlightMask = smoothstep(0.5, 1.0, lum);
  // Blacks mask: very dark tones only
  float blacksMask = 1.0 - smoothstep(0.0, 0.15, lum);
  // Whites mask: very bright tones only
  float whitesMask = smoothstep(0.85, 1.0, lum);

  float shadowAdj = u_shadows / 100.0;
  float highlightAdj = u_highlights / 100.0;
  float blacksAdj = u_blacks / 100.0;
  float whitesAdj = u_whites / 100.0;

  // Apply adjustments weighted by masks
  vec3 adjusted = color.rgb;
  adjusted += adjusted * shadowAdj * shadowMask * 0.5;
  adjusted += adjusted * highlightAdj * highlightMask * 0.5;
  adjusted += adjusted * blacksAdj * blacksMask * 0.3;
  adjusted += adjusted * whitesAdj * whitesMask * 0.3;

  fragColor = vec4(clamp(adjusted, 0.0, 1.0), color.a);
}
