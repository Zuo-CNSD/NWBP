#!/usr/bin/env python3
"""Package an electron-builder Linux directory as a Debian archive.

The bundled fpm executable can return a 96-byte, empty archive on macOS.
Building the three Debian ar members directly avoids that host-specific failure.
"""

from __future__ import annotations

import argparse
import io
import tarfile
from pathlib import Path


DEPENDENCIES = (
    "libc6 (>= 2.28), libgtk-3-0 | libgtk-3-0t64, libnss3, "
    "libasound2 | libasound2t64, libxss1, libxtst6, libgbm1, "
    "libnotify4, libatspi2.0-0, libsecret-1-0, xdg-utils"
)


def add_bytes(archive: tarfile.TarFile, name: str, data: bytes, mode: int = 0o644) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    archive.addfile(info, io.BytesIO(data))


def add_link(archive: tarfile.TarFile, name: str, target: str) -> None:
    info = tarfile.TarInfo(name)
    info.type = tarfile.SYMTYPE
    info.mode = 0o777
    info.linkname = target
    archive.addfile(info)


def add_dir(archive: tarfile.TarFile, name: str) -> None:
    info = tarfile.TarInfo(name.rstrip("/") + "/")
    info.type = tarfile.DIRTYPE
    info.mode = 0o755
    archive.addfile(info)


def write_member(output: io.BufferedWriter, name: str, path: Path | None = None, data: bytes | None = None) -> None:
    size = path.stat().st_size if path else len(data or b"")
    header = (
        f"{name:<16}{0:<12}{0:<6}{0:<6}{0o100644:<8o}{size:<10}`\n"
    ).encode("ascii")
    if len(header) != 60:
        raise ValueError(f"invalid ar header for {name}")
    output.write(header)
    if path:
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
    else:
        output.write(data or b"")
    if size % 2:
        output.write(b"\n")


def package(source: Path, arch: str, version: str, icon: Path, output: Path) -> None:
    if not (source / "NWBP").is_file():
        raise FileNotFoundError(source / "NWBP")
    installed_kib = (sum(p.stat().st_size for p in source.rglob("*") if p.is_file()) + 1023) // 1024
    control = (
        "Package: nwbp\n"
        f"Version: {version}\n"
        f"Architecture: {arch}\n"
        "Maintainer: Zuo-CNSD <zuo-cnsd@users.noreply.github.com>\n"
        "Section: sound\n"
        "Priority: optional\n"
        f"Installed-Size: {installed_kib}\n"
        f"Depends: {DEPENDENCIES}\n"
        "Homepage: https://github.com/Zuo-CNSD/NWBP\n"
        "Description: NWBP desktop music player\n"
        " Play music from Bilibili and NetEase Cloud Music.\n"
    ).encode("utf-8")
    desktop = (
        "[Desktop Entry]\n"
        "Name=NWBP\n"
        "Comment=Desktop music player\n"
        "Exec=/opt/nwbp/NWBP %U\n"
        "Icon=nwbp\n"
        "Type=Application\n"
        "Terminal=false\n"
        "Categories=AudioVideo;Audio;Player;\n"
        "StartupWMClass=NWBP\n"
    ).encode("utf-8")

    output.parent.mkdir(parents=True, exist_ok=True)
    control_tar = output.with_suffix(".control.tar.gz")
    data_tar = output.with_suffix(".data.tar.gz")
    try:
        with tarfile.open(control_tar, "w:gz", compresslevel=9) as archive:
            add_bytes(archive, "./control", control)
        with tarfile.open(data_tar, "w:gz", compresslevel=6) as archive:
            for directory in (
                "./opt",
                "./usr",
                "./usr/bin",
                "./usr/share",
                "./usr/share/applications",
                "./usr/share/icons",
                "./usr/share/icons/hicolor",
                "./usr/share/icons/hicolor/512x512",
                "./usr/share/icons/hicolor/512x512/apps",
            ):
                add_dir(archive, directory)

            def file_filter(info: tarfile.TarInfo) -> tarfile.TarInfo:
                if info.name.endswith("/chrome-sandbox"):
                    info.mode = 0o4755
                return info

            archive.add(source, arcname="./opt/nwbp", recursive=True, filter=file_filter)
            add_link(archive, "./usr/bin/nwbp", "/opt/nwbp/NWBP")
            add_bytes(archive, "./usr/share/applications/nwbp.desktop", desktop)
            archive.add(icon, arcname="./usr/share/icons/hicolor/512x512/apps/nwbp.png")
        with output.open("wb") as archive:
            archive.write(b"!<arch>\n")
            write_member(archive, "debian-binary", data=b"2.0\n")
            write_member(archive, "control.tar.gz", path=control_tar)
            write_member(archive, "data.tar.gz", path=data_tar)
    finally:
        control_tar.unlink(missing_ok=True)
        data_tar.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--arch", choices=("amd64", "arm64"), required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--icon", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    package(args.source, args.arch, args.version, args.icon, args.output)
