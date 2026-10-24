const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  json5: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  conf: "ini",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",
  proto: "protobuf",
  dockerfile: "docker",
  vue: "markup",
  svelte: "markup",
  lua: "lua",
  r: "r",
  dart: "dart",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  scala: "scala",
  clj: "clojure",
  fs: "fsharp",
  fsx: "fsharp",
  vb: "vbnet",
  groovy: "groovy",
  pl: "perl",
  cmake: "cmake",
  makefile: "makefile",
  lock: "text",
};

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  ".env": "ini",
  ".gitignore": "ini",
  ".editorconfig": "ini",
  ".prettierrc": "json",
  ".babelrc": "json",
};

export function getLanguageByPath(path: string): string {
  const filename = path.split("/").pop() ?? "";
  const lower = filename.toLowerCase();

  if (SPECIAL_FILENAMES[lower]) {
    return SPECIAL_FILENAMES[lower];
  }

  const dot = lower.lastIndexOf(".");
  if (dot === -1) {
    return "text";
  }

  const ext = lower.slice(dot + 1);
  return EXTENSION_LANGUAGE_MAP[ext] ?? "text";
}
