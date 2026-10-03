"""Build Umbra's compatibility wheel from the one pinned upstream wheel.

No package imports, downloads, or environment installation are performed.
"""

import argparse
import ast
import base64
import copy
import csv
import hashlib
import io
import json
import re
import stat
import sys
import zipfile
from email import policy
from email.generator import BytesGenerator
from email.message import Message
from email.parser import BytesParser
from pathlib import Path


OFFICIAL_WHEEL = "transparent_background-1.3.4-py3-none-any.whl"
OFFICIAL_SHA256 = "aa823962e124ae06ea16eb722c18d00cafdda2eda729e9d84d1ab038f62a1d32"
VERSION = "1.3.4+umbra.1"
OUTPUT_WHEEL = "transparent_background-" + VERSION + "-py3-none-any.whl"
OLD_DIST_INFO = "transparent_background-1.3.4.dist-info"
NEW_DIST_INFO = "transparent_background-" + VERSION + ".dist-info"
UTILS_PATH = "transparent_background/utils.py"
RECORD_PATH = OLD_DIST_INFO + "/RECORD"
MAX_ARCHIVE_BYTES = 1024 * 1024
MAX_MEMBER_BYTES = 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024

EXPECTED_MEMBERS = frozenset([
    "transparent_background/InSPyReNet.py",
    "transparent_background/Remover.py",
    "transparent_background/__init__.py",
    "transparent_background/config.yaml",
    "transparent_background/gui.py",
    UTILS_PATH,
    "transparent_background/backbones/SwinTransformer.py",
    "transparent_background/modules/attention_module.py",
    "transparent_background/modules/context_module.py",
    "transparent_background/modules/decoder_module.py",
    "transparent_background/modules/layers.py",
    OLD_DIST_INFO + "/licenses/LICENSE",
    OLD_DIST_INFO + "/METADATA",
    OLD_DIST_INFO + "/WHEEL",
    OLD_DIST_INFO + "/entry_points.txt",
    OLD_DIST_INFO + "/top_level.txt",
    RECORD_PATH,
])
EXPECTED_REQUIREMENTS = (
    "torch>=1.7.1",
    "torchvision>=0.8.2",
    "opencv-python>=4.6.0.66",
    "timm>=1.0.3",
    "tqdm>=4.64.1",
    "kornia>=0.5.4",
    "gdown>=4.5.4",
    "wget>=3.2",
    "easydict>=1.10",
    "pyyaml>=6.0",
    "albumentations>=1.3.1",
    "albucore>=0.0.16",
    "pymatting>=1.1.13",
    'pyvirtualcam>=0.6.0; extra == "webcam"',
    'flet>=0.23.1; extra == "gui"',
)
SOURCE_PATCHES = (
    (
        b"        super(dynamic_resize_a, self).__init__(always_apply, p)\n",
        b"        super(dynamic_resize_a, self).__init__(p=1.0 if always_apply else p)\n",
    ),
    (
        b"        return A.resize(img, height=size[0], width=size[1])\n",
        b'        return A.Resize(height=size[0], width=size[1], p=1.0)(image=img)["image"]\n',
    ),
)
EMAIL_POLICY = policy.default.clone(
    linesep="\n", max_line_length=0, utf8=True,
    refold_source="none", raise_on_defect=True,
)


def _safe_member_path(name):
    if not re.fullmatch(r"[A-Za-z0-9_+.-]+(?:/[A-Za-z0-9_+.-]+)*", name):
        raise ValueError("unsafe ZIP/RECORD path: " + repr(name))
    if any(part in (".", "..") or part.endswith(".") for part in name.split("/")):
        raise ValueError("noncanonical ZIP/RECORD path: " + repr(name))


def _record_hash(data):
    return "sha256=" + base64.urlsafe_b64encode(
        hashlib.sha256(data).digest()
    ).rstrip(b"=").decode("ascii")


