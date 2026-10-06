#!/usr/bin/env bash
# Build both portable targets from the same complete, checksum-pinned source inputs.
set -euo pipefail
platform="${1:?Expected win32 or linux}"; output="${2:?Expected empty output directory}"; work="${3:?Expected disposable build directory}"
case "$platform" in win32|linux) ;; *) echo 'Unsupported media platform' >&2; exit 1;; esac
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$script_dir/.." && pwd)"
mkdir -p "$output" "$work"
output="$(cd "$output" && pwd)"; work="$(cd "$work" && pwd)"
[[ -z "$(find "$output" -mindepth 1 -print -quit)" ]] || { echo 'Media output must be empty' >&2; exit 1; }
[[ "$output" != / && "$work" != / && "$output" != "$repo" && "$work" != "$repo" && "$output" != "$work" ]] || exit 1
python_bin="${PYTHON:-python3}"
policy="$repo/defaults/MediaTools/source-build-manifest.json"
mkdir -p "$work/downloads" "$work/src" "$work/prefix" "$output/bin" "$output/corresponding-source" "$output/build-evidence" "$output/licenses"
"$python_bin" - "$policy" "$work" "$output" <<'PY'
import hashlib,json,pathlib,sys,tarfile,urllib.request
policy,work,out=map(pathlib.Path,sys.argv[1:]);p=json.loads(policy.read_text())
for s in p['sources']:
 archive=work/'downloads'/f"{s['name']}.tar.gz"
 if not archive.exists():
  with urllib.request.urlopen(s['url'],timeout=180) as r: archive.write_bytes(r.read())
 data=archive.read_bytes()
 if len(data)!=s['bytes'] or hashlib.sha256(data).hexdigest()!=s['sha256']:raise SystemExit(f"Source checksum mismatch: {s['name']}")
 (out/'corresponding-source'/archive.name).write_bytes(data)
 dest=work/'src'/s['name'];dest.mkdir(parents=True,exist_ok=True)
 if any(dest.iterdir()):raise SystemExit(f"Source extraction must be fresh: {dest}")
 with tarfile.open(archive) as t:
  for m in t.getmembers():
   parts=pathlib.PurePosixPath(m.name).parts
   if len(parts)<2:continue
   if m.issym() or m.islnk() or not(m.isdir() or m.isfile()) or '..' in parts:raise SystemExit('Unsafe source archive')
   m.name='/'.join(parts[1:]);t.extract(m,dest,filter='data')
PY
cp "$policy" "$output/corresponding-source/source-build-manifest.json"
cp "$0" "$output/corresponding-source/build-media-from-source.sh"
printf '%s\n' 'Complete corresponding source: the five original archives, pinned policy, and this build script.' 'No source patches are applied. Generated configure evidence is retained in build-evidence.' 'Licenses: ffmpeg/COPYING.GPLv3, x264/COPYING, vpx/LICENSE, webp/COPYING and zlib/LICENSE; copies are in ../licenses/.' 'Build with the tools listed in the repository release workflow; run this script with platform, empty output, and fresh work arguments.' > "$output/corresponding-source/README.txt"
for pair in 'ffmpeg:COPYING.GPLv3' 'x264:COPYING' 'vpx:LICENSE' 'webp:COPYING' 'zlib:LICENSE'; do
 name="${pair%%:*}"; license="${pair#*:}"
 cp "$work/src/$name/$license" "$output/licenses/$name.txt"
