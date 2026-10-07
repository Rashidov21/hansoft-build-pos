# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['config', 'config.settings', 'config.urls', 'config.wsgi', 'dotenv']
hiddenimports += collect_submodules('django')
hiddenimports += collect_submodules('waitress')
hiddenimports += collect_submodules('rest_framework')
hiddenimports += collect_submodules('corsheaders')
hiddenimports += collect_submodules('core')
hiddenimports += collect_submodules('accounts')
hiddenimports += collect_submodules('catalog')
hiddenimports += collect_submodules('inventory')
hiddenimports += collect_submodules('sales')
hiddenimports += collect_submodules('debt')
hiddenimports += collect_submodules('printing')
hiddenimports += collect_submodules('sync')
hiddenimports += collect_submodules('reports')
hiddenimports += collect_submodules('integrations')
hiddenimports += collect_submodules('licensing')


a = Analysis(
    ['backend\\run_waitress.py'],
    pathex=['C:\\Users\\rashi\\Documents\\GitHub\\geeks_pos\\backend'],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='geeks_pos_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
