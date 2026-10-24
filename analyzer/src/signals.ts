const BUGFIX = /\b(fix(?:e[sd])?|bugs?|hotfix(?:es)?|regressions?)\b/i;

const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)(dist|build|coverage|vendor|\.git)\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb?$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|mp4|webm|wasm|bin|lock)$/i,
];

export function isBugfixMessage(message: string): boolean {
  return BUGFIX.test(message);
}

export function isTestPath(filePath: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|specs?)\//i.test(filePath) || /\.(?:test|spec)\.[^./]+$/i.test(filePath)
  );
}

export function shouldIgnorePath(filePath: string): boolean {
  return IGNORED.some((pattern) => pattern.test(filePath));
}

export function normalizeGitPath(raw: string): string {
  let filePath = raw.trim();
  if (filePath.startsWith('"') && filePath.endsWith('"')) {
    filePath = filePath
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\(.)/g, '$1');
  }
  if (filePath.includes('=>')) {
    const brace = filePath.match(/^(.*)\{.* => (.*)\}(.*)$/);
    if (brace) {
      filePath = `${brace[1]}${brace[2]}${brace[3]}`.replace(/\/{2,}/g, '/').replace(/^\//, '');
    } else {
      const parts = filePath.split(' => ');
      filePath = parts[parts.length - 1]?.trim() ?? filePath;
    }
  }
  return filePath;
}

const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'c#',
  cpp: 'c++',
  cc: 'c++',
  cxx: 'c++',
  c: 'c',
  h: 'c',
  hpp: 'c++',
  php: 'php',
  scala: 'scala',
  vue: 'vue',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  toml: 'toml',
};

export function languageOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return 'text';
  return LANGUAGES[base.slice(dot + 1).toLowerCase()] ?? 'text';
}

export function fileNameOf(filePath: string): string {
  const name = filePath.split('/').pop();
  return name && name.length > 0 ? name : filePath;
}

export function directoryOf(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}
