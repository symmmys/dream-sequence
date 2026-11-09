
#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# Somnium Documentation Generator
#
# Generates:
#   docs/summaries/src/**/SUMMARY.txt
#   docs/summaries/src/**/SOURCE.txt
#   docs/summaries/src/**/files/**/INDEX.txt
#   docs/summaries/src/**/files/**/PART-NNN.txt
#   docs/DEPENDENCY-GRAPH.md
#   tree.txt
#   source.txt
#
# Individual source files are split into chunks of at most
# 300 original lines. Their original relative paths and line
# ranges are recorded in INDEX.txt and SUMMARY.txt.
#
# Requirements:
#   Bash 4+
#   Python 3.9+
# ============================================================

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

cd "$PROJECT_ROOT"

DOCS_DIR="$PROJECT_ROOT/docs"
SOURCE_DIR="$PROJECT_ROOT/src"
SUMMARY_DIR="$DOCS_DIR/summaries/src"

mkdir -p "$DOCS_DIR" "$SUMMARY_DIR"

if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: Python 3 is required." >&2
    exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "ERROR: src directory not found." >&2
    exit 1
fi

echo "Generating Somnium documentation..."
echo

python3 - "$PROJECT_ROOT" <<'PYTHON'
import os
import re
import sys
import tempfile

from pathlib import Path
from collections import defaultdict
from datetime import datetime

root = Path(sys.argv[1]).resolve()
src = root / "src"
docs = root / "docs"
output = docs / "summaries" / "src"

output.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 300

IGNORED_DIRECTORIES = {
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "vendor",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "coverage",
    ".cache",
}

IMPORT_PATTERN = re.compile(
    r"""(?:import\s+(?:[^'"]*?\s+from\s+)?|
         export\s+[^'"]*?\s+from\s+|
         import\s*\()\s*['"]([^'"]+)['"]""",
    re.VERBOSE
)

EXPORT_PATTERN = re.compile(
    r"""^\s*export\s+(?:(?:default|async)\s+)?"""
    r"""(?:(?:class|function|const|let|var)\s+"""
    r"""([A-Za-z_$][\w$]*)|(?:\{([^}]+)\}))""",
    re.MULTILINE
)


def relative(path):
    return path.relative_to(root).as_posix()


def is_inside(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def ignored_path(path):
    return any(
        part in IGNORED_DIRECTORIES
        for part in path.parts
    )


def atomic_write_bytes(destination, content):
    """Write a file using an atomic replacement."""

    destination.parent.mkdir(parents=True, exist_ok=True)

    fd, temporary = tempfile.mkstemp(
        prefix=".somnium-",
        dir=str(destination.parent)
    )

    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)

        os.replace(temporary, destination)

    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def atomic_write_text(destination, content):
    atomic_write_bytes(
        destination,
        content.encode("utf-8")
    )


def resolve_import(source, specifier):
    if not specifier.startswith("."):
        return None

    # Browser cache-busting query/hash suffixes are not part of the file path.
    specifier = specifier.split("?", 1)[0].split("#", 1)[0]
    base = (source.parent / specifier).resolve()

    candidates = [
        base,
        base.with_suffix(".js"),
        base / "index.js",
    ]

    for candidate in candidates:
        if (
            candidate.is_file()
            and is_inside(candidate, src)
        ):
            return candidate

    return None


def get_imports(path):
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return []

    results = []

    for match in IMPORT_PATTERN.finditer(content):
        target = resolve_import(path, match.group(1))

        if target and target not in results:
            results.append(target)

    return results


def get_exports(path):
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return []

    results = []

    for match in EXPORT_PATTERN.finditer(content):
        if match.group(1):
            results.append(match.group(1))
        elif match.group(2):
            results.extend(
                item.strip().split(" as ")[0].strip()
                for item in match.group(2).split(",")
                if item.strip()
            )

    return sorted(set(results))


