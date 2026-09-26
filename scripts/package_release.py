#!/usr/bin/env python3
"""Package only the built site, with provenance checks and a content manifest."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    inventory = {item['path']: item for item in json.loads((ROOT / 'provenance/inventory.json').read_text())['files']}
    expected_public = {'credits.html', 'THIRD_PARTY_NOTICES.txt', 'media/terrace-atlas-demo.webm'}
    public = ROOT / 'public'
    actual_public = {p.relative_to(public).as_posix() for p in public.rglob('*') if p.is_file()}
    if actual_public != expected_public:
        raise ValueError(f'Unreviewed or missing public assets: {actual_public ^ expected_public}')
    for name in expected_public:
        path = public / name
        record = inventory['public/' + name]
        if path.is_symlink() or record.get('sha256') != digest(path):
            raise ValueError(f'Public asset changed; review provenance hash: {name}')
    dist = ROOT / 'dist'
    files = sorted(p for p in dist.rglob('*') if p.is_file())
    if not (dist / 'index.html').is_file():
        raise ValueError('Production build is missing')
    for path in files:
        name = path.relative_to(dist).as_posix()
        allowed = name in expected_public | {'index.html'} or (path.parent == dist / 'assets' and path.suffix in {'.js', '.css'})
        if path.is_symlink() or not allowed:
            raise ValueError(f'Unexpected distribution file: {name}')
    for name in expected_public:
        if digest(dist / name) != digest(public / name):
            raise ValueError(f'Stale build: {name}')
    destination = ROOT / '.cache/portfolio-release'
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(dist, destination / 'site')
    evidence = destination / 'handoff'
    evidence.mkdir()
    for name in ['README.md', 'docs/portfolio-release.md', 'docs/venue-grade-proposal.md', 'docs/task-10-completion.md', 'provenance/inputs.json', 'provenance/inventory.json', 'provenance/dependencies.json']:
        target = evidence / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    manifest = [{'path': p.relative_to(dist).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in files]
    (destination / 'SHA256-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'PASS: packaged {len(files)} reviewed site files at {destination}')

if __name__ == '__main__':
    main()
