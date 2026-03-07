#!/bin/bash
set -euo pipefail

# iOS Local Build Script for WhisperCode
# Run this on your Mac after downloading web assets from GitHub Actions
# Usage: ./scripts/build-ios-local.sh [debug|release] [--install|--no-install] [--open] [--device NAME] [--udid ID] [--screenshot PATH]

BUILD_TYPE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/packages/ios"
XCODE_PROJECT="$IOS_DIR/WhisperCode/WhisperCode.xcodeproj"
BUILD_DIR="$IOS_DIR/build"
INSTALL=""
OPEN_SIMULATOR=0
DEVICE_NAME="iPhone 15"
SIM_UDID=""
SCREENSHOT_PATH=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

shift || true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --install)
            INSTALL=1
            ;;
        --no-install)
            INSTALL=0
            ;;
        --open)
            OPEN_SIMULATOR=1
            ;;
        --device)
            DEVICE_NAME="${2:?Missing value for --device}"
            shift
            ;;
        --udid)
            SIM_UDID="${2:?Missing value for --udid}"
            shift
            ;;
        --screenshot)
            SCREENSHOT_PATH="${2:?Missing value for --screenshot}"
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            exit 1
            ;;
    esac
    shift
done

echo -e "${GREEN}=== WhisperCode iOS Local Build ===${NC}"
echo "Build type: $BUILD_TYPE"
echo ""

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script must be run on macOS${NC}"
    echo "Please remote into your Mac and run this script there."
    exit 1
fi

# Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: Xcode not found${NC}"
    echo "Install Xcode from the App Store"
    exit 1
fi

# Check for web assets
if [ ! -d "$IOS_DIR/WebAssets" ]; then
    echo -e "${YELLOW}Warning: WebAssets not found at $IOS_DIR/WebAssets${NC}"
    echo "You need to either:"
    echo "  1. Build web assets locally: cd packages/ios && bun run build"
    echo "  2. Download from GitHub Actions workflow 'ios-build'"
    exit 1
fi

echo -e "${GREEN}Web assets found${NC}"

# Determine build configuration and destination
if [ "$BUILD_TYPE" == "release" ]; then
    CONFIG="Release"
    echo "Building Release configuration..."
else
    CONFIG="Debug"
    echo "Building Debug configuration..."
fi

# Check for available simulators
echo "Checking available simulators..."
if [ -n "$SIM_UDID" ]; then
    DESTINATION="id=$SIM_UDID"
else
    DESTINATION=$(xcodebuild -project "$XCODE_PROJECT" -scheme WhisperCode -showdestinations 2>/dev/null | grep "platform:iOS Simulator" | grep "$DEVICE_NAME" | head -1 | sed 's/.*ID:\([A-Z0-9-]*\).*/\1/' || echo "")

    if [ -z "$DESTINATION" ]; then
        echo "Using default simulator name: $DEVICE_NAME"
        DESTINATION="platform=iOS Simulator,name=$DEVICE_NAME"
    else
        DESTINATION="id=$DESTINATION"
    fi
fi

echo "Destination: $DESTINATION"
echo ""

# Build the app
echo -e "${GREEN}Building iOS app...${NC}"
xcodebuild \
    -project "$XCODE_PROJECT" \
    -scheme WhisperCode \
    -configuration "$CONFIG" \
    -destination "$DESTINATION" \
    -derivedDataPath "$BUILD_DIR" \
    clean build \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO

# Find the built app
APP_PATH=$(find "$BUILD_DIR" -name "WhisperCode.app" -type d | head -1)

if [ -z "$APP_PATH" ]; then
    echo -e "${RED}Error: Could not find built app${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Build Successful ===${NC}"
echo "App location: $APP_PATH"
echo ""

if [ -z "$INSTALL" ] && [ "$BUILD_TYPE" == "debug" ] && [ -t 0 ]; then
    echo "Would you like to install and run on the simulator? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        INSTALL=1
    else
        INSTALL=0
    fi
fi

if [ "${INSTALL:-0}" == "1" ]; then
    echo "Installing to simulator..."

    if [ -z "$SIM_UDID" ]; then
        SIM_UDID=$(xcrun simctl list devices booted | grep -E "iPhone|iPad" | grep -oE '[A-Z0-9]{8}-([A-Z0-9]{4}-){3}[A-Z0-9]{12}' | head -1 || true)
    fi

    if [ -z "$SIM_UDID" ]; then
        echo "No booted simulator found. Booting $DEVICE_NAME..."
        SIM_UDID=$(xcrun simctl list devices available | grep "$DEVICE_NAME" | grep -oE '[A-Z0-9]{8}-([A-Z0-9]{4}-){3}[A-Z0-9]{12}' | head -1 || true)
    fi

    if [ -z "$SIM_UDID" ]; then
        echo -e "${RED}Error: Could not find a simulator for $DEVICE_NAME${NC}"
        exit 1
    fi

    xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
    sleep 5

    echo "Installing to simulator: $SIM_UDID"
    xcrun simctl install "$SIM_UDID" "$APP_PATH"

    echo "Launching app..."
    xcrun simctl launch "$SIM_UDID" com.devgriffin.whispercode

    if [ "$OPEN_SIMULATOR" == "1" ]; then
        echo "Opening Simulator app..."
        open -a Simulator
    fi

    if [ -n "$SCREENSHOT_PATH" ]; then
        mkdir -p "$(dirname "$SCREENSHOT_PATH")"
        echo "Capturing screenshot: $SCREENSHOT_PATH"
        xcrun simctl io "$SIM_UDID" screenshot "$SCREENSHOT_PATH"
    fi

    echo -e "${GREEN}App installed and launched!${NC}"
fi

echo ""
echo "To build for device, you need to:"
echo "  1. Open $XCODE_PROJECT in Xcode"
echo "  2. Connect your iPhone"
echo "  3. Select your device and build"
