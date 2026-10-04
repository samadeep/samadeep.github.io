#!/usr/bin/env bash
# Build the lab image as v86 9p files:  vm/build.sh <v86 checkout> <out dir>
set -euo pipefail
V86=$1; OUT=$2
mkdir -p "$OUT"
docker build . -f vm/Dockerfile --platform linux/386 --tag lab-vm
docker rm -f lab-vm-c >/dev/null 2>&1 || true
docker create --platform linux/386 --name lab-vm-c lab-vm >/dev/null
docker export lab-vm-c -o "$OUT/rootfs.tar"
tar -f "$OUT/rootfs.tar" --delete .dockerenv || true
python3 "$V86/tools/fs2json.py" --zstd --out "$OUT/fs.json" "$OUT/rootfs.tar"
python3 "$V86/tools/copy-to-sha256.py" --zstd "$OUT/rootfs.tar" "$OUT/flat"
rm "$OUT/rootfs.tar"
du -sh "$OUT"
