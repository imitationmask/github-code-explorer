/**
 * 代码文件过滤与采样（纯函数，无 React 依赖）。
 *
 * 四层过滤策略：
 *   1. 噪声目录黑名单（任意路径段命中即剔除）
 *   2. 锁文件 / 系统噪声文件黑名单（精确 basename 命中即剔除）
 *   3. 二进制 / 资源后缀黑名单（扩展名命中即剔除）
 *   4. 代码白名单 + 声明文件白名单（扩展名 / 精确文件名 / 命名模式命中即保留）
 *
 * 超过 MAX_FILES 时采用「深度分层 + 层内等距抽样」，保证浅层与深层、各子目录都有代表性文件。
 */

export const MAX_FILES = 800;

/* ------------------------- 1. 噪声目录黑名单 ------------------------- */

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  ".git",
  ".svn",
  ".hg",
  ".next",
  ".nuxt",
  ".output",
  ".vercel",
  ".serverless",
  ".svelte-kit",
  ".angular",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".dart_tool",
  ".expo",
  ".expo-shared",
  ".idea",
  ".vscode",
  ".vs",
  ".gradle",
  ".terraform",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "vendor",
  "bin",
  "obj",
  "Pods",
  "DerivedData",
  "site-packages",
  "egg-info",
  "bower_components",
]);

/* ------------------- 2. 锁文件 / 系统噪声文件黑名单 ------------------- */

export const LOCK_FILENAMES: ReadonlySet<string> = new Set([
  "yarn.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "bun.lockb",
  "bun.lock",
  "npm-shrinkwrap.json",
  "go.sum",
  "cargo.lock",
  "poetry.lock",
  "pipfile.lock",
  "gemfile.lock",
  "composer.lock",
  "mix.lock",
  "gradle.lockfile",
  "podfile.lock",
  "flake.lock",
  "package.resolved",
  ".ds_store",
  "thumbs.db",
]);

/* ----------------- 3. 二进制 / 资源 / 噪声后缀黑名单 ----------------- */

export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // 图片
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp",
  "tiff", "tif", "psd", "ai", "eps", "heic",
  // 文档
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
  // 压缩包
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst",
  // 可执行 / 二进制
  "exe", "dll", "so", "dylib", "a", "o", "class", "jar", "war", "ear",
  "apk", "aab", "ipa", "wasm", "bin", "obj", "lib", "pdb", "pyc", "pyo",
  // 字体
  "ttf", "otf", "woff", "woff2", "eot",
  // 音视频
  "mp3", "mp4", "webm", "mov", "avi", "mkv", "wav", "flac", "ogg", "m4a",
  "aac", "mid", "midi",
  // 数据 / 数据库
  "db", "sqlite", "sqlite3", "dat", "sav", "parquet", "feather", "pickle",
  // 构建产物 / 噪声
  "map", "lock", "log", "snap", "snapshot", "bak", "tmp", "temp",
  "swp", "swo", "pid", "seed", "pem", "p12", "key", "keystore",
]);

/** 命中即剔除的后缀片段（不区分大小写）。用于压缩版产物如 `.min.js`、`.min.css`。 */
export const NOISE_SUFFIXES: readonly string[] = [
  ".min.js",
  ".min.mjs",
  ".min.cjs",
  ".min.jsx",
  ".min.ts",
  ".min.css",
  ".bundle.js",
  ".bundle.css",
];

/* --------------------- 4a. 代码扩展名白名单 --------------------- */

export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  // JavaScript / TypeScript
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  // Web 标记 / 样式
  "html", "htm", "vue", "svelte", "astro", "css", "scss", "sass", "less",
  "styl", "pcss",
  // 后端语言
  "py", "pyi", "pyx", "rb", "erb", "go", "rs", "php", "phtml",
  "java", "kt", "kts", "groovy", "scala", "sc", "sbt",
  "c", "h", "cc", "cp", "cpp", "cxx", "hpp", "hh", "hxx", "inl",
  "cs", "fs", "fsx", "vb", "swift", "m", "mm",
  // 脚本
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "awk",
  // 函数式 / 其他
  "lua", "r", "rmd", "dart", "elm", "ex", "exs", "erl", "hrl",
  "hs", "lhs", "clj", "cljs", "cljc", "edn", "pl", "pm", "t",
  "nim", "zig", "cr", "jl", "ml", "mli", "d", "pas", "v", "vsh", "sol", "vy",
  // 数据定义 / DSL
  "sql", "graphql", "gql", "prisma", "proto", "cmake",
]);

/* --------------------- 4b. 声明文件白名单 --------------------- */

/** 精确 basename（不区分大小写）即保留的声明文件。 */
export const DECL_FILENAMES: ReadonlySet<string> = new Set([
  "dockerfile",
  "makefile",
  "rakefile",
  "cmakelists.txt",
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "cargo.toml",
  "go.mod",
  "go.work",
  "gomod",
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties",
  "build.sbt",
  "composer.json",
  "mix.exs",
  "project.clj",
  "deps.edn",
  "rebar.config",
  "stack.yaml",
  "package.swift",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".ruby-version",
  ".tool-versions",
  ".python-version",
]);

