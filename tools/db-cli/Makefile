.PHONY: build install clean

BINARY_NAME=db-cli
BUILD_DIR=../../bin

build:
	@echo "📦 Building $(BINARY_NAME)..."
	@go mod tidy
	@go build -o $(BUILD_DIR)/$(BINARY_NAME) .
	@echo "✅ Built: $(BUILD_DIR)/$(BINARY_NAME)"

build-all: build-linux build-darwin build-windows

build-linux:
	@echo "📦 Building for Linux..."
	@GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 .
	@GOOS=linux GOARCH=arm64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 .

build-darwin:
	@echo "📦 Building for macOS..."
	@GOOS=darwin GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 .
	@GOOS=darwin GOARCH=arm64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 .

build-windows:
	@echo "📦 Building for Windows..."
	@GOOS=windows GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe .

install: build
	@echo "📥 Installing to /usr/local/bin..."
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/$(BINARY_NAME)
	@echo "✅ Installed! Run: $(BINARY_NAME)"

clean:
	@rm -f $(BUILD_DIR)/$(BINARY_NAME)*
	@echo "🧹 Cleaned build artifacts"

run:
	@go run .

dev:
	@go run . 
