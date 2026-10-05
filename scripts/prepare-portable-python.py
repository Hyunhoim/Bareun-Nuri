"""Prepare portable CPU inference runtime using the installed CPython base.
Run using a Windows Python 3.12 environment with pip. No secrets are copied.
"""
import pathlib
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
assert sys.version_info[:2] == (3, 12), 'Windows Python 3.12 required'
target = root / 'Bareun-Nuri 제출/01_실행/runtime/python'
base = pathlib.Path(sys.base_prefix)
target.mkdir(parents=True, exist_ok=True)
for file in base.iterdir():
    if file.is_file() and file.suffix in ('.exe', '.dll', '.txt'):
        shutil.copy2(file, target / file.name)
for name in ('Lib', 'DLLs'):
    shutil.copytree(base / name, target / name, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('site-packages', '__pycache__', 'test', 'tests'))
dest = str(target / 'Lib/site-packages')
subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', dest,
                'torch==2.6.0+cpu', '--no-deps', '--index-url', 'https://download.pytorch.org/whl/cpu'], check=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', dest,
                '--no-deps', '-r', str(root / 'scripts/requirements-windows.txt')], check=True)
