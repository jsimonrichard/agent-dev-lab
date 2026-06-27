import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = process.argv[2] ?? path.join(packageRoot, "src");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function stripExtensions(content: string): string {
  return content.replace(
    /(\bfrom\s+|\bexport\s+.*\bfrom\s+)(["'])(\.\.?\/[^"']+)\.js\2/g,
    "$1$2$3$2",
  );
}

const files = await walk(targetRoot);
let changed = 0;
for (const file of files) {
  const content = await readFile(file, "utf8");
  const next = stripExtensions(content);
  if (next !== content) {
    await writeFile(file, next);
    changed += 1;
    console.log(`stripped ${path.relative(packageRoot, file)}`);
  }
}
console.log(`Updated ${changed} file(s).`);
