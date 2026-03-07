#!/bin/bash
set -euo pipefail

# Trigger iOS Build on GitHub Actions from Terminal
# Usage: ./scripts/ci-ios.sh [branch-name] [debug|release]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current branch if not specified
BRANCH="${1:-$(git -C "$PROJECT_ROOT" branch --show-current)}"
BUILD_TYPE="${2:-debug}"

echo -e "${BLUE}=== Triggering iOS Build on GitHub Actions ===${NC}"
echo "Branch: $BRANCH"
echo "Build type: $BUILD_TYPE"
echo ""

# Push branch if needed
if git -C "$PROJECT_ROOT" rev-parse --abbrev-ref --symbolic-full-name @{u} &>/dev/null; then
    echo "Pushing branch to origin..."
    git -C "$PROJECT_ROOT" push origin "$BRANCH"
fi

# Trigger workflow
echo -e "${YELLOW}Triggering workflow 'ios-build'...${NC}"
gh workflow run ios-build \
    --repo "$(git -C "$PROJECT_ROOT" remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')" \
    --ref "$BRANCH" \
    -f branch="$BRANCH" \
    -f build-type="$BUILD_TYPE"

echo ""
echo -e "${GREEN}Workflow triggered successfully!${NC}"
echo ""
echo "Monitor the build:"
echo "  Web:    $(gh run list --workflow=ios-build --limit 1 --json url --jq '.[0].url' 2>/dev/null || echo "Check GitHub Actions page")"
echo "  CLI:    gh run watch --workflow=ios-build"
echo ""
echo "After build completes:"
echo "  1. Download the 'ios-web-assets' artifact from GitHub"
echo "  2. Extract to packages/ios/WebAssets/"
echo "  3. On your Mac, run: ./scripts/build-ios-local.sh"
