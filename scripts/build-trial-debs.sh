#!/bin/sh
# Build placeholder "trial" .debs for every app in apps/manifest.tsv that has no
# real .deb in repo/incoming/ yet, so the desktop can be tested with the full
# app lineup (launcher, icon, pinned taskbar entry, stub window).
#
# The version is 0~trial, which sorts below any real release: when an app
# publishes a real .deb, apt upgrades the trial package to it automatically.
# Run after scripts/fetch-apps.sh and before scripts/build-meta.sh.
# Skip with CRAFTOS_TRIAL=0.
set -e
cd "$(dirname "$0")/.."
[ "${CRAFTOS_TRIAL:-1}" = 0 ] && { echo "trial debs disabled"; exit 0; }
out=repo/incoming
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

have=" "
for deb in "$out"/*.deb; do
    [ -e "$deb" ] || continue
    have="$have$(dpkg-deb -f "$deb" Package) "
done

pretty() {
    case "$1" in
        statcraft) echo "StatCraft" ;;       rcraft) echo "RCraft" ;;
        qualcraft) echo "QualCraft" ;;       egocraft) echo "EgoCraft" ;;
        mapcraft) echo "MapCraft" ;;         husky-eye-view) echo "Husky Eye View" ;;
        mergecraft) echo "MergeCraft" ;;     husky-explorer) echo "Husky Explorer" ;;
        heic-converter) echo "HEIC Converter" ;; craft-keys) echo "Craft Keys" ;;
        *) echo "$1" ;;
    esac
}

tail -n +2 apps/manifest.tsv | while IFS="$(printf '\t')" read -r name repo pkg glob notes; do
    [ -n "$name" ] || continue
    case "$have" in *" $pkg "*) continue ;; esac
    title=$(pretty "$name")
    icon=""
    for ext in png svg; do [ -f "trial/icons/$name.$ext" ] && icon="trial/icons/$name.$ext"; done
    stage="$tmp/$pkg"
    mkdir -p "$stage/DEBIAN" "$stage/usr/bin" "$stage/usr/share/applications"

    cat > "$stage/DEBIAN/control" <<EOF
Package: $pkg
Version: 0~trial1
Section: science
Priority: optional
Architecture: all
Depends: zenity, xdg-utils
Maintainer: nu-stats <j.stowell@northeastern.edu>
Homepage: https://github.com/$repo
Description: $title (trial placeholder)
 Placeholder so CraftOS can be tested with the full Craft lineup before $title
 publishes a Linux .deb. Shows a stub window; replaced automatically by the
 real package once it exists.
EOF

    cat > "$stage/usr/bin/$name" <<EOF
#!/bin/sh
if zenity --question --width=440 --title="$title (trial)" --icon-name="$name" \\
    --ok-label="Open project page" --cancel-label="Close" \\
    --text="<b>$title</b>\\n\\nThis is a trial placeholder. The real app has not published a Linux package yet; this entry shows how it will appear in CraftOS (launcher, icon, taskbar)."; then
    xdg-open "https://github.com/$repo"
fi
EOF
    chmod 0755 "$stage/usr/bin/$name"

    cat > "$stage/usr/share/applications/$name.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$title
Comment=$title (trial placeholder)
Exec=/usr/bin/$name
Icon=$name
Terminal=false
Categories=Science;Education;
StartupWMClass=$name
EOF

    if [ -n "$icon" ]; then
        case "$icon" in
            *.svg) d="$stage/usr/share/icons/hicolor/scalable/apps" ;;
            *)     d="$stage/usr/share/icons/hicolor/256x256/apps" ;;
        esac
        mkdir -p "$d"
        cp "$icon" "$d/$name.${icon##*.}"
    fi

    chmod 0755 "$stage/DEBIAN"
    dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_0~trial1_all.deb" >/dev/null
    echo "trial   $name"
done
