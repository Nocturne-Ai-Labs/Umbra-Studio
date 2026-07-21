#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_exposure;  // EV stops, -5 to +5
uniform float u_contrast;  // -100 to +100, mapped to multiplier

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Exposure: multiply by 2^EV
  color.rgb *= pow(2.0, u_exposure);

  // Contrast: pivot around mid-gray (0.5)
  float contrastFactor = 1.0 + u_contrast / 100.0;
  color.rgb = (color.rgb - 0.5) * contrastFactor + 0.5;

  color.rgb = clamp(color.rgb, 0.0, 1.0);
  fragColor = color;
}
