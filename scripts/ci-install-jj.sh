#!/usr/bin/env bash
#
# Install the pinned Linux musl `jj` used by packages/core's
# resolveProjectVersionTag (jj) tests (see version-tag.test.ts).
#
# GitHub's ubuntu-latest image has git but not jj, and Ubuntu apt has no
# package. Official install is a pre-built release binary:
# https://docs.jj-vcs.dev/latest/install-and-setup/
#
# Usage: scripts/ci-install-jj.sh [dest-dir]
# dest-dir defaults to $HOME/.local/bin. When GITHUB_PATH is set (Actions),
# dest-dir is appended so later steps see `jj`.

set -euo pipefail

VERSION="0.45.1"

if [ "$(uname -s)" != "Linux" ]; then
  echo "ci-install-jj.sh only installs the Linux musl release (CI is ubuntu-latest)" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) target=x86_64-unknown-linux-musl ;;
  aarch64 | arm64) target=aarch64-unknown-linux-musl ;;
  *)
    echo "no pinned jj asset for $(uname -m)" >&2
    exit 1
    ;;
esac

dest="${1:-$HOME/.local/bin}"
asset="jj-v${VERSION}-${target}.tar.gz"
url="https://github.com/jj-vcs/jj/releases/download/v${VERSION}/${asset}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$tmp/$asset"
tar -xzf "$tmp/$asset" -C "$tmp"

mapfile -t binaries < <(find "$tmp" -type f -name jj)
if [ "${#binaries[@]}" -ne 1 ]; then
  echo "expected exactly one jj binary in $asset, found ${#binaries[@]}" >&2
  find "$tmp" -type f >&2
  exit 1
fi

mkdir -p "$dest"
install -m 0755 "${binaries[0]}" "$dest/jj"

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$dest" >>"$GITHUB_PATH"
fi

if ! "$dest/jj" --version | grep -F "jj ${VERSION}"; then
  echo "installed jj did not report version ${VERSION}" >&2
  "$dest/jj" --version >&2
  exit 1
fi
