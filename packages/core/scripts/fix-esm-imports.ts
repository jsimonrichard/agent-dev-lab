import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(packageRoot, "src");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function resolveImport(fromDir: string, spec: string): string {
  const base = path.resolve(fromDir, spec);
  if (existsSync(`${base}.ts`)) {
    return `${spec}.js`;
  }
  if (existsSync(path.join(base, "index.ts"))) {
    return `${spec}/index.js`;
  }
  throw new Error(`Cannot resolve "${spec}" from ${fromDir}`);
}

function fixSpecifiers(content: string, fromDir: string): string {
  return content.replace(
    /(\bfrom\s+|\bexport\s+.*\bfrom\s+)(["'])(\.\.?\/[^"']+)\2/g,
    (full, prefix, quote, spec) => {
      if (spec.endsWith(".js") || spec.endsWith(".json")) {
        return full;
      }
      const fixed = resolveImport(fromDir, spec);
      return `${prefix}${quote}${fixed}${quote}`;
    },
  );
}

async function fixFile(file: string): Promise<boolean> {
  const dir = path.dirname(file);
  const content = await readFile(file, "utf8");
  const next = content
    .split("\n")
    .map((line) => {
      if (!/^\s*(import\s|export\s|\}\s+from\s)/.test(line)) {
        return line;
      }
      return fixSpecifiers(line, dir);
    })
    .join("\n");
  if (next === content) {
    return false;
  }
  await writeFile(file, next);
  return true;
}

const files = await walk(srcRoot);
let changed = 0;
for (const file of files) {
  if (await fixFile(file)) {
    changed += 1;
    console.log(`fixed ${path.relative(packageRoot, file)}`);
  }
}
console.log(`Updated ${changed} file(s).`);
