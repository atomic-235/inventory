{
  description = "Home inventory PWA";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            git
          ];

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers-chromium}
            export INVENTORY_CHROMIUM=${pkgs.playwright-driver.browsers-chromium}/chromium-1228/chrome-linux64/chrome
            export no_proxy="localhost,127.0.0.1,''${no_proxy}"
            export NO_PROXY="localhost,127.0.0.1,''${NO_PROXY}"
            git config core.hooksPath .githooks
          '';
        };
      });
}