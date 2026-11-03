#!/bin/sh
# Package grub-btrfs, which Debian 13 does not ship, into repo/incoming/: it
# adds the "snapshots" submenu to GRUB so an older Btrfs snapshot can be
# booted. Unmodified upstream release, pinned by version and sha256 (bump
# both together):
#
#   grub-btrfs, GPL-3.0, Antynea and contributors,
#     https://github.com/Antynea/grub-btrfs
#
# Booting a read-only snapshot on Debian also needs craftos-system's
# initramfs overlay (upstream's is for Arch Linux only).
# Run before scripts/build-meta.sh.
set -e
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

ver=4.14
sum=4fe2f8a49b39e3e561fc51bbc5a0f81a7222c1e9ef8672e014e0ba3bedad20c6
pkg=grub-btrfs

curl -fsSL "https://github.com/Antynea/grub-btrfs/archive/refs/tags/v$ver.tar.gz" -o "$tmp/src.tar.gz"
echo "$sum  $tmp/src.tar.gz" | sha256sum -c - >/dev/null || { echo "grub-btrfs v$ver: checksum mismatch" >&2; exit 1; }
tar -xzf "$tmp/src.tar.gz" -C "$tmp"
src="$tmp/grub-btrfs-$ver"

stage="$tmp/stage"
install -Dm755 "$src/41_snapshots-btrfs" "$stage/etc/grub.d/41_snapshots-btrfs"
install -Dm644 "$src/config" "$stage/etc/default/grub-btrfs/config"
install -Dm755 "$src/grub-btrfsd" "$stage/usr/bin/grub-btrfsd"
install -Dm644 "$src/grub-btrfsd.service" "$stage/usr/lib/systemd/system/grub-btrfsd.service"
install -Dm644 "$src/manpages/grub-btrfs.8.man" "$stage/usr/share/man/man8/grub-btrfs.8"
install -Dm644 "$src/manpages/grub-btrfsd.8.man" "$stage/usr/share/man/man8/grub-btrfsd.8"
gzip -9n "$stage/usr/share/man/man8/"*.8
install -Dm644 "$src/README.md" "$stage/usr/share/doc/$pkg/README.md"
cat > "$stage/usr/share/doc/$pkg/copyright" <<EOF
grub-btrfs, by Antynea and contributors.
https://github.com/Antynea/grub-btrfs
Licensed under the GNU General Public License v3.0; see
/usr/share/common-licenses/GPL-3. Repackaged unmodified for CraftOS
(version $ver).
EOF

mkdir -p "$stage/DEBIAN"
cat > "$stage/DEBIAN/conffiles" <<EOF
/etc/grub.d/41_snapshots-btrfs
/etc/default/grub-btrfs/config
EOF
cat > "$stage/DEBIAN/control" <<EOF
Package: $pkg
Version: $ver-1craftos1
Section: admin
Priority: optional
Architecture: all
Depends: grub-common, btrfs-progs, bash, gawk, inotify-tools
Maintainer: nu-stats <j.stowell@northeastern.edu>
Homepage: https://github.com/Antynea/grub-btrfs
Description: GRUB menu entries for booting Btrfs snapshots
 Adds a "snapshots" submenu to GRUB listing snapper (and Timeshift)
 snapshots; grub-btrfsd keeps it current as snapshots come and go.
 Upstream version $ver, repackaged unmodified for CraftOS (Debian 13 does
 not ship it).
EOF
# Refresh the boot menu when installed or removed on a running system.
cat > "$stage/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if [ "$1" = configure ] && [ -e /boot/grub/grub.cfg ] && command -v update-grub >/dev/null; then
    update-grub || true
fi
exit 0
EOF
cat > "$stage/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
if [ "$1" = remove ] && [ -e /boot/grub/grub.cfg ] && command -v update-grub >/dev/null; then
    update-grub || true
fi
exit 0
EOF
chmod 0755 "$stage/DEBIAN/postinst" "$stage/DEBIAN/postrm"
find "$stage" -type d -exec chmod 0755 {} +
dpkg-deb --root-owner-group --build "$stage" "$out/${pkg}_$ver-1craftos1_all.deb" >/dev/null
echo "grub-btrfs $ver"
