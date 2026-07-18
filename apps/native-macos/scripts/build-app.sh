#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$APP_ROOT"
swift build -c release

BIN_DIR="$(swift build -c release --show-bin-path)"
APP_PATH="$APP_ROOT/.build/Nolira Build Native.app"
CONTENTS_PATH="$APP_PATH/Contents"

rm -rf "$APP_PATH"
mkdir -p "$CONTENTS_PATH/MacOS" "$CONTENTS_PATH/Resources"
cp "$BIN_DIR/NoliraBuildNative" "$CONTENTS_PATH/MacOS/NoliraBuildNative"
cp "$APP_ROOT/Resources/Info.plist" "$CONTENTS_PATH/Info.plist"

codesign --force --deep --sign - "$APP_PATH"
printf '%s\n' "Built $APP_PATH"
