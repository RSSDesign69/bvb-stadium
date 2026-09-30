#!/usr/bin/env python3
"""Audit file provenance, forbidden references, index, and reachable Git history.

Original project tooling; Python standard library only. This is a hygiene check,
not a detector for modified or semantically copied third-party material.
"""

import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ERRORS = set()
ARCHIVES = {'.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz'}
FORBIDDEN_DIRS = {'reference-inputs', 'reference-zip', 'reference-source',
                  'extracted', '__macosx', 'signal-iduna-park-reference-imagery'}
SIGNATURES = (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08', b'7z\xbc\xaf\x27\x1c',
              b'Rar!\x1a\x07', b'\x1f\x8b', b'BZh', b'\xfd7zXZ\x00')


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def load(path):
    return json.loads((ROOT / path).read_text())


def prohibited(path):
    p = PurePosixPath(path.lower())
    return (p.suffix in ARCHIVES or bool(set(p.parts) & FORBIDDEN_DIRS)
            or p.name.startswith(('ssstwitter.com_', 'screenshot')))


def check_blob(label, data, excluded_hashes):
    if data.startswith(SIGNATURES) or data[257:262] == b'ustar':
        ERRORS.add(f'{label}: archive content prohibited')
    if hashlib.sha256(data).hexdigest() in excluded_hashes:
        ERRORS.add(f'{label}: exact external reference media prohibited')


def main():
    if Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve() != ROOT:
        raise ValueError('Run in an independently initialized BVB 3D Stadium repository')
    inputs = load('provenance/inputs.json')['inputs']
    input_ids = {entry['id'] for entry in inputs}
    excluded_hashes = {entry['sha256'] for entry in inputs
                       if entry.get('sha256') and entry.get('distribution') == 'external-only'}
    entries = load('provenance/inventory.json')['files']
    inventory = {entry['path']: entry for entry in entries}
    if len(entries) != len(inventory):
        ERRORS.add('Duplicate inventory path')
    for path, entry in inventory.items():
        if not entry.get('origin') or not entry.get('license'):
            ERRORS.add(f'{path}: missing origin/license')
        if any(source not in input_ids for source in entry.get('source_ids', [])):
            ERRORS.add(f'{path}: unknown source ID')
        if not (ROOT / path).is_file():
            ERRORS.add(f'{path}: inventoried file missing')

    # Include force-added ignored files, and ordinary untracked working files.
    working = set(filter(None, git('ls-files', '-z', '--cached', '--others',
                                  '--exclude-standard').decode().split('\0')))
    for path in sorted(working):
        if prohibited(path):
            ERRORS.add(f'working/{path}: prohibited path')
        if path not in inventory:
            ERRORS.add(f'working/{path}: missing provenance entry')
        p = ROOT / path
        if p.is_symlink():
            ERRORS.add(f'working/{path}: symlinks prohibited')
        elif p.is_file():
            check_blob(f'working/{path}', p.read_bytes(), excluded_hashes)

    staged = git('ls-files', '--stage', '-z').decode().split('\0')
    # Review the staged snapshot against its own registry, without replacing a
    # contributor's existing staged work merely to audit unstaged development.
    staged_paths = {r.split('\t', 1)[1] for r in staged if r}
    index_inventory = inventory
    if 'provenance/inventory.json' in staged_paths:
        staged_manifest = json.loads(git('show', ':provenance/inventory.json'))
        index_inventory = {entry['path']: entry for entry in staged_manifest['files']}
    index_count = 0
    for record in filter(None, staged):
        meta, path = record.split('\t', 1)
        mode, oid, stage = meta.split()
        index_count += 1
        if stage != '0' or mode not in {'100644', '100755'}:
            ERRORS.add(f'index/{path}: non-regular or unmerged entry')
            continue
        if prohibited(path):
            ERRORS.add(f'index/{path}: prohibited path')
        if path not in index_inventory:
            ERRORS.add(f'index/{path}: missing provenance entry')
        check_blob(f'index/{path}', git('cat-file', 'blob', oid), excluded_hashes)

    # Inspect every historical tree, so renames cannot hide prohibited old paths.
    commits = git('rev-list', '--all').decode().splitlines()
    for commit in commits:
        for record in filter(None, git('ls-tree', '-rz', commit).decode().split('\0')):
            meta, path = record.split('\t', 1)
            mode = meta.split()[0]
            if prohibited(path) or mode not in {'100644', '100755'}:
                ERRORS.add(f'history/{commit[:8]}/{path}: prohibited path or file mode')

    # Scan each reachable object once, including blobs no longer in HEAD.
    objects = git('rev-list', '--objects', '--all').decode().splitlines()
    blob_count = 0
    for record in objects:
        oid = record.split(' ', 1)[0]
        if git('cat-file', '-t', oid).strip() == b'blob':
            check_blob(f'history/{oid[:12]}', git('cat-file', 'blob', oid), excluded_hashes)
            blob_count += 1

    package = load('package.json')
    installed = load('provenance/dependencies.json')['installed']
    recorded = {entry['name'] for entry in installed}
    for name in set(package.get('dependencies', {})) | set(package.get('devDependencies', {})):
        if name not in recorded:
            ERRORS.add(f'dependency/{name}: missing installed provenance')

    if ERRORS:
        print('\n'.join('FAIL ' + item for item in sorted(ERRORS)), file=sys.stderr)
        return 1
    print(f'PASS: {len(working)} working files, {index_count} index entries, '
          f'{len(commits)} commits, {blob_count} historical blobs; '
          f'{len(excluded_hashes)} external input hashes excluded.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f'FAIL: audit could not complete: {error}', file=sys.stderr)
        sys.exit(1)
