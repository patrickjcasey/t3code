# Nix packaging

This directory is a flake that repackages the official x86_64 AppImage from GitHub Releases for
NixOS/Nix, the same source artifact [`packaging/aur/t3code-bin`](../aur/t3code-bin) uses. Unlike the
AUR, there is no central registry to push to: the package lives in this repo, so "publishing" a new
version just means keeping `flake.nix` current and letting users build from a pinned git ref.

## Using it

```bash
# Run without installing
nix run 'github:pingdotgg/t3code?dir=packaging/nix'

# Or from a local checkout
nix run ./packaging/nix

# Install into a profile
nix profile install ./packaging/nix
```

On NixOS, add the flake as an input and put `packages.x86_64-linux.default` from it into
`environment.systemPackages` or a home-manager `home.packages` list.

The app runs inside the FHS environment `appimageTools.wrapType2` builds around the extracted
AppImage, so no dependency list needs to be maintained by hand the way `t3code-bin`'s `PKGBUILD`
does.

## Updating for a new release

`version` and the AppImage `hash` in `flake.nix` track a specific GitHub release, same as
`pkgver`/`sha256sums` in the AUR `PKGBUILD`.

`.github/workflows/publish-nix.yml` does this automatically: `release.yml` calls it (mirroring
`publish_aur`) for every non-preview release with the new tag, and it runs
`packaging/nix/scripts/update.sh`, which:

1. Reads the AppImage asset's digest straight off the GitHub Releases API (no download needed).
2. Converts it to Nix's SRI hash format and updates `version`/`hash` in `flake.nix`.
3. Runs `nix build` on the result as a sanity check.

It then opens a PR with the diff (`peter-evans/create-pull-request`) rather than pushing directly,
since this repo has no separate packaging registry to isolate the change in the way AUR pushes do.
Nightly and preview tags are left alone; the flake only tracks stable `vX.Y.Z` releases.

To do the same update by hand:

```bash
RELEASE_TAG=vX.Y.Z packaging/nix/scripts/update.sh
```

This requires `gh` (authenticated), `jq`, and `nix` on `PATH`.
