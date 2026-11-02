# Dev only: pull craftos-shell and the dconf defaults from the host into a test VM.
# On the host, serve the repo root on 127.0.0.1:8000 (VirtualBox NAT reaches it
# as 10.0.2.2); in the VM: curl -s 10.0.2.2:8000/tools/vm-sync.sh | sudo sh
set -e
P=http://10.0.2.2:8000/packages/craftos-desktop
E=/usr/share/gnome-shell/extensions/craftos-shell@craftos
for f in extension.js glass.js menus.js windows.js prefs.js stylesheet.css metadata.json; do
  curl -sf -o $E/$f $P$E/$f
done
S=/usr/share/glib-2.0/schemas/org.gnome.shell.extensions.craftos-shell.gschema.xml
curl -sf -o $S $P$S && glib-compile-schemas /usr/share/glib-2.0/schemas
A=/usr/share/applications/craftos-frosted-glass.desktop
curl -sf -o $A $P$A
curl -sf -o /etc/dconf/db/craftos.d/00-craftos $P/etc/dconf/db/craftos.d/00-craftos
dconf update
echo synced
