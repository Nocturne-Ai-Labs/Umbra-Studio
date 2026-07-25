declare module '*.txt?raw' {
  const content: string;
  export default content;
}

declare module '*.vert?raw' {
  const content: string;
  export default content;
}

declare module '*.frag?raw' {
  const content: string;
  export default content;
}

declare module '*.glsl?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly UMBRA_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