def get_directories():
    directories = [src]

    for path in src.rglob("*"):
        if not path.is_dir() or path.is_symlink():
            continue

        if ignored_path(path.relative_to(src)):
            continue

        directories.append(path)

    return sorted(directories)


def get_js_files():
    return sorted(
        path for path in src.rglob("*.js")
        if path.is_file()
        and not path.is_symlink()
        and not ignored_path(path.relative_to(src))
    )


def directory_files(directory):
    return [
        path for path in files
        if path.parent == directory
    ]


def recursive_text_files(directory):
    results = []

    for path in directory.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue

        if ignored_path(path.relative_to(directory)):
            continue

        results.append(path)

    return sorted(
        results,
        key=lambda p: p.relative_to(directory).as_posix()
    )


def read_text_file(path):
    """Return UTF-8 text or None for binary/unreadable files."""

    try:
        content = path.read_bytes()

        if b"\0" in content:
            return None

        return content.decode("utf-8")

    except (OSError, UnicodeError):
        return None


def generate_individual_source(path, directory, destination):
    """
    Generate a complete, individually readable source file.

    Each PART file contains raw source content, without
    documentation wrappers or altered source line numbering.
    """

    content = read_text_file(path)

    if content is None:
        return None

    relative_path = path.relative_to(directory)
    file_output = destination / relative_path
    file_output.mkdir(parents=True, exist_ok=True)

    # This directory is exclusively generator-owned.
    # Remove obsolete chunks before regenerating it.
    for old_file in file_output.iterdir():
        if old_file.is_file() or old_file.is_symlink():
            old_file.unlink()
        elif old_file.is_dir():
            import shutil
            shutil.rmtree(old_file)

    source_lines = content.splitlines(keepends=True)

    # Empty source files still receive an empty first part.
    chunks = [
        source_lines[index:index + CHUNK_SIZE]
        for index in range(0, len(source_lines), CHUNK_SIZE)
    ]

    if not chunks:
        chunks = [[]]

    index_lines = [
        "SOMNIUM — INDIVIDUAL SOURCE FILE INDEX",
        "=" * 64,
        "",
        f"Source file: {relative(path)}",
        f"Source directory: {relative(directory)}/",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"Total source lines: {len(source_lines)}",
        f"Maximum chunk size: {CHUNK_SIZE} lines",
        f"Number of parts: {len(chunks)}",
        "",
        "SOURCE PARTS",
        "-" * 64,
    ]

    for number, chunk in enumerate(chunks, start=1):
        filename = f"PART-{number:03d}.txt"

        if chunk:
            first_line = (number - 1) * CHUNK_SIZE + 1
            last_line = first_line + len(chunk) - 1
        else:
            first_line = 0
            last_line = 0

        part_path = file_output / filename

        atomic_write_bytes(
            part_path,
            "".join(chunk).encode("utf-8")
        )

        index_lines.extend([
            f"Part: {filename}",
            f"Original lines: {first_line}-{last_line}",
            f"Lines in part: {len(chunk)}",
            "",
        ])

    index_lines.extend([
        "READING INSTRUCTIONS",
        "-" * 64,
        "- Read parts in ascending numerical order.",
        "- Concatenate parts without adding separator lines.",
        "- Part contents are original UTF-8 source text.",
        "- Original source line numbering is preserved.",
        "- No source lines are intentionally omitted.",
        "",
    ])

    atomic_write_text(
        file_output / "INDEX.txt",
        "\n".join(index_lines)
    )

    return {
        "source": relative(path),
        "documentation": relative(file_output),
        "lines": len(source_lines),
        "parts": len(chunks),
    }


