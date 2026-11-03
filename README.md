# CraftOS

A Debian 13 ("trixie") spin (think a Fedora spin, not a new distro) that boots into a
light, macOS-style GNOME desktop with the nu-stats Craft apps preinstalled.

**Frosted Glass**, in the spirit of Pop!_OS COSMIC's, is on by default: app
windows, the top bar and every menu and pop-up are see-through, blurred glass,
and the dock is a lens-like "liquid glass" slab. Open **Frosted Glass** from
the menu to switch each on or off and set frost thickness and glass opacity.
Ctrl+Alt+Up opens the overview; Ctrl+Alt+Left/Right turn the workspace cube.

> **Status: early preview.** CI builds the ISO and it boots in a VM; the
> installer is being tested. Expect rough edges.

## What is in the spin

| Piece | Where |
|---|---|
| live-build settings (Debian 13, hybrid ISO, GRUB + syslinux) | `auto/config` |
| Desktop packages (GNOME, Dash to Panel, Arc, Papirus, Calamares) | `config/package-lists/desktop.list.chroot` |
| Craft suite and toolchain | `config/package-lists/craftos.list.chroot` |
| `craftos-desktop` metapackage (Recommends every Craft app) | `packages/craftos-desktop/` |
| Panel layout, theme, pinned apps | `config/includes.chroot/etc/dconf/` |
| os-release, login, installer and boot branding; dconf compile | `config/hooks/live/0100-branding.hook.chroot` |
| App list and source repos | `apps/manifest.tsv` |
| CI that builds the ISO | `.github/workflows/build-iso.yml` |

## Credits

CraftOS includes **WordCraft, GridCraft, DeckCraft and PdfCraft**, made by the
ArtCraft team ([getartcraft.com](https://getartcraft.com),
[github.com/storytold](https://github.com/storytold)). They are shipped
unmodified from the team's official releases, under their MIT / Apache-2.0
licenses, with their own NOTICE files. The ArtCraft name and logos are
trademarks of the ArtCraft team.

CraftOS is an independent project. It is **not affiliated with, sponsored by
or endorsed by the ArtCraft team**. Please report CraftOS problems
[here](https://github.com/nu-stats/craftos/issues), not to the app authors.

The desktop is built from these open-source projects, used unmodified:

| Project | What it does in CraftOS | License |
|---|---|---|
| [Dash to Panel](https://github.com/home-sweet-gnome/dash-to-panel) | Bottom taskbar | GPL-2.0 |
| [ArcMenu](https://gitlab.com/arcmenu/ArcMenu) | Start menu | GPL-2.0 |
| [Desktop Icons NG](https://gitlab.com/rastersoft/desktop-icons-ng) | Icons on the desktop | GPL-3.0 |
| [Blur My Shell](https://github.com/aunetx/blur-my-shell) | Frosted-glass windows and top bar (the dock and menu glass are CraftOS's own) | GPL-3.0 |
| [Dash to Dock](https://github.com/micheleg/dash-to-dock) | Mac-style dock | GPL-2.0 |
| [Desktop Cube](https://github.com/Schneegans/Desktop-Cube) | 3D workspace cube (packaged by CraftOS, unmodified) | GPL-3.0 |
| [Compiz Windows Effect](https://github.com/hermes83/compiz-windows-effect) | Wobbly ("jelly") windows (packaged by CraftOS, unmodified) | GPL-3.0 |
| [AppIndicator support](https://github.com/ubuntu/gnome-shell-extension-appindicator) | Tray icons | GPL-2.0 |
| [Arc theme](https://github.com/jnsh/arc-theme) | Window and app theme | GPL-3.0 |
| [Papirus icons](https://github.com/PapirusDevelopmentTeam/papirus-icon-theme) | Icon theme | GPL-3.0 |
| [Calamares](https://calamares.io) | Installer | GPL-3.0 |

CraftOS is not affiliated with any of these projects. Its own artwork
(wallpapers, logos, boot and installer art) is original.

CraftOS is built on [Debian](https://www.debian.org) and is not affiliated
with the Debian project.

## Under the hood: the Fedora favourites

The `craftos-system` package (installed with the desktop, updated by apt):

| Feature | How |
|---|---|
| Btrfs by default, zstd compression | The installer defaults to Btrfs with `@`, `@home`, `@cache` and `@log` subvolumes |
| Undo a bad update | snapper takes a snapshot before and after every apt run; **Btrfs Assistant** browses and restores them; GRUB's "snapshots" menu boots an older one (in RAM, like a live USB). Your files in /home are never rolled back |
| Compressed swap in RAM | zram (zstd, half of RAM, at most 8 GB) |
| No freeze-ups when memory runs out | systemd-oomd |
| Firmware updates in Software | fwupd (LVFS) |
| Firewall on | firewalld, "CraftOS" zone: incoming blocked except printer and file-sharing discovery |
| Codecs | GStreamer libav, ugly and bad plugins; ffmpeg |

[grub-btrfs](https://github.com/Antynea/grub-btrfs) (GPL-3.0) is packaged
unmodified by CraftOS, since Debian 13 does not ship it.

## Apps: apt only

All software comes from Debian and the CraftOS apt repo; there is no Flatpak
or Docker in the default install. To add Flathub yourself:

```bash
sudo apt install flatpak gnome-software-plugin-flatpak
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

## Updates: apt repo, then ISO

Installed systems update with `sudo apt full-upgrade`. The ISO is only a
snapshot for new installs and is rebuilt when the repo changes.

```
app release -> publish-repo workflow -> signed apt repo (GitHub Pages)
                                     -> build-iso workflow -> new ISO
```

| Piece | Where |
|---|---|
| reprepro config (trixie, main) | `repo/conf/distributions` |
| Keyring + sources package | `packages/craftos-archive-keyring/` |
| Build/fetch/publish scripts | `scripts/` |
| Repo URL baked into the image and installs | `config/archives/craftos.list.chroot`, `craftos.sources` (assumed `https://nu-stats.github.io/craftos`) |

### One-time setup

1. `sh scripts/make-key.sh` writes the public key to
   `config/archives/craftos.key.chroot` (commit it) and prints the private
   key. Save that as the `GPG_PRIVATE_KEY` secret in GitHub and back it up.
2. Enable GitHub Pages (source: GitHub Actions) for the repo.
3. In each Craft app's release workflow, tell this repo to republish:

   ```yaml
   - run: gh api repos/nu-stats/craftos/dispatches -f event_type=app-release
     env:
       GH_TOKEN: ${{ secrets.CRAFTOS_DISPATCH_TOKEN }}
   ```

## Build locally

On Debian/Ubuntu or WSL2:

```bash
sudo apt install live-build debootstrap dpkg-dev reprepro gnupg gh
make repo   # signed repo in repo/public (needs the signing key in gpg)
make iso    # installs from the hosted repo, so publish it first
```

The ISO lands in the repo root as `craftos-amd64.hybrid.iso`. Test it in QEMU
or VirtualBox before putting it on a USB stick.

`scripts/fetch-apps.sh` downloads each app's latest `*amd64.deb` from its
GitHub release. Apps without a release are skipped, so the repo still
publishes with whichever apps are ready.

## Not done yet

- Craft apps need `.deb` release assets (statcraft is still Phase 0).
- `.desktop` file names in the dconf favourites (`statcraft.desktop`, ...) must
  match what each app's `.deb` installs.
- Installed systems boot with Debian's plain GRUB menu; the CraftOS boot theme
  is only on the ISO.
- Secure Boot and ARM64 builds.