def _verify_record(members, record_path):
    seen = set()
    reader = csv.reader(io.StringIO(members[record_path].decode("utf-8"), newline=""), strict=True)
    for row in reader:
        if len(row) != 3:
            raise ValueError("RECORD rows must have exactly three columns")
        name, digest, size = row
        _safe_member_path(name)
        if name in seen or name not in members:
            raise ValueError("duplicate or unexpected RECORD path: " + repr(name))
        seen.add(name)
        expected = ("", "") if name == record_path else (
            _record_hash(members[name]), str(len(members[name]))
        )
        if (digest, size) != expected:
            raise ValueError("RECORD hash/size mismatch: " + repr(name))
    if seen != set(members):
        raise ValueError("RECORD does not cover exactly the wheel members")


def _read_members(wheel_bytes):
    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as archive:
        if archive.comment:
            raise ValueError("unexpected ZIP archive comment")
        infos = archive.infolist()
        members = {}
        folded_names = set()
        total = 0
        for info in infos:
            name = info.filename
            _safe_member_path(name)
            if info.orig_filename != name or name.casefold() in folded_names:
                raise ValueError("truncated or duplicate ZIP path: " + repr(name))
            folded_names.add(name.casefold())
            if name not in EXPECTED_MEMBERS:
                raise ValueError("unexpected wheel member: " + repr(name))
            if (info.is_dir() or stat.S_IFMT(info.external_attr >> 16) != stat.S_IFREG
                    or info.create_system != 3 or info.flag_bits != 0
                    or info.compress_type != zipfile.ZIP_DEFLATED or info.extra or info.comment):
                raise ValueError("unexpected ZIP member attributes: " + repr(name))
            total += info.file_size
            if not 0 <= info.file_size <= MAX_MEMBER_BYTES or total > MAX_TOTAL_BYTES:
                raise ValueError("wheel exceeds bounded uncompressed size")
            members[name] = archive.read(info)
        if set(members) != EXPECTED_MEMBERS:
            raise ValueError("wheel member manifest mismatch")
    _verify_record(members, RECORD_PATH)
    return infos, members


def _parse_message(data):
    message = BytesParser(policy=EMAIL_POLICY).parsebytes(data)
    if message.is_multipart() or message.defects:
        raise ValueError("unexpected metadata structure")
    for value in message.values():
        if getattr(value, "defects", ()):
            raise ValueError("invalid metadata header")
    return message


def _require_header(message, name, value):
    if message.get_all(name, []) != [value]:
        raise ValueError("unexpected metadata header: " + name)


def _patch_metadata(data):
    message = _parse_message(data)
    for name, value in (
        ("Metadata-Version", "2.4"), ("Name", "transparent-background"),
        ("Version", "1.3.4"), ("Requires-Python", ">=3.8"), ("License-File", "LICENSE"),
    ):
        _require_header(message, name, value)
    if tuple(message.get_all("Requires-Dist", [])) != EXPECTED_REQUIREMENTS:
        raise ValueError("unexpected or ambiguous Requires-Dist metadata")

    patched = Message(policy=EMAIL_POLICY)
    for name, value in message.raw_items():
        if name.lower() == "version":
            value = VERSION
        elif name.lower() == "requires-dist" and value == "albumentations>=1.3.1":
            value = "albumentationsx==2.4.11"
        patched[name] = value
    patched.set_payload(message.get_payload(decode=True))
    output = io.BytesIO()
    BytesGenerator(output, policy=EMAIL_POLICY, mangle_from_=False).flatten(patched)
    result = output.getvalue()
    rebuilt = _parse_message(result)
    if (list(rebuilt.raw_items()) != list(patched.raw_items())
            or rebuilt.get_payload(decode=True) != message.get_payload(decode=True)):
        raise ValueError("metadata serialization changed unrelated content")
    return result


