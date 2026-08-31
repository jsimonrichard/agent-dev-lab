#!/bin/bash
#
# Run from an individual package directory (e.g. via a per-package
# "ci:publish" script). `changeset publish` / plain `npm publish` leave
# `workspace:*` ranges untouched, since changesets only rewrites explicit
# workspace ranges (e.g. workspace:^1.2.0), not bare aliases. `bun pm pack`
# resolves workspace:* deps to their real current version when building the
# tarball, so we pack with bun and publish the resulting tarball with npm.

NAME=$(jq -r .name package.json)
VERSION=$(jq -r .version package.json)

set -e

if npm view "${NAME}" versions --json 2>/dev/null | grep -q "\"${VERSION}\""; then
    echo "Package ${NAME}@${VERSION} already published, skipping."
else
    echo "Publishing ${NAME}@${VERSION}..."

    # convert @scope/name → scope-name
    SAFE_NAME=${NAME//@/}
    SAFE_NAME=${SAFE_NAME//\//-}

    TMPDIR=${TMPDIR:-/tmp}
    PKG_FILE="${SAFE_NAME}-${VERSION}.tgz"
    PKG_PATH="${TMPDIR}/${PKG_FILE}"

    # `bun pm pack` resolves workspace:* in dependencies but also tries to
    # resolve devDependencies (which npm install ignores for consumers anyway).
    # Back package.json up and restore it after packing, so this is safe to
    # run outside a fresh CI checkout too (e.g. locally).
    cp package.json package.json.orig
    trap 'mv package.json.orig package.json' EXIT

    jq 'del(.devDependencies)' package.json >package.json.tmp
    mv package.json.tmp package.json

    bun pm pack --filename "${PKG_PATH}"
    npm publish "${PKG_PATH}"
fi
