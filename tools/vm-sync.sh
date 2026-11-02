# Dev only: pull craftos-shell and the dconf defaults from the host into a test VM.
# On the host, serve the repo root on 127.0.0.1:8000 (VirtualBox NAT reaches it
# as 10.0.2.2); in the VM: curl -s 10.0.2.2:8000/tools/vm-sync.sh | sudo sh
set -e
E=/usr/share/gnome-shell/extensions/craftos-shell@craftos
for f in extension.js glass.js stylesheet.css metadata.json; do
  curl -sf -o $E/$f http://10.0.2.2:8000/packages/craftos-desktop/usr/share/gnome-shell/extensions/craftos-shell@craftos/$f
done
curl -sf -o /etc/dconf/db/craftos.d/00-craftos http://10.0.2.2:8000/packages/craftos-desktop/etc/dconf/db/craftos.d/00-craftos
dconf update
echo synced
