#!/bin/sh
# Build the craftos-desktop, craftos-system and craftos-archive-keyring packages into
# repo/incoming/. The version is date-stamped so every run is an upgrade.
# Run scripts/fetch-apps.sh first: craftos-desktop gets a hard Depends on every
# app .deb found in repo/incoming/, so the ISO (which installs with recommends
# off) gets exactly the apps that have a release, and apps without one are
# skipped instead of breaking the build.
# Needs config/archives/craftos.key.chroot (run scripts/make-key.sh once).
set -e
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"
version="${VERSION:-0.1.$(date +%Y%m%d%H%M)}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Package names of the app .debs fetched for this build.
apps=""
for deb in "$out"/*.deb; do
    [ -e "$deb" ] || continue
    pkg=$(dpkg-deb -f "$deb" Package)
    case "$pkg" in craftos-*) continue ;; esac
    apps="$apps, $pkg"
done
echo "bundling apps:${apps:- (none)}"

for pkg in craftos-desktop craftos-system craftos-archive-keyring; do
    stage="$tmp/$pkg"
    cp -r "packages/$pkg" "$stage"
    sed -i "s/^Version:.*/Version: $version/" "$stage/DEBIAN/control"
    if [ "$pkg" = craftos-desktop ]; then
        sed -i "s/^Depends:.*/&$apps/" "$stage/DEBIAN/control"
    fi
    if [ "$pkg" = craftos-archive-keyring ]; then
        mkdir -p "$stage/usr/share/keyrings"
        gpg --dearmor < config/archives/craftos.key.chroot \
            > "$stage/usr/share/keyrings/craftos-archive-keyring.gpg"
    fi
    chmod 0755 "$stage/DEBIAN"
    for s in preinst postinst prerm postrm; do if [ -f "$stage/DEBIAN/$s" ]; then chmod 0755 "$stage/DEBIAN/$s"; fi; done
    dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_${version}_all.deb"
done
