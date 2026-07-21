/**
 * ShaderLoader — Compile, link, and cache WebGL2 shader programs.
 */

export class ShaderLoader {
  private gl: WebGL2RenderingContext;
  private cache = new Map<string, WebGLProgram>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  private compile(source: string, type: number): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'Unknown error';
      gl.deleteShader(shader);
      const typeName = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
      throw new Error(`[ShaderLoader] ${typeName} compile failed:\n${log}`);
    }
    return shader;
  }

  getProgram(name: string, vertSrc: string, fragSrc: string): WebGLProgram {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const gl = this.gl;
    const vert = this.compile(vertSrc, gl.VERTEX_SHADER);
    const frag = this.compile(fragSrc, gl.FRAGMENT_SHADER);

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    // Shaders can be freed after linking
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'Unknown error';
      gl.deleteProgram(program);
      throw new Error(`[ShaderLoader] Program "${name}" link failed:\n${log}`);
    }

    this.cache.set(name, program);
    return program;
  }

  /** Get a cached uniform location (not cached here — call gl.getUniformLocation directly) */
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(program, name);
  }

  destroy(): void {
    const gl = this.gl;
    for (const program of this.cache.values()) {
      gl.deleteProgram(program);
    }
    this.cache.clear();
  }
}
