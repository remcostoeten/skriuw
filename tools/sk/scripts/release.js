#!/usr/bin/env node
/**
 * Auto-release script for @skriuw/sk
 * 
 * This script:
 * 1. Increments the patch version (0.0.1 -> 0.0.2)
 * 2. Builds the package
 * 3. Publishes to npm
 * 4. Creates a git tag
 * 5. Optionally pushes to git
 */

import { readFileSync, writeFileSync } from 'fs';
import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const projectRoot = path.join(__dirname, '../..');

function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

function incrementVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}. Expected format: x.y.z`);
  }
  
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);
  
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  // If version is 0.0.0, go to 1.0.0
  if (version === '0.0.0') {
    return '1.0.0';
  }

  // Increment patch version
  const newPatch = patch + 1;
  return `${major}.${minor}.${newPatch}`;
}

function updateVersion(newVersion) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
}

async function main() {
  try {
    const currentVersion = getCurrentVersion();
    const newVersion = incrementVersion(currentVersion);
    
    console.log(`📦 Current version: ${currentVersion}`);
    console.log(`🚀 New version: ${newVersion}`);
    console.log('');
    
    // Update package.json
    console.log('📝 Updating package.json...');
    updateVersion(newVersion);
    console.log('✅ Version updated');
    console.log('');
    
    // Build
    console.log('🔨 Building package...');
    await execa('npm', ['run', 'build'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✅ Build complete');
    console.log('');
    
    // Publish to npm
    console.log('📤 Publishing to npm...');
    await execa('npm', ['publish', '--access', 'public'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✅ Published to npm');
    console.log('');
    
    // Create git tag
    console.log('🏷️  Creating git tag...');
    const tagName = `v${newVersion}`;
    try {
      await execa('git', ['tag', tagName], { cwd: projectRoot, stdio: 'inherit' });
      console.log(`✅ Created tag: ${tagName}`);
    } catch (error) {
      console.log(`⚠️  Failed to create git tag (may already exist): ${error}`);
    }
    console.log('');
    
    // Ask if user wants to push
    const args = process.argv.slice(2);
    if (args.includes('--push')) {
      console.log('📤 Pushing to git...');
      await execa('git', ['push'], { cwd: projectRoot, stdio: 'inherit' });
      await execa('git', ['push', '--tags'], { cwd: projectRoot, stdio: 'inherit' });
      console.log('✅ Pushed to git');
    } else {
      console.log('💡 Tip: Run with --push to automatically push changes and tags to git');
    }
    
    console.log('');
    console.log(`🎉 Successfully released @skriuw/sk@${newVersion}`);
    
  } catch (error) {
    console.error('❌ Release failed:', error);
    process.exit(1);
  }
}

main();

