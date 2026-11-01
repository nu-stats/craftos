.PHONY: iso repo trial meta apps clean

# Needs a Debian/Ubuntu host (or WSL2) with:
#   live-build debootstrap dpkg-dev reprepro gnupg gh

# Build the signed apt repo into repo/public/ (needs the signing key in gpg).
repo: apps trial meta
	sh scripts/publish-repo.sh

# The ISO installs from the hosted repo, so publish the repo first.
iso:
	chmod +x auto/*
	sudo sh auto/config
	sudo sh auto/build

trial:
	sh scripts/build-trial-debs.sh

meta:
	sh scripts/build-meta.sh

apps:
	sh scripts/fetch-apps.sh

clean:
	sudo sh auto/clean
	rm -rf repo/incoming repo/public repo/db
