"""Build the standalone app and its player download using Node and Python."""

import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent


def main():
    subprocess.run(["node", "build.cjs"], cwd=ROOT, check=True)
    output = ROOT / "outputs" / "Hero-Team-Lab.zip"
    sources = [ROOT / "hero-team-lab.html", output.parent / "START HERE.txt"]
    with NamedTemporaryFile(dir=output.parent, suffix=".zip", delete=False) as temp:
        archive_path = Path(temp.name)
    try:
        with ZipFile(archive_path, "w") as archive:
            for source in sources:
                # Use fixed metadata and newlines so identical releases compare cleanly.
                entry = ZipInfo(source.name)
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                contents = source.read_text(encoding="utf-8").encode("utf-8")
                archive.writestr(entry, contents, compress_type=ZIP_DEFLATED, compresslevel=9)
        with ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise ValueError("The player archive failed its integrity check.")
        archive_path.replace(output)
        print(f"Packaged {output.name}")
    finally:
        archive_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
