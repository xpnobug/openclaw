#!/usr/bin/env bash
# Resolve symlinks in extensions/ for npm publish (npm ignores symlinks).
# Usage: resolve-symlinks.sh [--restore]
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/extensions"

if [[ "${1:-}" == "--restore" ]]; then
  for meta in "$DIR"/.symlink-*.json; do
    [ -f "$meta" ] || continue
    name=$(basename "$meta" .json | sed 's/^\.symlink-//')
    target=$(cat "$meta")
    rm -rf "$DIR/$name"
    (cd "$DIR" && ln -s "$target" "$name")
    rm "$meta"
  done
  echo "Symlinks restored."
else
  for name in $(ls -1 "$DIR"); do
    [ -L "$DIR/$name" ] || continue
    target=$(readlink "$DIR/$name")
    echo "$target" > "$DIR/.symlink-$name.json"
    # Resolve relative to extensions/
    real=$(cd "$DIR" && cd "$(dirname "$target")" && pwd)/$(basename "$target")
    rm "$DIR/$name"
    rsync -a --exclude node_modules "$real/" "$DIR/$name/"
  done
  echo "Symlinks resolved to real directories."
fi
