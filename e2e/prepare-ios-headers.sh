#!/bin/bash
# Expo SDK 57's prebuilt-hermes pipeline doesn't expose hermes headers to
# Release builds: ExpoModulesJSI's Package.swift looks for headers at
# Pods/Headers/Public/hermes-engine, and pods like Expo include
# <hermes/hermes.h> which must resolve via Pods/Headers/Public. Neither
# link is created by `pod install` (see expo/expo#45484 for the family of
# JSI header-path issues). These two symlinks fix both. Idempotent; runs
# as part of `npm run e2e:build`, and ios/ is gitignored so they must be
# re-created after every `pod install` anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

ln -sfn ../../hermes-engine/destroot/include ios/Pods/Headers/Public/hermes-engine
ln -sfn ../../hermes-engine/destroot/include/hermes ios/Pods/Headers/Public/hermes
echo "[e2e] hermes header symlinks in place"
