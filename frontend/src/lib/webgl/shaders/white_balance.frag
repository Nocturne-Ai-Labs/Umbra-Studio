#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float u_temperature; // -100 to +100 (warm/cool)
uniform float u_tint;        // -100 to +100 (green/magenta)

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Temperature: shift blue-yellow axis
  float tempShift = u_temperature / 100.0 * 0.15;
  color.r += tempShift;
  color.b -= tempShift;

  // Tint: shift green-magenta axis
  float tintShift = u_tint / 100.0 * 0.1;
  color.g += tintShift;

  fragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
