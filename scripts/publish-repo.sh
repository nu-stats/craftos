#!/bin/sh
# Turn the .debs in repo/incoming/ into a signed apt repository in repo/public/
# (dists/ and pool/), ready to host as static files.
# Needs reprepro and the signing key in the gpg keyring (see make-key.sh).
set -e
cd "$(dirname "$0")/.."

rm -rf repo/public repo/db
mkdir -p repo/public

set -- repo/incoming/*.deb
[ -e "$1" ] || { echo "no .deb files in repo/incoming/" >&2; exit 1; }

reprepro --basedir repo --outdir ./repo/public includedeb bookworm "$@"
# Publish the public key next to the repo for manual setup.
cp config/archives/craftos.key.chroot repo/public/craftos.key
echo "repo ready in repo/public"
