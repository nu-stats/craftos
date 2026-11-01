#!/bin/sh
# Build the craftos-desktop and craftos-archive-keyring packages into
# repo/incoming/. The version is date-stamped so every run is an upgrade.
# Needs config/archives/craftos.key.chroot (run scripts/make-key.sh once).
set -e
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"
version="${VERSION:-0.1.$(date +%Y%m%d%H%M)}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for pkg in craftos-desktop craftos-archive-keyring; do
    stage="$tmp/$pkg"
    cp -r "packages/$pkg" "$stage"
    sed -i "s/^Version:.*/Version: $version/" "$stage/DEBIAN/control"
    if [ "$pkg" = craftos-archive-keyring ]; then
        mkdir -p "$stage/usr/share/keyrings"
        gpg --dearmor < config/archives/craftos.key.chroot \
            > "$stage/usr/share/keyrings/craftos-archive-keyring.gpg"
    fi
    chmod 0755 "$stage/DEBIAN"
    dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_${version}_all.deb"
done