def _patch_utils(data):
    for old, new in SOURCE_PATCHES:
        if data.count(old) != 1 or new in data:
            raise ValueError("missing or ambiguous utils.py patch anchor")
        data = data.replace(old, new, 1)
    ast.parse(data.decode("utf-8"), filename=UTILS_PATH)
    # The pinned upstream wheel has no package version/__version__ assignment.
    return data


def _build_bytes(wheel_bytes):
    infos, members = _read_members(wheel_bytes)
    wheel_metadata = _parse_message(members[OLD_DIST_INFO + "/WHEEL"])
    for name, value in (
        ("Wheel-Version", "1.0"), ("Generator", "setuptools (80.4.0)"),
        ("Root-Is-Purelib", "true"), ("Tag", "py3-none-any"),
    ):
        _require_header(wheel_metadata, name, value)
    members[OLD_DIST_INFO + "/METADATA"] = _patch_metadata(members[OLD_DIST_INFO + "/METADATA"])
    members[UTILS_PATH] = _patch_utils(members[UTILS_PATH])
    renamed = {}
    for name, data in members.items():
        new_name = NEW_DIST_INFO + name[len(OLD_DIST_INFO):] if name.startswith(OLD_DIST_INFO + "/") else name
        _safe_member_path(new_name)
        if new_name in renamed:
            raise ValueError("duplicate output wheel path")
        renamed[new_name] = data

    new_record = NEW_DIST_INFO + "/RECORD"
    record = io.StringIO(newline="")
    writer = csv.writer(record, lineterminator="\n")
    for name, data in renamed.items():
        writer.writerow((name, "", "") if name == new_record else (name, _record_hash(data), len(data)))
    renamed[new_record] = record.getvalue().encode("utf-8")
    _verify_record(renamed, new_record)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for info, name in zip(infos, renamed):
            preserved_info = copy.copy(info)
            preserved_info.filename = name
            preserved_info.orig_filename = name
            archive.writestr(preserved_info, renamed[name])
    normalized_utils = renamed[UTILS_PATH].replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return output.getvalue(), hashlib.sha256(normalized_utils).hexdigest()


def build(input_wheel, output_directory):
    input_path = Path(input_wheel)
    if input_path.name != OFFICIAL_WHEEL or input_path.is_symlink() or not input_path.is_file():
        raise ValueError("input must be the regular file " + OFFICIAL_WHEEL)
    # Hash and ZIP validation use the same bounded snapshot, avoiding input races.
    with input_path.open("rb") as source:
        wheel_bytes = source.read(MAX_ARCHIVE_BYTES + 1)
    if len(wheel_bytes) > MAX_ARCHIVE_BYTES:
        raise ValueError("input wheel exceeds bounded archive size")
    if hashlib.sha256(wheel_bytes).hexdigest() != OFFICIAL_SHA256:
        raise ValueError("official wheel SHA256 mismatch")
    result, utils_sha256 = _build_bytes(wheel_bytes)

    directory = Path(output_directory)
    if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
        raise ValueError("output directory must be a nonsymlink directory")
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / OUTPUT_WHEEL
    try:
        target = destination.open("xb")
    except FileExistsError:
        if destination.is_symlink() or not destination.is_file():
            raise ValueError("output wheel path is not a regular file")
        with destination.open("rb") as existing:
            if existing.read(len(result) + 1) != result:
                raise ValueError("output wheel already exists with different content")
    else:
        try:
            with target:
                target.write(result)
        except BaseException:
            destination.unlink()
            raise
    return {
        "wheel": OUTPUT_WHEEL,
        "sha256": hashlib.sha256(result).hexdigest(),
        "utilsSha256": utils_sha256,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    command = subcommands.add_parser("build", help="build the pinned compatibility wheel")
    command.add_argument("input_wheel")
    command.add_argument("output_directory")
    args = parser.parse_args(argv)
    try:
        result = build(args.input_wheel, args.output_directory)
    except (OSError, ValueError, csv.Error, zipfile.BadZipFile, SyntaxError) as error:
        print("background_compat: " + str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
