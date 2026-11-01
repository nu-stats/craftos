#!/bin/sh
# Package GNOME Shell extensions that Debian 12 does not ship as .debs into
# repo/incoming/, so CraftOS can install and update them with apt.
#
#   Blur My Shell (frosted-glass panel, overview and menus), GPL-3.0,
#   https://github.com/aunetx/blur-my-shell. v46 is the last release with a
#   prebuilt zip that supports GNOME 43 (Debian 12).
#
# Run after scripts/fetch-apps.sh and before scripts/build-meta.sh; the
# package then becomes a Depends of craftos-desktop like the apps.
set -e
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

tag=v46
uuid=blur-my-shell@aunetx
pkg=gnome-shell-extension-blur-my-shell
version="46-1craftos2"

gh release download "$tag" --repo aunetx/blur-my-shell \
    --pattern "$uuid.shell-extension.zip" --dir "$tmp"

stage="$tmp/stage"
ext="$stage/usr/share/gnome-shell/extensions/$uuid"
mkdir -p "$stage/DEBIAN" "$ext" "$stage/usr/share/glib-2.0/schemas" "$stage/usr/share/doc/$pkg"
unzip -q "$tmp/$uuid.shell-extension.zip" -d "$ext"
grep -q '"43"' "$ext/metadata.json" || { echo "blur-my-shell $tag does not support GNOME 43" >&2; exit 1; }

# System-wide copy of the schema so dconf defaults can see it; the extension
# itself loads the compiled copy in its own schemas/ folder, so keep that.
cp "$ext"/schemas/*.gschema.xml "$stage/usr/share/glib-2.0/schemas/"
[ -f "$ext/schemas/gschemas.compiled" ] || glib-compile-schemas "$ext/schemas"
find "$stage" -type d -exec chmod 0755 {} +
find "$ext" -type f -exec chmod 0644 {} +

cat > "$stage/usr/share/doc/$pkg/copyright" <<EOF
Blur My Shell, by Aurélien Hamy (aunetx) and contributors.
https://github.com/aunetx/blur-my-shell
Licensed under the GNU General Public License v3.0; see
/usr/share/common-licenses/GPL-3. Repackaged unmodified for CraftOS from the
upstream $tag release.
EOF

cat > "$stage/DEBIAN/control" <<EOF
Package: $pkg
Version: $version
Section: gnome
Priority: optional
Architecture: all
Depends: gnome-shell (>= 43), gnome-shell (<< 44)
Maintainer: nu-stats <j.stowell@northeastern.edu>
Homepage: https://github.com/aunetx/blur-my-shell
Description: GNOME Shell extension adding blur (frosted glass) to the shell
 Blurs the top panel, overview, dash and app folders. Upstream $tag release,
 repackaged unmodified for CraftOS (Debian 12 does not ship it).
EOF

dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_${version}_all.deb" >/dev/null
echo "extension $uuid ($tag)"