/** 命名模式（正则）即保留的声明文件，用于捕获 `*.config.ts`、`tsconfig.*.json` 等变体。 */
export const DECL_PATTERNS: readonly RegExp[] = [
  /^dockerfile(\..+)?$/i,
  /^docker-compose(\..+)?\.(yml|yaml)$/i,
  /^compose(\..+)?\.(yml|yaml)$/i,
  /^tsconfig(\..+)?\.json$/i,
  /^\.eslintrc(\..+)?$/i,
  /^\.prettierrc(\..+)?$/i,
  /\.config\.(js|mjs|cjs|ts|mts|cts)$/i,
  /\.csproj$/i,
  /\.fsproj$/i,
  /\.vbproj$/i,
  /\.sln$/i,
  /^requirements(\..+)?\.txt$/i,
];

/* ----------------------------- 内部工具 ----------------------------- */

function depthOf(path: string): number {
  let depth = 0;
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) === 47) depth++; // '/'
  }
  return depth;
}

/** 深度分层：0-1 / 2-3 / 4-6 / 7+ */
function bucketOf(depth: number): number {
  if (depth <= 1) return 0;
  if (depth <= 3) return 1;
  if (depth <= 6) return 2;
  return 3;
}

/** 层内等距抽样：保留首尾，中间均匀取点。 */
function sampleEquidistant<T>(arr: readonly T[], k: number): T[] {
  if (k <= 0) return [];
  if (k >= arr.length) return arr.slice();
  if (k === 1) return [arr[Math.floor(arr.length / 2)]];
  const result: T[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(arr.length - 1, Math.floor((i * (arr.length - 1)) / (k - 1)));
    result.push(arr[idx]);
  }
  return result;
}

function allocateQuotas(sizes: readonly number[], max: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  const quotas = sizes.map((s) =>
    s === 0 ? 0 : Math.min(s, Math.max(1, Math.floor((max * s) / total))),
  );

  let used = quotas.reduce((a, b) => a + b, 0);
  let remaining = max - used;

  // 余量回填：每轮给「剩余容量最大」的层 +1，直到配额耗尽或全部饱和。
  while (remaining > 0) {
    let best = -1;
    let bestSpare = -1;
    for (let i = 0; i < quotas.length; i++) {
      const spare = sizes[i] - quotas[i];
      if (spare > 0 && spare > bestSpare) {
        bestSpare = spare;
        best = i;
      }
    }
    if (best === -1) break;
    quotas[best]++;
    remaining--;
  }

  return quotas;
}

/* ------------------------------ 对外接口 ------------------------------ */

export interface CodeFilterResult {
  /** 排序并采样后、长度 ≤ MAX_FILES 的文件路径 */
  files: string[];
  /** 输入总数（过滤前） */
  totalCount: number;
  /** 过滤后的代码文件总数 */
  codeFileCount: number;
  /** 是否发生抽样（codeFileCount > MAX_FILES） */
  sampled: boolean;
}

export function isCodePath(path: string): boolean {
  const segments = path.split("/");
  const basename = segments[segments.length - 1] ?? "";
  const lower = basename.toLowerCase();

  // 1. 噪声目录
  for (const seg of segments) {
    if (IGNORED_DIRS.has(seg)) return false;
  }

  // 2. 锁文件 / 系统噪声文件
  if (LOCK_FILENAMES.has(lower)) return false;

  // 3. 二进制 / 资源后缀
  const dot = lower.lastIndexOf(".");
  if (dot !== -1) {
    const ext = lower.slice(dot + 1);
    if (BINARY_EXTENSIONS.has(ext)) return false;
  }

  // 3b. 压缩版产物后缀
  for (const suffix of NOISE_SUFFIXES) {
    if (lower.endsWith(suffix)) return false;
  }

  // 4a. 声明文件（精确文件名 / 命名模式）
  if (DECL_FILENAMES.has(lower)) return true;
  for (const pattern of DECL_PATTERNS) {
    if (pattern.test(basename)) return true;
  }

  // 4b. 代码扩展名白名单
  if (dot !== -1 && CODE_EXTENSIONS.has(lower.slice(dot + 1))) return true;

  return false;
}

export function filterCodeFiles(paths: readonly string[]): CodeFilterResult {
  const totalCount = paths.length;

  // 归一化 + 去重 + 过滤
  const seen = new Set<string>();
  const codePaths: string[] = [];
  for (const raw of paths) {
    const p = raw.replace(/^\.\//, "").replace(/\/+$/, "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (isCodePath(p)) codePaths.push(p);
  }

  const codeFileCount = codePaths.length;

  // 深度浅优先 + 字典序
  codePaths.sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  if (codeFileCount <= MAX_FILES) {
    return { files: codePaths, totalCount, codeFileCount, sampled: false };
  }

  // 深度分层
  const groups: string[][] = [[], [], [], []];
  for (const p of codePaths) {
    groups[bucketOf(depthOf(p))].push(p);
  }

  const sizes = groups.map((g) => g.length);
  const quotas = allocateQuotas(sizes, MAX_FILES);

  const sampled: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    sampled.push(...sampleEquidistant(groups[i], quotas[i]));
  }

  sampled.sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  return {
    files: sampled.slice(0, MAX_FILES),
    totalCount,
    codeFileCount,
    sampled: true,
  };
}
