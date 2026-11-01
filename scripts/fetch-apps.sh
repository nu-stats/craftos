#!/bin/sh
# Download the latest amd64 .deb of each Craft app (see apps/manifest.tsv)
# into repo/incoming/, ready for scripts/publish-repo.sh.
# Apps with no release yet are skipped with a warning, not an error.
set -u
cd "$(dirname "$0")/.."
out=repo/incoming
mkdir -p "$out"

tail -n +2 apps/manifest.tsv | while IFS="$(printf '\t')" read -r name repo pkg glob notes; do
    [ -n "$name" ] || continue
    if gh release download --repo "$repo" --pattern "$glob" --dir "$out" --clobber 2>/dev/null; then
        echo "ok      $name"
    else
        echo "skipped $name (no release/.deb found in $repo)"
    fi
done
