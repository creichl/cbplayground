# Sourced by run.sh after "npx playwright install chromium".
#
# Chromium needs system libraries (glib, nss, atk, X11, gbm, …) and a font. The toolkit "Browser for Playwright" brings
# them; without it, and without root for "playwright install --with-deps", this fetches the Ubuntu packages that contain
# them into a cache folder and points Chromium at them (LD_LIBRARY_PATH, FONTCONFIG_FILE). When Chromium finds all its
# libraries already, nothing happens. Only for Ubuntu 24.04 (noble) on amd64, like the agent container.
# The packages are checked like apt does: the signed InRelease with the Ubuntu archive key, Packages.gz by its SHA-256
# from there, every package by its SHA-256 from Packages.gz.

browser_libs_packages=(
  libglib2.0-0t64 libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libdbus-1-3 libasound2t64
  libx11-6 libxcb1 libxau6 libxdmcp6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxrender1 libxi6
  libxkbcommon0 libgbm1 libdrm2 libwayland-server0 libxshmfence1 libxcb-randr0 libexpat1 libffi8 libpcre2-8-0 libbsd0
  libmd0 libpng16-16t64 libfreetype6 libfontconfig1 fontconfig-config fonts-dejavu-core
)

browser_libs_shell=$(find "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}" -path '*chromium_headless_shell-*' -type f -name chrome-headless-shell | head -n 1)
if [ -z "$browser_libs_shell" ]; then
  echo "chrome-headless-shell not found; 'npx playwright install chromium' has to run first." >&2
  exit 1
fi

browser_libs_missing() {
  ldd "$browser_libs_shell" | grep -q 'not found'
}

browser_libs_fetch() {
  local cache=$1 archive=http://archive.ubuntu.com/ubuntu work file sum pkg
  work=$cache/download
  mkdir -p "$work"

  curl -fsS -o "$work/InRelease" "$archive/dists/noble/InRelease"
  gpgv --keyring /usr/share/keyrings/ubuntu-archive-keyring.gpg --output "$work/Release" "$work/InRelease" 2>/dev/null \
    || { echo "The signature of the Ubuntu archive's InRelease does not check out." >&2; return 1; }
  sum=$(awk '/^SHA256:/ {s=1; next} /^[^ ]/ {s=0} s && $3 == "main/binary-amd64/Packages.gz" {print $1}' "$work/Release")
  curl -fsS -o "$work/Packages.gz" "$archive/dists/noble/main/binary-amd64/Packages.gz"
  echo "$sum  $work/Packages.gz" | sha256sum -c --quiet - || return 1
  gunzip "$work/Packages.gz"

  mkdir -p "$cache/root"
  for pkg in "${browser_libs_packages[@]}"; do
    file=''
    read -r file sum < <(awk -v p="$pkg" '
      $1 == "Package:" {cur = $2; f = ""; s = ""}
      cur == p && $1 == "Filename:" {f = $2}
      cur == p && $1 == "SHA256:" {s = $2}
      cur == p && f != "" && s != "" {print f, s; exit}' "$work/Packages") || true
    [ -n "$file" ] || { echo "Package $pkg is not in noble/main." >&2; return 1; }
    curl -fsS -o "$work/package.deb" "$archive/$file"
    echo "$sum  $work/package.deb" | sha256sum -c --quiet - || return 1
    dpkg-deb -x "$work/package.deb" "$cache/root"
  done

  cat > "$cache/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$cache/root/usr/share/fonts</dir>
  <cachedir>$cache/fontcache</cachedir>
</fontconfig>
EOF
  rm -rf "$work"
  touch "$cache/complete"
}

if browser_libs_missing; then
  if ! grep -q '^VERSION_CODENAME=noble$' /etc/os-release || [ "$(dpkg --print-architecture)" != amd64 ]; then
    echo "Chromium is missing system libraries, and fetching them is only set up for Ubuntu 24.04 on amd64." >&2
    echo "Install the toolkit \"Browser for Playwright\" or run 'npx playwright install --with-deps chromium' as root." >&2
    exit 1
  fi
  browser_libs_cache=${XDG_CACHE_HOME:-$HOME/.cache}/cbplayground-browser-libs
  if [ ! -f "$browser_libs_cache/complete" ]; then
    echo "Chromium is missing system libraries; fetching them into $browser_libs_cache"
    rm -rf "$browser_libs_cache"
    browser_libs_fetch "$browser_libs_cache"
  fi
  export LD_LIBRARY_PATH="$browser_libs_cache/root/usr/lib/x86_64-linux-gnu:$browser_libs_cache/root/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export FONTCONFIG_FILE="$browser_libs_cache/fonts.conf"
  if browser_libs_missing; then
    echo "Chromium still misses system libraries after fetching them:" >&2
    ldd "$browser_libs_shell" | grep 'not found' >&2
    exit 1
  fi
fi