def generate_source_dump(directory, destination):
    """Generate a recursive UTF-8 directory source dump."""

    source_files = recursive_text_files(directory)
    included = 0
    skipped = 0

    lines = [
        "SOMNIUM — DIRECTORY SOURCE DUMP",
        "=" * 72,
        "",
        f"Directory: {relative(directory)}/",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "This file contains recursively collected UTF-8 text files.",
        "Binary files and excluded directories are omitted.",
        "File paths are relative to the project root.",
        "",
    ]

    for path in source_files:
        content = read_text_file(path)

        if content is None:
            skipped += 1
            continue

        lines.extend([
            "",
            "=" * 72,
            f"FILE: {relative(path)}",
            "=" * 72,
            "",
            content.rstrip("\n"),
            "",
        ])

        included += 1

    lines.extend([
        "",
        "=" * 72,
        "END OF DIRECTORY SOURCE DUMP",
        f"Files included: {included}",
        f"Binary/unreadable files skipped: {skipped}",
        "=" * 72,
        "",
    ])

    atomic_write_text(destination, "\n".join(lines))

    return included, skipped


directories = get_directories()
files = get_js_files()

dependencies = {
    path: get_imports(path)
    for path in files
}

reverse_dependencies = defaultdict(list)

for source, targets in dependencies.items():
    for target in targets:
        reverse_dependencies[target].append(source)


def direct_dependencies(directory):
    results = set()

    for path in directory_files(directory):
        for target in dependencies[path]:
            if target.parent != directory:
                results.add(target)

    return sorted(results)


def direct_dependents(directory):
    results = set()

    for target, sources in reverse_dependencies.items():
        if target.parent == directory:
            for source in sources:
                if source.parent != directory:
                    results.add(source)

    return sorted(results)


# ============================================================
# Generate directory summaries, recursive source dumps,
# and individual source-file documentation.
# ============================================================

dump_statistics = []
individual_statistics = []

for directory in directories:
    relative_dir = directory.relative_to(src)

    if str(relative_dir) == ".":
        destination_dir = output
        display_name = "src/"
    else:
        destination_dir = output / relative_dir
        display_name = f"src/{relative_dir.as_posix()}/"

    destination_dir.mkdir(parents=True, exist_ok=True)

    own_files = directory_files(directory)
    imports = direct_dependencies(directory)
    dependents = direct_dependents(directory)

    # Every directory gets its own recursively scoped
    # individual-file documentation.
    individual_root = destination_dir / "files"

    # This entire directory is generator-owned.
    if individual_root.exists():
        import shutil
        shutil.rmtree(individual_root)

    individual_root.mkdir(parents=True, exist_ok=True)

    source_manifest = []
    skipped_individual = 0

    for path in recursive_text_files(directory):
        result = generate_individual_source(
            path,
            directory,
            individual_root
        )

        if result is None:
            skipped_individual += 1
            continue

        source_manifest.append(result)
        individual_statistics.append(result)

    lines = [
        "SOMNIUM — DIRECTORY SUMMARY",
        "=" * 64,
        "",
        f"Directory: {display_name}",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "PURPOSE",
        "-" * 64,
        "Automatically generated source inventory.",
        "See individual modules for detailed responsibilities.",
        "",
        "SOURCE FILES (DIRECT CHILDREN)",
        "-" * 64,
    ]

    if own_files:
        for path in own_files:
            lines.append(f"- {path.name}")

            exports = get_exports(path)

            if exports:
                lines.append(
                    "  Exports: " + ", ".join(exports)
                )
    else:
        lines.append("(No JavaScript files directly in this directory.)")

    lines.extend([
        "",
        "DIRECT DEPENDENCIES",
        "-" * 64,
    ])

    if imports:
        lines.extend(
            f"- {relative(path)}"
            for path in imports
        )
    else:
        lines.append("(No external local-directory imports detected.)")

    lines.extend([
        "",
        "DEPENDENTS",
        "-" * 64,
    ])

    if dependents:
        lines.extend(
            f"- {relative(path)}"
            for path in dependents
        )
    else:
        lines.append("(No external local dependents detected.)")

    lines.extend([
        "",
        "INDIVIDUAL SOURCE FILE MANIFEST",
        "-" * 64,
        "",
        f"Documentation root: {relative(individual_root)}/",
        f"Maximum chunk size: {CHUNK_SIZE} lines",
        f"Text files documented: {len(source_manifest)}",
        f"Binary/unreadable files skipped: {skipped_individual}",
        "",
        "Each source file has its own documentation directory.",
        "INDEX.txt identifies the original file and maps every",
        "numbered part to its exact original source line range.",
        "",
    ])

    if source_manifest:
        for entry in source_manifest:
            lines.extend([
                f"SOURCE: {entry['source']}",
                f"  Lines: {entry['lines']}",
                f"  Parts: {entry['parts']}",
                f"  Index: {entry['documentation']}/INDEX.txt",
            ])

            for number in range(1, entry["parts"] + 1):
                lines.append(
                    f"    {entry['documentation']}/"
                    f"PART-{number:03d}.txt"
                )

            lines.append("")
    else:
        lines.append("(No readable UTF-8 source files.)")

    lines.extend([
        "RECURSIVE SOURCE DUMP",
        "-" * 64,
        "- SOURCE.txt contains recursively collected text files.",
        "- Individual files are available under files/.",
        "- Individual PART files contain at most 300 lines.",
        "- Binary files are excluded from both representations.",
        "",
        "NOTES",
        "-" * 64,
        "- Dependencies are extracted from relative JavaScript imports.",
        "- External packages and browser globals are not represented.",
        "- Dynamic imports using computed paths may not be detected.",
        "- This inventory does not establish runtime initialization order.",
        "- Generated documentation is not authoritative application state.",
        "",
    ])

    atomic_write_text(
        destination_dir / "SUMMARY.txt",
        "\n".join(lines)
    )

    dump_path = destination_dir / "SOURCE.txt"

    included, skipped = generate_source_dump(
        directory,
        dump_path
    )

    dump_statistics.append(
        (display_name, included, skipped, relative(dump_path))
    )