done
printf '%s\n' 'Umbra bundled FFmpeg is GPL-3.0-or-later. x264 is GPL-2.0-or-later; libvpx/libwebp use BSD licenses; zlib uses the zlib license.' 'Exact original license texts are in licenses/. Full original sources and build recipe are in corresponding-source/.' 'No extra linked media libraries or source patches are included; OS libraries remain system dependencies.' > "$output/NOTICE.txt"
prefix="$work/prefix"
# Do not use host optional libraries: all linked media libraries come from this prefix.
export PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig:$prefix/lib64/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export CFLAGS='-O2'; export CXXFLAGS='-O2'; export LDFLAGS='-static'
jobs="${UMBRA_MEDIA_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}"
{ gcc --version; make --version; cmake --version; nasm -v; pkg-config --version; uname -a; } > "$output/build-evidence/toolchain.txt"
cmake -S "$work/src/zlib" -B "$work/zlib-build" -G 'Unix Makefiles' -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_BUILD_TYPE=Release -DZLIB_BUILD_SHARED=OFF -DZLIB_BUILD_STATIC=ON -DZLIB_BUILD_TESTING=OFF
cmake --build "$work/zlib-build" --parallel "$jobs"
cmake --install "$work/zlib-build"
cp "$work/zlib-build/CMakeCache.txt" "$output/build-evidence/zlib-config.txt"
cd "$work/src/x264"
x264_flags=(--prefix="$prefix" --enable-static --disable-shared --disable-cli --enable-pic)
if [[ "$platform" == win32 ]]; then x264_flags+=(--host=x86_64-w64-mingw32); fi
./configure "${x264_flags[@]}"
make -j"$jobs"; make install
cp config.mak "$output/build-evidence/x264-config.txt"
cd "$work/src/vpx"
vpx_target=x86_64-linux-gcc; [[ "$platform" != win32 ]] || vpx_target=x86_64-win64-gcc
./configure --prefix="$prefix" --target="$vpx_target" --enable-static --disable-shared --enable-pic --disable-examples --disable-tools --disable-docs --disable-unit-tests
make -j"$jobs"; make install
cp config.mk "$output/build-evidence/vpx-config.txt"
webp_flags=()
for flag in ANIM_UTILS CWEBP DWEBP GIF2WEBP IMG2WEBP VWEBP WEBPINFO WEBPMUX EXTRAS FUZZTEST; do webp_flags+=("-DWEBP_BUILD_${flag}=OFF"); done
cmake -S "$work/src/webp" -B "$work/webp-build" -G 'Unix Makefiles' -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWEBP_LINK_STATIC=ON "${webp_flags[@]}"
cmake --build "$work/webp-build" --parallel "$jobs"
cmake --install "$work/webp-build"
cp "$work/webp-build/CMakeCache.txt" "$output/build-evidence/webp-config.txt"
cd "$work/src/ffmpeg"
ff_flags=(--prefix="$work/ffmpeg-install" --disable-autodetect --enable-gpl --enable-version3 --disable-debug --disable-doc --disable-ffplay --disable-shared --enable-static --enable-libx264 --enable-libvpx --enable-libwebp --enable-zlib --pkg-config-flags=--static --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static" --extra-version=umbra-source-1)
if [[ "$platform" == win32 ]]; then ff_flags+=(--target-os=mingw32 --arch=x86_64); fi
printf '%s\n' "${ff_flags[@]}" > "$output/build-evidence/ffmpeg-configure-args.txt"
./configure "${ff_flags[@]}"
make -j"$jobs"; make install
suffix=''; [[ "$platform" != win32 ]] || suffix='.exe'
cp "$work/ffmpeg-install/bin/ffmpeg$suffix" "$work/ffmpeg-install/bin/ffprobe$suffix" "$output/bin/"
cp COPYING.GPLv3 "$output/LICENSE.txt"
cp ffbuild/config.mak "$output/build-evidence/ffmpeg-config.txt"
"$output/bin/ffmpeg$suffix" -hide_banner -buildconf > "$output/BUILD-CONFIG.txt" 2>&1
"$output/bin/ffmpeg$suffix" -hide_banner -encoders > "$output/build-evidence/encoders.txt" 2>&1
"$output/bin/ffmpeg$suffix" -hide_banner -decoders > "$output/build-evidence/decoders.txt" 2>&1
"$output/bin/ffprobe$suffix" -version > "$output/build-evidence/ffprobe-version.txt" 2>&1
if [[ "$platform" == win32 ]]; then
 objdump -p "$output/bin/ffmpeg.exe" "$output/bin/ffprobe.exe" > "$output/build-evidence/native-dependencies.txt"
 "$python_bin" - "$output/build-evidence/native-dependencies.txt" <<'PY'
import pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text();allowed={'kernel32.dll','user32.dll','advapi32.dll','shell32.dll','ole32.dll','ws2_32.dll','bcrypt.dll','secur32.dll','ntdll.dll','winmm.dll','ucrtbase.dll','msvcrt.dll','gdi32.dll','vfw32.dll','comdlg32.dll','avicap32.dll','shlwapi.dll','oleaut32.dll','crypt32.dll'}
for name in re.findall(r'DLL Name:\s*(\S+)',text):
 if name.lower() not in allowed and not name.lower().startswith('api-ms-win-'):raise SystemExit(f'Unexpected non-system DLL: {name}')
PY
else
 if ldd "$output/bin/ffmpeg" > "$output/build-evidence/native-dependencies.txt" 2>&1; then echo 'Expected fully static Linux executable' >&2; exit 1; fi
fi
"$python_bin" - "$output" <<'PY'
import pathlib,re,sys,json
out=pathlib.Path(sys.argv[1]);p=json.loads((out/'corresponding-source/source-build-manifest.json').read_text());enc=(out/'build-evidence/encoders.txt').read_text()
for name in p['requiredEncoders']:
 if not re.search(r'\b'+re.escape(name)+r'\b',enc):raise SystemExit(f'Missing required encoder: {name}')
PY
"$python_bin" - "$output" "$work" "$platform" <<'PY'
import json,pathlib,subprocess,sys
out,work=map(pathlib.Path,sys.argv[1:3]);suffix='.exe' if sys.argv[3]=='win32' else '';ff=str(out/'bin'/('ffmpeg'+suffix));probe=str(out/'bin'/('ffprobe'+suffix));smoke=work/'smoke';smoke.mkdir()
def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:raise SystemExit(r.stderr)
 return r.stdout
run([ff,'-hide_banner','-y','-f','lavfi','-i','testsrc2=size=64x64:rate=5','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',str(smoke/'h264.mp4')])
run([ff,'-hide_banner','-y','-i',str(smoke/'h264.mp4'),'-frames:v','1','-c:v','png','-threads','1',str(smoke/'png.png')])
run([ff,'-hide_banner','-y','-i',str(smoke/'h264.mp4'),'-frames:v','1','-c:v','libwebp','-threads','1',str(smoke/'webp.webp')])
run([ff,'-hide_banner','-y','-i',str(smoke/'h264.mp4'),'-an','-c:v','libvpx-vp9','-threads','1',str(smoke/'vp9.webm')])
results=[]
for name,codecs in [('h264.mp4',{'h264','aac'}),('png.png',{'png'}),('webp.webp',{'webp'}),('vp9.webm',{'vp9'})]:
 info=json.loads(run([probe,'-v','error','-show_streams','-of','json',str(smoke/name)]))
 actual={stream['codec_name'] for stream in info['streams']}
 if actual!=codecs:raise SystemExit(f'Unexpected smoke codecs: {name}: {actual}')
 run([ff,'-v','error','-i',str(smoke/name),'-f','null','-'])
 results.append(dict(file=name,codecs=sorted(actual),decodePassed=True))
(out/'build-evidence/smoke-results.json').write_text(json.dumps(dict(platform=sys.argv[3],passed=True,results=results),indent=2)+'\n')
PY
printf '%s\n' 'Pinned-source FFmpeg build complete.'
