#!/usr/bin/env bash

# Builds the FFmpeg that Slate bundles on macOS and Linux: one self-contained
# program with x264, x265, dav1d, zimg for HDR and the whisper filter that automatic captions
# run on. Windows gets a ready-made build instead (scripts/fetch-ffmpeg.ts), but
# nobody publishes one with whisper for these two systems
#
#   scripts/build-ffmpeg.sh <output file>
#
# Needs a C/C++ compiler, make, autotools, cmake, meson, ninja, pkg-config and curl, plus
# nasm on x86_64. Runs on the bash 3.2 macOS ships. Set WORK to keep the sources and libraries between runs

set -euo pipefail

FFMPEG_VERSION=9.0.2
FFMPEG_SHA256=8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e
X264_COMMIT=b35605ace3ddf7c1a5d67a2eb553f034aef41d55
X264_SHA256=6eeb82934e69fd51e043bd8c5b0d152839638d1ce7aa4eea65a3fedcf83ff224
X265_VERSION=4.1
X265_SHA256=a31699c6a89806b74b0151e5e6a7df65de4b49050482fe5ebf8a4379d7af8f29
DAV1D_VERSION=1.5.4
DAV1D_SHA256=686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5
ZIMG_VERSION=3.0.6
ZIMG_SHA256=be89390f13a5c9b2388ce0f44a5e89364a20c1c57ce46d382b1fcc3967057577
WHISPER_VERSION=1.9.5
WHISPER_SHA256=ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720

