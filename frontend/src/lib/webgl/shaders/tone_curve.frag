#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_curveLUT; // 256x1 RGBA texture: R=red curve, G=green, B=blue, A=rgb (master)

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Apply master (RGB) curve first, then per-channel
  // LUT is a 256x1 texture, sample at the pixel's intensity value
  float masterR = texture(u_curveLUT, vec2(color.r, 0.5)).a;
  float masterG = texture(u_curveLUT, vec2(color.g, 0.5)).a;
  float masterB = texture(u_curveLUT, vec2(color.b, 0.5)).a;

  // Per-channel curves
  float r = texture(u_curveLUT, vec2(masterR, 0.5)).r;
  float g = texture(u_curveLUT, vec2(masterG, 0.5)).g;
  float b = texture(u_curveLUT, vec2(masterB, 0.5)).b;

  fragColor = vec4(r, g, b, color.a);
}
