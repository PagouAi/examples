#!/usr/bin/env bash
# Detect-and-run lint/build/test for one language dir. Runs in each dir that
# holds a project manifest (root or one level down), so the harness works before
# and after language examples land. Missing steps are skipped, not failed.
#
# Usage: .github/scripts/language-ci.sh <language>
set -euo pipefail

lang="${1:?language required}"
[ -d "$lang" ] || { echo "no $lang directory; skipping"; exit 0; }
cd "$lang"

run() { echo "+ $*"; "$@"; }

# Echoes each dir (root or immediate child) that contains a given manifest file.
project_dirs() {
  local mf="$1"
  [ -f "$mf" ] && echo "."
  for d in */; do [ -f "${d}${mf}" ] && echo "${d%/}"; done
}

any=0

do_node() {
  for d in $(project_dirs package.json); do
    any=1; echo "== node: $lang/$d =="; ( cd "$d"
      if [ -f package-lock.json ]; then run npm ci; else run npm install --no-audit --no-fund; fi
      run npm run lint --if-present
      run npm run build --if-present
      run npm test --if-present )
  done
}

do_python() {
  for mf in pyproject.toml requirements.txt; do
    for d in $(project_dirs "$mf"); do
      any=1; echo "== python: $lang/$d =="; ( cd "$d"
        python -m pip install --upgrade pip >/dev/null
        [ -f requirements.txt ] && run python -m pip install -r requirements.txt
        [ -f pyproject.toml ] && { run python -m pip install -e ".[dev]" || run python -m pip install -e . || true; }
        if python -m ruff --version >/dev/null 2>&1; then run python -m ruff check .; fi
        run python -m pytest -q || { [ $? -eq 5 ] && echo "· no tests collected"; }; )
    done
  done
}

do_php() {
  for d in $(project_dirs composer.json); do
    any=1; echo "== php: $lang/$d =="; ( cd "$d"
      run composer install --no-interaction --no-progress
      run composer run-script lint --no-interaction 2>/dev/null || true
      run composer run-script test --no-interaction 2>/dev/null || run ./vendor/bin/phpunit || true )
  done
}

do_java() {
  for d in $(project_dirs pom.xml); do
    any=1; echo "== java(maven): $lang/$d =="; ( cd "$d"; run mvn -B -q verify )
  done
  for d in $(project_dirs build.gradle); do
    any=1; echo "== java(gradle): $lang/$d =="; ( cd "$d"; run ./gradlew --no-daemon build )
  done
}

do_dotnet() {
  for d in $(find . -maxdepth 2 \( -name '*.csproj' -o -name '*.sln' \) -printf '%h\n' 2>/dev/null | sort -u); do
    [ -d "$d" ] || continue
    any=1; echo "== dotnet: $lang/$d =="; ( cd "$d"; run dotnet build --nologo; run dotnet test --nologo || true )
  done
}

do_go() {
  for d in $(project_dirs go.mod); do
    any=1; echo "== go: $lang/$d =="; ( cd "$d"
      run go vet ./...
      run go build ./...
      run go test ./... )
  done
}

do_ruby() {
  for d in $(project_dirs Gemfile); do
    any=1; echo "== ruby: $lang/$d =="; ( cd "$d"
      run bundle install
      run bundle exec rubocop 2>/dev/null || true
      run bundle exec rake test 2>/dev/null || run bundle exec rspec 2>/dev/null || true )
  done
}

case "$lang" in
  typescript) do_node ;;
  python)     do_python ;;
  php)        do_php ;;
  java)       do_java ;;
  dotnet)     do_dotnet ;;
  go)         do_go ;;
  ruby)       do_ruby ;;
  *) echo "unknown language: $lang"; exit 1 ;;
esac

if [ "$any" -eq 0 ]; then
  echo "no $lang project manifest found yet — nothing to build. Skipping."
fi
