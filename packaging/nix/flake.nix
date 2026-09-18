{
  description = "T3 Code desktop app, repackaged from the official x86_64 AppImage";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      pname = "t3code";
      version = "0.0.42";

      src = pkgs.fetchurl {
        url = "https://github.com/pingdotgg/t3code/releases/download/v${version}/T3-Code-${version}-x86_64.AppImage";
        hash = "sha256-jcH8zavC7TpZo5RMx3LvEZMbk1FAHAlj7TBdX5bjzfQ=";
      };

      appimageContents = pkgs.appimageTools.extract { inherit pname version src; };

      t3code = pkgs.appimageTools.wrapType2 {
        inherit pname version src;

        extraInstallCommands = ''
          mkdir -p $out/share/applications $out/share/icons/hicolor/256x256/apps

          install -Dm644 /dev/stdin $out/share/applications/${pname}.desktop <<'EOF'
          [Desktop Entry]
          Name=T3 Code
          Comment=Desktop control surface for local coding agents
          Exec=${pname} %U
          TryExec=${pname}
          Terminal=false
          Type=Application
          Icon=${pname}
          StartupWMClass=t3code
          Categories=Development;
          MimeType=x-scheme-handler/t3code;
          EOF

          # Icon lookup only sees sizes registered in hicolor's index.theme.
          for icon in ${appimageContents}/usr/share/icons/hicolor/*/apps/${pname}.png; do
            size_dir="$(basename "$(dirname "$(dirname "$icon")")")"
            install -Dm644 "$icon" \
              "$out/share/icons/hicolor/$size_dir/apps/${pname}.png"
          done
        '';

        meta = with pkgs.lib; {
          description = "Desktop control surface for local coding agents";
          homepage = "https://github.com/pingdotgg/t3code";
          license = licenses.mit;
          platforms = [ "x86_64-linux" ];
          mainProgram = pname;
        };
      };
    in
    {
      packages.${system}.default = t3code;
      apps.${system}.default = {
        type = "app";
        program = "${t3code}/bin/${pname}";
      };
    };
}