out=${1:?usage: build-ffmpeg.sh <output file>}
case $out in /*) ;; *) out="$PWD/$out" ;; esac
work=${WORK:-$(mktemp -d)}
mkdir -p "$work/src"
work=$(cd "$work" && pwd)
prefix="$work/prefix"
mkdir -p "$prefix/lib/pkgconfig" "$prefix/include"
export PKG_CONFIG_PATH="$prefix/lib/pkgconfig"

os=$(uname -s)
arch=$(uname -m)
jobs=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)
# The oldest macOS Tauri 2 runs on.
[ "$os" = Darwin ] && export MACOSX_DEPLOYMENT_TARGET=11.0

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

# Downloads an archive once, checks it and unpacks it into $work/src.
fetch() {
  local url=$1 sum=$2 file="$work/$3"
  [ -f "$file" ] || curl -fsSL --retry 3 -o "$file" "$url"
  local got
  got=$(sha256 "$file")
  if [ "$got" != "$sum" ]; then
    echo "Checksum mismatch for $url: got $got" >&2
    rm -f "$file"
    exit 1
  fi
  tar -xf "$file" -C "$work/src"
}

step() { echo; echo "=== $*"; }

step "x264"
fetch "https://code.videolan.org/videolan/x264/-/archive/$X264_COMMIT/x264-$X264_COMMIT.tar.bz2" $X264_SHA256 x264.tar.bz2
(
  cd "$work/src/x264-$X264_COMMIT"
  ./configure --prefix="$prefix" --enable-static --enable-pic --disable-cli --disable-opencl
  make -j"$jobs"
  make install
)

step "x265"
fetch "https://download.videolan.org/pub/videolan/x265/x265_$X265_VERSION.tar.gz" $X265_SHA256 x265.tar.gz
# CMake 4 refuses the old policies x265 asks for. With the new ones Apple's compiler reports as AppleClang, so match it too.
perl -pi -e 's/cmake_policy\(SET (CMP0025|CMP0054) OLD\)/cmake_policy(SET $1 NEW)/; s/if\(\$\{CMAKE_CXX_COMPILER_ID\} STREQUAL "Clang"\)/if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")/' "$work/src/x265_$X265_VERSION/source/CMakeLists.txt"
x265_flags=()
# Macs have no SVE; the rest is picked per chip when it runs.
[ "$os" = Darwin ] && [ "$arch" = arm64 ] && x265_flags+=(-DENABLE_SVE=OFF -DENABLE_SVE2=OFF)
cmake -S "$work/src/x265_$X265_VERSION/source" -B "$work/build-x265" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DENABLE_SHARED=OFF -DENABLE_CLI=OFF -DENABLE_PIC=ON -DENABLE_LIBNUMA=OFF ${x265_flags[@]+"${x265_flags[@]}"}
cmake --build "$work/build-x265" -j "$jobs"
cmake --install "$work/build-x265"

step "dav1d"
fetch "https://download.videolan.org/pub/videolan/dav1d/$DAV1D_VERSION/dav1d-$DAV1D_VERSION.tar.xz" $DAV1D_SHA256 dav1d.tar.xz
meson setup "$work/build-dav1d" "$work/src/dav1d-$DAV1D_VERSION" --prefix="$prefix" --libdir=lib \
  --buildtype=release --default-library=static -Denable_tools=false -Denable_tests=false
ninja -C "$work/build-dav1d" install

step "zimg"
fetch "https://github.com/sekrit-twc/zimg/archive/refs/tags/release-$ZIMG_VERSION.tar.gz" $ZIMG_SHA256 zimg.tar.gz
(
  cd "$work/src/zimg-release-$ZIMG_VERSION"
  # Homebrew installs GNU libtoolize as glibtoolize, beside Apple's own libtool.
  if command -v glibtoolize >/dev/null; then export LIBTOOLIZE=glibtoolize; fi
  ./autogen.sh
  # Its .pc names the C++ runtime a static link needs, libstdc++ unless told otherwise.
  stl=-lstdc++
  [ "$os" = Darwin ] && stl=-lc++
  STL_LIBS=$stl ./configure --prefix="$prefix" --libdir="$prefix/lib" --enable-static --disable-shared --with-pic
  make -j"$jobs"
  make install
)

step "whisper.cpp"
fetch "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$WHISPER_VERSION.tar.gz" $WHISPER_SHA256 whisper.tar.gz
whisper_flags=()
# Without native tuning the x86 build falls back to plain SSE, and whisper crawls.
[ "$arch" = x86_64 ] && whisper_flags+=(-DGGML_SSE42=ON -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_BMI2=ON)
whisper_src="$work/src/whisper.cpp-$WHISPER_VERSION"
cmake -S "$whisper_src" -B "$work/build-whisper" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_POSITION_INDEPENDENT_CODE=ON -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=OFF -DWHISPER_BUILD_SERVER=OFF \
  -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DGGML_METAL=OFF -DGGML_BLAS=OFF -DGGML_CCACHE=OFF ${whisper_flags[@]+"${whisper_flags[@]}"}
cmake --build "$work/build-whisper" --target whisper -j "$jobs"
find "$work/build-whisper" -name 'lib*.a' -exec cp {} "$prefix/lib/" \;
cp "$whisper_src/include/whisper.h" "$whisper_src"/ggml/include/*.h "$prefix/include/"
# whisper's own .pc lists the shared libraries; a static link needs every ggml part, in order.
if [ "$os" = Darwin ]; then
  whisper_libs="-lwhisper -lggml -lggml-cpu -lggml-base -lc++ -framework Accelerate"
else
  whisper_libs="-Wl,--start-group -lwhisper -lggml -lggml-cpu -lggml-base -Wl,--end-group -lstdc++ -lm -lpthread"
fi
cat > "$prefix/lib/pkgconfig/whisper.pc" <<EOF
prefix=$prefix
libdir=\${prefix}/lib
includedir=\${prefix}/include

Name: whisper
Description: whisper.cpp, linked statically
Version: $WHISPER_VERSION
Libs: -L\${libdir} $whisper_libs
Cflags: -I\${includedir}
EOF

step "FFmpeg"
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" $FFMPEG_SHA256 ffmpeg.tar.xz
(
  cd "$work/src/ffmpeg-$FFMPEG_VERSION"
  # No autodetect: whatever else the build machine has installed must not end up as a dependency.
  ./configure --prefix="$prefix" --pkg-config-flags=--static \
    --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib" \
    --disable-autodetect --enable-pthreads --enable-zlib \
    --enable-gpl --enable-version3 \
    --enable-libx264 --enable-libx265 --enable-libdav1d --enable-libzimg --enable-whisper \
    --disable-ffplay --disable-ffprobe --disable-doc --disable-debug \
    --enable-static --disable-shared
  make -j"$jobs"
  mkdir -p "$(dirname "$out")"
  cp ffmpeg "$out"
)
strip "$out"
# Stripping breaks the signature every Apple-silicon program must carry, so sign it again (ad hoc).
[ "$os" = Darwin ] && codesign --force --sign - "$out"

step "Check"
"$out" -hide_banner -version | head -1
for need in "filters: whisper" "filters: zscale" "filters: tonemap" "filters: arnndn" "encoders: libx264" "encoders: libx265" "decoders: libdav1d" "encoders: prores_ks"; do
  list=${need%%:*}
  name=${need#*: }
  if ! "$out" -hide_banner -"$list" 2>/dev/null | grep -qw "$name"; then
    echo "The new FFmpeg is missing $name." >&2
    exit 1
  fi
done
if [ "$os" = Darwin ]; then otool -L "$out"; else ldd "$out"; fi
echo "Saved $out"