#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
repo='pingdotgg/t3code'
tag="${RELEASE_TAG:?RELEASE_TAG is required}"
flake="$repo_root/packaging/nix/flake.nix"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Release $tag is not a stable release; the Nix flake only tracks stable versions."
  exit 0
fi

version="${tag#v}"
asset_name="T3-Code-${version}-x86_64.AppImage"
release_json="$(gh api "repos/$repo/releases/tags/$tag")"
asset_digest="$(jq -r --arg name "$asset_name" \
  '.assets[] | select(.name == $name) | .digest' <<<"$release_json")"

if [[ ! "$asset_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Release $tag is missing $asset_name or its SHA-256 digest." >&2
  exit 1
fi

hash="$(nix hash convert --hash-algo sha256 "${asset_digest#sha256:}")"

sed -Ei \
  -e "s/^(\s*version = )\"[0-9]+\.[0-9]+\.[0-9]+\";/\1\"$version\";/" \
  -e "s#^(\s*hash = )\"sha256-[A-Za-z0-9+/=]+\";#\1\"$hash\";#" \
  "$flake"

if git -C "$repo_root" diff --quiet -- "$flake"; then
  echo "Nix flake is already up to date."
  exit 0
fi

# Build before handing the diff off, so a stale desktop-entry assumption or a
# bad sed match fails CI instead of landing in an automated PR.
nix build --no-link -L "$repo_root/packaging/nix"
