#!/usr/bin/env bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Start time
START_TIME=$(date +%s)

echo ""
echo -e "${CYAN}${BOLD}🏗️  Skriuw Monorepo Build Pipeline${NC}"
echo -e "${CYAN}${BOLD}=====================================${NC}"
echo ""

# Track results
RESULTS=()
FAILED_TASKS=()

# Task 1: Type Checking
print_section "🔎 Type Checking"
if bun run check-types; then
    print_success "Type checking completed successfully"
    RESULTS+=("Type Checking: ✅")
else
    print_error "Type checking failed"
    RESULTS+=("Type Checking: ❌")
    FAILED_TASKS+=("Type Checking")
fi

# Task 2: Linting
print_section "🔍 Linting Code"
if bun run lint; then
    print_success "Linting completed successfully"
    RESULTS+=("Linting: ✅")
else
    print_error "Linting failed"
    RESULTS+=("Linting: ❌")
    FAILED_TASKS+=("Linting")
fi

# Task 3: Building Packages
print_section "📦 Building Packages"
if turbo run build --filter=packages/*; then
    print_success "Packages built successfully"
    RESULTS+=("Packages Build: ✅")
else
    print_error "Packages build failed"
    RESULTS+=("Packages Build: ❌")
    FAILED_TASKS+=("Packages Build")
fi

# Task 4: Building Applications
print_section "🚀 Building Applications"
if turbo run build --filter=apps/*; then
    print_success "Applications built successfully"
    RESULTS+=("Applications Build: ✅")
else
    print_error "Applications build failed"
    RESULTS+=("Applications Build: ❌")
    FAILED_TASKS+=("Applications Build")
fi

# Task 5: Building CLI Tools
print_section "🔧 Building CLI Tools"
if turbo run build:cli --filter=tools/*; then
    print_success "CLI tools built successfully"
    RESULTS+=("CLI Build: ✅")
else
    print_error "CLI tools build failed"
    RESULTS+=("CLI Build: ❌")
    FAILED_TASKS+=("CLI Build")
fi

# Task 6: Running Tests
print_section "🧪 Running Tests"
if bun run test; then
    print_success "All tests passed"
    RESULTS+=("Tests: ✅")
else
    print_error "Tests failed"
    RESULTS+=("Tests: ❌")
    FAILED_TASKS+=("Tests")
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Final Summary
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}  📊 BUILD SUMMARY${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""

for result in "${RESULTS[@]}"; do
    echo -e "  $result"
done

echo ""
if [ ${#FAILED_TASKS[@]} -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 All tasks completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}⏱️  Total time: ${MINUTES}m ${SECONDS}s${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}💥 Some tasks failed:${NC}"
    for task in "${FAILED_TASKS[@]}"; do
        echo -e "  ${RED}• $task${NC}"
    done
    echo ""
    echo -e "${BLUE}⏱️  Total time: ${MINUTES}m ${SECONDS}s${NC}"
    exit 1
fi