#!/bin/sh
# One-time: create the repo signing key.
#  - writes the PUBLIC key to config/archives/craftos.key.chroot (commit it)
#  - prints the PRIVATE key; store it as the GPG_PRIVATE_KEY secret in GitHub
#    and keep a backup. Losing it means every installed system needs a new key.
set -e
cd "$(dirname "$0")/.."
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export GNUPGHOME="$home"

gpg --batch --passphrase '' --quick-generate-key \
    "CraftOS Archive <craftos@nu-stats.invalid>" rsa4096 sign never
fpr=$(gpg --list-keys --with-colons | awk -F: '/^fpr/ {print $10; exit}')

mkdir -p config/archives
gpg --armor --export "$fpr" > config/archives/craftos.key.chroot
echo "public key written to config/archives/craftos.key.chroot ($fpr)"
echo "---- PRIVATE KEY (save as GitHub secret GPG_PRIVATE_KEY) ----"
gpg --armor --export-secret-keys "$fpr"