# ============================================================
# Generate directory-level dependency graph.
# ============================================================

directory_edges = set()

for source, targets in dependencies.items():
    source_dir = source.parent

    for target in targets:
        target_dir = target.parent

        if source_dir != target_dir:
            directory_edges.add((source_dir, target_dir))

directory_ids = {
    directory: f"D{i}"
    for i, directory in enumerate(directories)
}

graph_lines = [
    "# Somnium — Dependency Graph",
    "",
    "Automatically generated from relative JavaScript imports.",
    "",
    "The direction of each arrow is:",
    "",
    "`Importing directory --> Imported directory`",
    "",
    "```mermaid",
    "flowchart TD",
]

for directory in directories:
    label = (
        "src"
        if directory == src
        else "src/" + directory.relative_to(src).as_posix()
    )

    graph_lines.append(
        f'    {directory_ids[directory]}["{label}"]'
    )

for source, target in sorted(
    directory_edges,
    key=lambda edge: (
        edge[0].as_posix(),
        edge[1].as_posix()
    )
):
    graph_lines.append(
        f"    {directory_ids[source]} --> {directory_ids[target]}"
    )

graph_lines.extend([
    "```",
    "",
    "## Dependency Statistics",
    "",
    f"- JavaScript files analyzed: {len(files)}",
    f"- Source directories analyzed: {len(directories)}",
    f"- Cross-directory dependency relationships: {len(directory_edges)}",
    "",
    "## Limitations",
    "",
    "- Only statically identifiable relative imports are included.",
    "- External dependencies are excluded.",
    "- Runtime service relationships are not inferred.",
    "- This graph represents source dependencies, not execution order.",
    "",
])

atomic_write_text(
    docs / "DEPENDENCY-GRAPH.md",
    "\n".join(graph_lines)
)


# ============================================================
# Generation report.
# ============================================================

print(f"Analyzed {len(files)} JavaScript files.")
print(f"Generated {len(directories)} directory summaries.")
print(f"Generated {len(directories)} recursive source dumps.")
print(f"Generated {len(individual_statistics)} individual source indexes.")
print(f"Generated {len(directory_edges)} dependency relationships.")
print()
print("INDIVIDUAL SOURCE DOCUMENTATION")
print("-" * 64)

