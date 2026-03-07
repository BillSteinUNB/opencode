#!/bin/bash
set -euo pipefail

# Remote iOS simulator workflow from a Windows/Linux terminal.
# Usage: ./scripts/ios-remote.sh <user@host> [branch] [debug|release]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="${1:-${IOS_MAC_HOST:-}}"
BRANCH="${2:-$(git -C "$PROJECT_ROOT" branch --show-current)}"
BUILD_TYPE="${3:-debug}"
REMOTE_DIR="${IOS_REMOTE_DIR:-$PROJECT_ROOT}"
DEVICE_NAME="${IOS_SIMULATOR_NAME:-iPhone 15}"
SCREENSHOT_PATH="${IOS_SCREENSHOT_PATH:-$REMOTE_DIR/packages/ios/build/whispercode-sim.png}"
ARTIFACT_NAME="ios-web-assets-$BUILD_TYPE"
TMP_DIR="$(mktemp -d)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [ -z "$HOST" ]; then
    echo -e "${RED}Usage: ./scripts/ios-remote.sh <user@host> [branch] [debug|release]${NC}"
    echo "Or set IOS_MAC_HOST in your environment."
    exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
    echo -e "${RED}Error: gh CLI is required${NC}"
    exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
    echo -e "${RED}Error: ssh is required${NC}"
    exit 1
fi

REPO="$(git -C "$PROJECT_ROOT" remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')"

echo -e "${BLUE}=== Remote iOS Simulator Build ===${NC}"
echo "Host: $HOST"
echo "Branch: $BRANCH"
echo "Build type: $BUILD_TYPE"
echo "Device: $DEVICE_NAME"
echo ""

echo -e "${YELLOW}Resolving latest completed ios-build run...${NC}"
RUN_ID="$(gh run list --repo "$REPO" --workflow ios-build --branch "$BRANCH" --json databaseId,status,conclusion --jq 'map(select(.status == "completed" and .conclusion == "success")) | .[0].databaseId' 2>/dev/null || true)"

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    echo -e "${RED}Error: No successful ios-build run found for branch $BRANCH${NC}"
    echo "Trigger one first with ./scripts/ci-ios.sh $BRANCH $BUILD_TYPE"
    exit 1
fi

echo "Run id: $RUN_ID"
echo -e "${YELLOW}Downloading artifact $ARTIFACT_NAME...${NC}"
gh run download "$RUN_ID" --repo "$REPO" -n "$ARTIFACT_NAME" -D "$TMP_DIR/artifact"

ASSET_DIR="$TMP_DIR/artifact"
if [ -d "$ASSET_DIR/$ARTIFACT_NAME" ]; then
    ASSET_DIR="$ASSET_DIR/$ARTIFACT_NAME"
fi

if [ ! -f "$ASSET_DIR/index.html" ]; then
    echo -e "${RED}Error: Downloaded artifact does not contain index.html${NC}"
    exit 1
fi

echo -e "${YELLOW}Syncing WebAssets to Mac...${NC}"
tar -C "$ASSET_DIR" -cf - . | ssh "$HOST" "mkdir -p '$REMOTE_DIR/packages/ios/WebAssets' && rm -rf '$REMOTE_DIR/packages/ios/WebAssets'/* && tar -C '$REMOTE_DIR/packages/ios/WebAssets' -xf -"

echo -e "${YELLOW}Updating branch on Mac...${NC}"
ssh "$HOST" "cd '$REMOTE_DIR' && git fetch origin '$BRANCH' && git checkout '$BRANCH' && git pull --ff-only origin '$BRANCH'"

echo -e "${YELLOW}Building and installing in simulator...${NC}"
ssh "$HOST" "cd '$REMOTE_DIR' && ./scripts/build-ios-local.sh '$BUILD_TYPE' --install --device '$DEVICE_NAME' --screenshot '$SCREENSHOT_PATH'"

echo -e "${GREEN}Remote simulator build finished${NC}"
echo "Screenshot on Mac: $SCREENSHOT_PATH"
