# CraftOS

A Debian 12 spin (think a Fedora spin, not a new distro) that boots into a
Zorin-style GNOME desktop with the nu-stats Craft apps preinstalled.

> **Status: scaffold.** Nothing here has been built yet. The ISO has not been
> booted. Treat every file as a first draft.

## What is in the spin

| Piece | Where |
|---|---|
| live-build settings (Debian 12, hybrid ISO, GRUB + syslinux) | `auto/config` |
| Desktop packages (GNOME, Dash to Panel, Arc, Papirus, Calamares) | `config/package-lists/desktop.list.chroot` |
| Craft suite and toolchain | `config/package-lists/craftos.list.chroot` |
| `craftos-desktop` metapackage (Recommends every Craft app) | `packages/craftos-desktop/` |
| Panel layout, theme, pinned apps | `config/includes.chroot/etc/dconf/` |
| os-release branding, dconf compile, Flathub | `config/hooks/live/0100-branding.hook.chroot` |
| App list and source repos | `apps/manifest.tsv` |
| CI that builds the ISO | `.github/workflows/build-iso.yml` |

## Updates: apt repo, then ISO

Installed systems update with `sudo apt full-upgrade`. The ISO is only a
snapshot for new installs and is rebuilt when the repo changes.

```
app release -> publish-repo workflow -> signed apt repo (GitHub Pages)
                                     -> build-iso workflow -> new ISO
```

| Piece | Where |
|---|---|
| reprepro config (bookworm, main) | `repo/conf/distributions` |
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
- Name, wallpaper, Plymouth theme and icons are placeholders. Do not reuse
  Zorin artwork or branding; CraftOS needs its own.
- `.desktop` file names in the dconf favourites (`statcraft.desktop`, ...) must
  match what each app's `.deb` installs.
- Arc Menu (the Windows-style start menu) is not in Debian 12; add it as a
  Flatpak or a bundled extension if wanted.
- Calamares branding, secure boot, and ARM64 builds.
