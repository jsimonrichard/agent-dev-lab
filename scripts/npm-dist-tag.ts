/**
 * Resolve the npm dist-tag for a package publish.
 *
 * Returns `undefined` when `--tag` should be omitted (npm default: `latest`).
 * Throws when a prerelease would be published under `latest`.
 *
 * Precedence:
 * 1. `NPM_DIST_TAG` / `envTag` override (after the latest-guard)
 * 2. Semver prerelease → first preid segment (`0.0.7-rc.1` → `rc`)
 * 3. Stable version → omit tag
 */
export function resolveNpmDistTag(
  version: string,
  envTag: string | undefined = process.env.NPM_DIST_TAG,
): string | undefined {
  if (!version) {
    throw new Error("resolveNpmDistTag: version is required");
  }

  const prerelease = isSemverPrerelease(version);
  const override = envTag?.trim() || undefined;

  if (override !== undefined) {
    if (override === "latest" && prerelease) {
      throw new Error(
        `Refusing to publish prerelease ${version} with dist-tag latest (set NPM_DIST_TAG=rc or omit for preid inference)`,
      );
    }
    return override;
  }

  if (!prerelease) {
    return undefined;
  }

  const preid = semverPreid(version);
  if (!preid) {
    throw new Error(`resolveNpmDistTag: could not parse preid from ${version}`);
  }
  if (preid === "latest") {
    throw new Error(
      `Refusing to publish prerelease ${version}: preid "latest" would pollute the latest dist-tag`,
    );
  }
  return preid;
}

/** True when the version has a semver prerelease segment (hyphen before optional build). */
export function isSemverPrerelease(version: string): boolean {
  const withoutBuild = version.split("+", 1)[0] ?? version;
  return withoutBuild.includes("-");
}

/** First prerelease identifier (`0.0.7-rc.1` → `rc`; `1.0.0-beta` → `beta`). */
export function semverPreid(version: string): string | undefined {
  const withoutBuild = version.split("+", 1)[0] ?? version;
  const dash = withoutBuild.indexOf("-");
  if (dash < 0) {
    return undefined;
  }
  const pre = withoutBuild.slice(dash + 1);
  if (!pre) {
    return undefined;
  }
  return pre.split(".", 1)[0] || undefined;
}

function main(argv: string[]): void {
  const version = argv[0];
  if (!version) {
    console.error("usage: bun scripts/npm-dist-tag.ts <version>");
    process.exit(2);
  }
  try {
    const tag = resolveNpmDistTag(version, process.env.NPM_DIST_TAG);
    if (tag !== undefined) {
      process.stdout.write(`${tag}\n`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
