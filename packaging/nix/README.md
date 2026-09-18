# Nix packaging

This directory is a flake that repackages the official x86_64 AppImage from GitHub Releases for
NixOS/Nix, the same source artifact [`packaging/aur/t3code-bin`](../aur/t3code-bin) uses. It has no
publish step: unlike the AUR, there is no central registry to push to, so users build straight from
this directory (or a pinned git ref of it).

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

`version` and the AppImage `sha256` in `flake.nix` track a specific GitHub release, same as
`pkgver`/`sha256sums` in the AUR `PKGBUILD`. After a new stable tag ships:

```bash
version=X.Y.Z
nix-prefetch-url --type sha256 \
  "https://github.com/pingdotgg/t3code/releases/download/v${version}/T3-Code-${version}-x86_64.AppImage"
```

Update `version` and `sha256` in `flake.nix` to match, then `nix build .` from this directory to
confirm it still evaluates and runs before committing.
