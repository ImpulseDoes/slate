#!/usr/bin/env bash

set -euo pipefail

tag=$1
commit=$2

previous=$(git tag --merged "$commit" --list 'v[0-9]*' --sort=-v:refname | grep -vx "$tag" | head -n 1 || true)

echo "## Commits"
echo
git log "${previous:+$previous..}$commit" --no-merges --format='- %s (%h)' | sed 's/ --build//'

if [[ -n $previous && -n ${GITHUB_REPOSITORY:-} ]]; then
  echo
  echo "**Full changelog:** ${GITHUB_SERVER_URL:-https://github.com}/$GITHUB_REPOSITORY/compare/$previous...$tag"
fi