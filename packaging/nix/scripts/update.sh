#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
repo='pingdotgg/t3code'
tag="${RELEASE_TAG:?RELEASE_TAG is required}"
pin="$repo_root/packaging/nix/pin.json"

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

nix_hash="$(nix hash convert --hash-algo sha256 "${asset_digest#sha256:}")"

# version/hash live in pin.json as data, not as text inside flake.nix, so
# there's no Nix-syntax pattern to match here (and nothing to silently miss).
tmp="$(mktemp)"
jq -n --arg version "$version" --arg hash "$nix_hash" '{version: $version, hash: $hash}' >"$tmp"
mv "$tmp" "$pin"

if git -C "$repo_root" diff --quiet -- "$pin"; then
  echo "Nix flake is already up to date."
  exit 0
fi

# Build before handing the diff off, so a bad digest or a broken
# extraInstallCommands assumption fails CI instead of landing in an
# automated PR.
nix build --no-link -L "$repo_root/packaging/nix"
