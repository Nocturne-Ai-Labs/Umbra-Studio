#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_vibrance;   // -100 to +100
uniform float u_saturation; // -100 to +100

in vec2 v_texCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float lum = luminance(color.rgb);
  vec3 gray = vec3(lum);

  // Saturation: uniform blend toward/away from gray
  float satFactor = 1.0 + u_saturation / 100.0;
  vec3 saturated = mix(gray, color.rgb, satFactor);

  // Vibrance: boost less-saturated colors more
  float maxChannel = max(max(saturated.r, saturated.g), saturated.b);
  float minChannel = min(min(saturated.r, saturated.g), saturated.b);
  float currentSat = (maxChannel - minChannel) / (maxChannel + 0.001);

  // Low-saturation pixels get stronger boost
  float vibFactor = u_vibrance / 100.0 * (1.0 - currentSat);
  vec3 result = mix(vec3(luminance(saturated)), saturated, 1.0 + vibFactor);

  fragColor = vec4(clamp(result, 0.0, 1.0), color.a);
}