for entry in individual_statistics:
    print(f"{entry['source']}")
    print(f"  Lines: {entry['lines']}")
    print(f"  Parts: {entry['parts']}")
    print(f"  Index: {entry['documentation']}/INDEX.txt")

print()
print("DIRECTORY SOURCE DUMPS")
print("-" * 64)

for name, included, skipped, destination in dump_statistics:
    print(f"{name}")
    print(f"  Files included: {included}")
    if skipped:
        print(f"  Files skipped:  {skipped}")
    print(f"  Output: {destination}")

PYTHON


# ============================================================
# Generate project tree.
# ============================================================

echo
echo "Generating tree.txt..."

if command -v tree >/dev/null 2>&1; then
    tree -I 'node_modules|.git|summaries|dist|build|coverage' . \
        > tree.txt
else
    find . \
        -path './.git' -prune -o \
        -path './node_modules' -prune -o \
        -path './docs/summaries' -prune -o \
        -path './dist' -prune -o \
        -path './build' -prune -o \
        -print | sort > tree.txt
fi

# ============================================================
# Source concatenation.
#
# Generated directory dumps are intentionally excluded from
# the master source.txt to prevent duplication.
# ============================================================

cat_files() {
    local directory="$1"

    find "$directory" \
        -type d \( \
            -name '.git' -o \
            -name 'node_modules' -o \
            -name 'dist' -o \
            -name 'build' -o \
            -name 'coverage' \
        \) -prune -o \
        -type d -name 'summaries' -prune -o \
        -type f -print0 |
    sort -z |
    while IFS= read -r -d '' file; do
        # Skip binary and empty files.
        if ! grep -Iq . "$file" 2>/dev/null; then
            continue
        fi

        echo
        echo "$file"
        echo "_______"
        cat "$file"
    done
}

# ============================================================
# Generate master source.txt.
# ============================================================

echo
echo "Generating source.txt..."

TEMP_SOURCE="$(mktemp "$PROJECT_ROOT/.source.XXXXXX")"
TEMP_HTML="$(mktemp "$PROJECT_ROOT/.html.XXXXXX")"

cleanup() {
    rm -f "$TEMP_SOURCE" "$TEMP_HTML"
}

trap cleanup EXIT

if [[ -d docs ]]; then
    cat_files docs > "$TEMP_SOURCE"
fi

if [[ -f index.html ]]; then
    sed -n 'H
$ {
    g
    s/<!--/²/g
    s/-->/³/g
:a
    s/²[^³]*³//g
    t a
    s/.//p
}' index.html > "$TEMP_HTML"

    {
        echo
        echo "Commented out index.html, for display within an HTML page."
        echo "<!--"
        cat "$TEMP_HTML"
        echo "-->"
    } >> "$TEMP_SOURCE"
fi

if [[ -d src ]]; then
    cat_files src >> "$TEMP_SOURCE"
fi

mv "$TEMP_SOURCE" "$PROJECT_ROOT/source.txt"

# ============================================================
# Completion report.
# ============================================================

echo
echo "============================================================"
echo "Somnium documentation generation complete."
echo "============================================================"
echo
echo "Directory summaries:"
echo "  docs/summaries/src/**/SUMMARY.txt"
echo
echo "Recursive source dumps:"
echo "  docs/summaries/src/**/SOURCE.txt"
echo
echo "Individual source files:"
echo "  docs/summaries/src/**/files/**/INDEX.txt"
echo "  docs/summaries/src/**/files/**/PART-NNN.txt"
echo
echo "Maximum individual source chunk: 300 lines"
echo
echo "Dependency graph:"
echo "  docs/DEPENDENCY-GRAPH.md"
echo
echo "Project tree:"
echo "  tree.txt"
echo
echo "Master source bundle:"
echo "  source.txt"
echo

