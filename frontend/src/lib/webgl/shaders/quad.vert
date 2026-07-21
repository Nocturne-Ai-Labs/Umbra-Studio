#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Map clip-space [-1,1] to tex-coord [0,1]
  v_texCoord = a_position * 0.5 + 0.5;
}
