#!/bin/sh
# Package GNOME Shell extensions that Debian 13 does not ship as .debs into
# repo/incoming/, so CraftOS can install and update them with apt. Each is the
# unmodified upstream build from extensions.gnome.org, pinned by version and
# sha256 (bump all three together):
#
#   Desktop Cube (workspace cube), GPL-3.0, Simon Schneegans,
#     https://github.com/Schneegans/Desktop-Cube
#   Compiz Windows Effect (wobbly "jelly" windows), GPL-3.0, hermes83,
#     https://github.com/hermes83/compiz-windows-effect
#
# Run after scripts/fetch-apps.sh and before scripts/build-meta.sh; the
# packages then become Depends of craftos-desktop like the apps.
set -e
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# pkg uuid version version_tag sha256 author homepage description
build() {
    pkg=$1 uuid=$2 ver=$3 tag=$4 sum=$5 author=$6 home=$7 desc=$8
    zip="$tmp/$uuid.zip"
    curl -fsSL "https://extensions.gnome.org/download-extension/$uuid.shell-extension.zip?version_tag=$tag" -o "$zip"
    echo "$sum  $zip" | sha256sum -c - >/dev/null || { echo "$uuid v$ver: checksum mismatch" >&2; exit 1; }

    stage="$tmp/$pkg"
    ext="$stage/usr/share/gnome-shell/extensions/$uuid"
    mkdir -p "$stage/DEBIAN" "$ext" "$stage/usr/share/glib-2.0/schemas" "$stage/usr/share/doc/$pkg"
    unzip -q "$zip" -d "$ext"
    tr -d ' \n' < "$ext/metadata.json" | grep -q '"shell-version":\[[^]]*"48"' \
        || { echo "$uuid v$ver does not support GNOME 48" >&2; exit 1; }
    # System-wide copy of the schema so dconf defaults can see it; the
    # extension itself loads the compiled copy in its own schemas/ folder.
    cp "$ext"/schemas/*.gschema.xml "$stage/usr/share/glib-2.0/schemas/"
    [ -f "$ext/schemas/gschemas.compiled" ] || glib-compile-schemas "$ext/schemas"
    find "$stage" -type d -exec chmod 0755 {} +
    find "$ext" -type f -exec chmod 0644 {} +

    cat > "$stage/usr/share/doc/$pkg/copyright" <<EOF
$desc, by $author and contributors.
$home
Licensed under the GNU General Public License v3.0; see
/usr/share/common-licenses/GPL-3. Repackaged unmodified for CraftOS from
extensions.gnome.org (version $ver).
EOF
    cat > "$stage/DEBIAN/control" <<EOF
Package: $pkg
Version: $ver-1craftos1
Section: gnome
Priority: optional
Architecture: all
Depends: gnome-shell (>= 48), gnome-shell (<< 49)
Maintainer: nu-stats <j.stowell@northeastern.edu>
Homepage: $home
Description: GNOME Shell extension: $desc
 Upstream version $ver, repackaged unmodified for CraftOS (Debian 13 does
 not ship it).
EOF
    dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_$ver-1craftos1_all.deb" >/dev/null
    echo "extension $uuid (v$ver)"
}

build gnome-shell-extension-desktop-cube desktop-cube@schneegans.github.com \
    35 76156 7fc0f255037a6c2c293e4c836cf13f95a68d2b0e8790eed42aeade98aaf5b28e \
    "Simon Schneegans" https://github.com/Schneegans/Desktop-Cube \
    "Desktop Cube (3D workspace cube)"

build gnome-shell-extension-compiz-windows-effect compiz-windows-effect@hermes83.github.com \
    29 67396 744d0f98858dac57bdcff50c399d63a9aea7b1db1c5765a967081cc7802fad0e \
    "hermes83" https://github.com/hermes83/compiz-windows-effect \
    "Compiz Windows Effect (wobbly windows)"
