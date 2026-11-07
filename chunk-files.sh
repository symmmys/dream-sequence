#!/usr/bin/env bash
# chunk-files.sh: split files into <16000-char parts and copy each to the clipboard via wl-copy.
set -euo pipefail

LIMIT=15000          # stays well under 16000 with room for the part header
MAXLINE=2000         # longer physical lines are split so no single line overflows a chunk
export LC_ALL=C      # count bytes, which is >= characters, so the limit is conservative

usage() {
  echo "Usage: $0 [-l limit] file [file ...]"
  echo "       $0 [-l limit] -f filelist.txt   (one path per line, # comments allowed)"
  exit 1
}

LIST=()
while getopts "l:f:h" opt; do
  case $opt in
    l) LIMIT=$OPTARG ;;
    f) mapfile -t LIST < <(grep -vE '^\s*(#|$)' "$OPTARG") ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
LIST+=("$@")

[ ${#LIST[@]} -gt 0 ] || usage
command -v wl-copy >/dev/null || { echo "wl-copy not found" >&2; exit 1; }
(( LIMIT > MAXLINE + 500 )) || { echo "limit too small" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build chunk files in $TMP. Runs in a subshell, so chunk state stays local to it.
{
  for f in "${LIST[@]}"; do
    if [ ! -r "$f" ]; then
      echo "skipping unreadable file: $f" >&2
      continue
    fi
    printf '\n===== FILE: %s =====\n' "$f"
    awk -v w="$MAXLINE" '{
      while (length($0) > w) { print substr($0, 1, w); $0 = substr($0, w + 1) }
      print
    }' "$f"
  done
} | {
  chunk=0
  buf=""
  flush() {
    [ -n "$buf" ] || return 0
    chunk=$((chunk + 1))
    printf '%s' "$buf" > "$TMP/$(printf '%04d' "$chunk").part"
    buf=""
  }
  while IFS= read -r line || [ -n "$line" ]; do
    piece="$line"$'\n'
    if (( ${#buf} + ${#piece} > LIMIT )); then
      flush
    fi
    buf+="$piece"
  done
  flush
}

total=$(find "$TMP" -name '*.part' | wc -l)
[ "$total" -gt 0 ] || { echo "nothing to copy" >&2; exit 1; }
echo "Created $total part(s), each under $LIMIT bytes."

i=0
for part in "$TMP"/*.part; do
  i=$((i + 1))
  out="$TMP/out-$i.txt"
  { printf '[Part %d of %d]\n' "$i" "$total"; cat "$part"; } > "$out"
  size=$(wc -c < "$out")

  while true; do
    read -r -p "Part $i/$total ($size bytes): [c]opy, [s]kip, [q]uit? " ans </dev/tty
    case "$ans" in
      c|C)
        wl-copy < "$out"
        echo "Copied part $i/$total to the clipboard. Paste it into the chat, then continue."
        break ;;
      s|S) echo "Skipped part $i."; break ;;
      q|Q) echo "Stopped at part $i."; exit 0 ;;
      *) echo "Enter c, s, or q." ;;
    esac
  done
done
echo "Done."

