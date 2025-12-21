#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Smart Callback Analysis Script
 *
 * This script analyzes React components to find callbacks that may need memoization
 * and provides intelligent recommendations for useCallback usage.
 */

class CallbackAnalyzer {
  constructor() {
    this.issues = [];
    this.fileCount = 0;
    this.componentCount = 0;
    this.callbackCount = 0;
    this.useMemoCount = 0;
    this.useCallbackCount = 0;
    this.reactMemoCount = 0;
  }

  /**
   * Analyze all React/TypeScript files in the given directory
   */
  analyzeDirectory(dirPath) {
    const files = this.findReactFiles(dirPath);

    console.log(`\n🔍 Analyzing ${files.length} React files...\n`);

    for (const filePath of files) {
      this.analyzeFile(filePath);
    }

    this.generateReport();
  }

  /**
   * Find all React component files
   */
  findReactFiles(dir) {
    const files = [];

    const traverse = (currentDir) => {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules, .next, build directories
          if (!['node_modules', '.next', 'dist', 'build', 'src-tauri', 'target'].includes(item)) {
            traverse(fullPath);
          }
        } else if (/\.(tsx|jsx)$/.test(item)) {
          files.push(fullPath);
        }
      }
    };

    traverse(dir);
    return files;
  }

  /**
   * Analyze a single file for callback patterns
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.fileCount++;

      // Check if it's a React component
      if (!this.isReactComponent(content)) {
        return;
      }

      this.componentCount++;

      // Count existing memoization usage
      this.countMemoizationUsage(content);

      // Find and analyze callbacks
      this.analyzeCallbacks(content, filePath);

    } catch (error) {
      console.warn(`⚠️  Warning: Could not analyze ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check if file contains React component patterns
   */
  isReactComponent(content) {
    return (
      content.includes('import React') ||
      content.includes('from "react"') ||
      content.includes('from \'react\'') ||
      content.includes('React.') ||
      /\b(?:function|const)\s+\w+\s*\(?\s*\{?\s*\(?\s*props\)?\s*\)?\s*=>/i.test(content) ||
      content.includes('export default') ||
      content.includes('export function') ||
      content.includes('export const')
    );
  }

  /**
   * Count existing memoization patterns
   */
  countMemoizationUsage(content) {
    this.useMemoCount += (content.match(/useMemo\s*\(/g) || []).length;
    this.useCallbackCount += (content.match(/useCallback\s*\(/g) || []).length;
    this.reactMemoCount += (content.match(/React\.memo\s*\(/g) || []).length;
  }

  /**
   * Analyze callbacks in the file content
   */
  analyzeCallbacks(content, filePath) {
    const lines = content.split('\n');

    // Pattern 1: Inline function callbacks in JSX props
    const jsxCallbackPattern = /(\w+)=\{(\([^)]*\)|[^=})]+)\s*=>/g;
    let match;

    while ((match = jsxCallbackPattern.exec(content)) !== null) {
      this.callbackCount++;
      const propName = match[1];
      const callbackStart = match.index;
      const lineNum = this.getLineNumber(content, callbackStart);
      const context = this.getContext(content, callbackStart);

      this.analyzeCallbackForMemoization({
        type: 'jsx_inline',
        line: lineNum,
        file: filePath,
        propName,
        context,
        severity: 'high'
      });
    }

    // Pattern 2: Functions defined inside components
    const inlineFunctionPattern = /(?:const|function)\s+(\w+)\s*=\s*(\([^)]*\)|[^=]+)\s*=>/g;

    while ((match = inlineFunctionPattern.exec(content)) !== null) {
      this.callbackCount++;
      const functionName = match[1];
      const funcStart = match.index;
      const lineNum = this.getLineNumber(content, funcStart);
      const context = this.getContext(content, funcStart);

      // Check if this function is used as a callback
      const isCallback = this.isFunctionUsedAsCallback(content, functionName);

      if (isCallback) {
        this.analyzeCallbackForMemoization({
          type: 'inline_function',
          line: lineNum,
          file: filePath,
          functionName,
          context,
          severity: 'medium'
        });
      }
    }

    // Pattern 3: useEffect dependencies (array functions without useCallback)
    const useEffectPattern = /useEffect\s*\(\s*([^,]+),\s*\[([^\]]*)\]\s*\)/g;

    while ((match = useEffectPattern.exec(content)) !== null) {
      const deps = match[2].split(',').map(dep => dep.trim());
      const effectContent = match[1];

      // Check if effect contains functions that should be dependencies
      for (const dep of deps) {
        if (dep && !dep.startsWith('use') && this.isFunctionCall(effectContent, dep)) {
          this.callbackCount++;
          const lineNum = this.getLineNumber(content, match.index);

          this.issues.push({
            type: 'useeffect_dependency',
            line: lineNum,
            file: filePath,
            dependency: dep,
            severity: 'high',
            recommendation: `Consider wrapping '${dep}' in useCallback or move it outside the effect`
          });
        }
      }
    }
  }

  /**
   * Analyze a specific callback for memoization needs
   */
  analyzeCallbackForMemoization(callback) {
    const { type, line, file, propName, functionName, context, severity } = callback;

    // Skip if useCallback is already used
    if (context.includes('useCallback')) {
      return;
    }

    // Heuristics to determine if memoization is needed
    const needsMemoization = this.evaluateMemoizationNeed(callback);

    if (needsMemoization) {
      const recommendation = this.generateRecommendation(callback);
      this.issues.push({
        type,
        line,
        file: this.getRelativePath(file),
        propName,
        functionName,
        severity,
        recommendation,
        context
      });
    }
  }

  /**
   * Evaluate if a callback needs memoization based on heuristics
   */
  evaluateMemoizationNeed(callback) {
    const { context, propName, functionName } = callback;

    // High priority cases
    if (this.isExpensiveOperation(context)) return true;
    if (this.isInRenderLoop(context)) return true;
    if (this.isPassedToChildComponent(context)) return true;
    if (this.isEventWithFrequentTriggers(propName)) return true;
    if (this.isInArrayDependency(context)) return true;

    // Medium priority cases
    if (this.isUsedInMultiplePlaces(context, functionName)) return true;
    if (this.closesOverState(context)) return true;
    if (this.closesOverProps(context)) return true;

    return false;
  }

  /**
   * Check if callback contains expensive operations
   */
  isExpensiveOperation(context) {
    const expensivePatterns = [
      /\.map\s*\(/,
      /\.filter\s*\(/,
      /\.reduce\s*\(/,
      /\.sort\s*\(/,
      /\.find\s*\(/,
      /for\s*\(/,
      /while\s*\(/,
      /Array\(\s*\d+\s*\)/,
      /new\s+Array/,
      /\.forEach\s*\(/,
      /JSON\.parse/,
      /JSON\.stringify/
    ];

    return expensivePatterns.some(pattern => pattern.test(context));
  }

  /**
   * Check if callback is in a render loop
   */
  isInRenderLoop(context) {
    return context.includes('return (') ||
           context.includes('return <') ||
           context.match(/{\s*\w+\s*=>/);
  }

  /**
   * Check if callback is passed to child component
   */
  isPassedToChildComponent(context) {
    return /<[A-Z][a-zA-Z0-9]*\s+[^>]*\{[^}]*=>/.test(context);
  }

  /**
   * Check if event handler is triggered frequently
   */
  isEventWithFrequentTriggers(propName) {
    const frequentEvents = [
      'onScroll', 'onResize', 'onChange', 'onInput', 'onMouseMove',
      'onTouchMove', 'onWheel', 'onDrag', 'onKeyDown', 'onKeyUp'
    ];

    return frequentEvents.includes(propName);
  }

  /**
   * Check if callback is used in dependency array
   */
  isInArrayDependency(context) {
    return /\[.*\w+.*\]/.test(context) &&
           context.includes('useEffect') ||
           context.includes('useMemo') ||
           context.includes('useCallback');
  }

  /**
   * Check if function is used in multiple places
   */
  isUsedInMultiplePlaces(context, functionName) {
    if (!functionName) return false;

    const regex = new RegExp(`\\b${functionName}\\b`, 'g');
    const matches = context.match(regex) || [];
    return matches.length > 2;
  }

  /**
   * Check if callback closes over state variables
   */
  closesOverState(context) {
    return /useState\s*\(\s*\)[^;]*\[\s*(\w+)/.test(context) &&
           new RegExp(/\[\s*(\w+)/).exec(context) &&
           context.includes(new RegExp(/\b$1\b/));
  }

  /**
   * Check if callback closes over props
   */
  closesOverProps(context) {
    return /props\.\w+/.test(context);
  }

  /**
   * Check if a function is used as a callback
   */
  isFunctionUsedAsCallback(content, functionName) {
    const patterns = [
      new RegExp(`\\w+\\s*=\\s*${functionName}`, 'g'),
      new RegExp(`<[^>]+\\w+=\\{${functionName}`, 'g'),
      new RegExp(`\\[\\s*[^\\]]*${functionName}[^\\]]*\\]`, 'g')
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if a function call exists in effect content
   */
  isFunctionCall(effectContent, name) {
    return new RegExp(`\\b${name}\\s*\\(`).test(effectContent);
  }

  /**
   * Generate recommendation for the callback
   */
  generateRecommendation(callback) {
    const { type, propName, functionName, context } = callback;

    switch (type) {
      case 'jsx_inline':
        return `Extract inline callback to a variable wrapped in useCallback: ` +
               `const handle${this.capitalize(propName)} = useCallback(() => { /* your code */ }, [dependencies]);`;

      case 'inline_function':
        return `Wrap '${functionName}' in useCallback: ` +
               `const ${functionName} = useCallback(() => { /* your code */ }, [dependencies]);`;

      case 'useeffect_dependency':
        return `Add useCallback wrapper for the dependency function or move it outside the effect scope`;

      default:
        return 'Consider wrapping this callback in useCallback to prevent unnecessary re-renders';
    }
  }

  /**
   * Get line number from character position
   */
  getLineNumber(content, position) {
    const lines = content.substring(0, position).split('\n');
    return lines.length;
  }

  /**
   * Get context around a callback
   */
  getContext(content, position, contextLines = 5) {
    const lines = content.split('\n');
    const lineNum = this.getLineNumber(content, position);

    const start = Math.max(0, lineNum - contextLines);
    const end = Math.min(lines.length, lineNum + contextLines);

    return lines.slice(start, end).join('\n');
  }

  /**
   * Get relative path from project root
   */
  getRelativePath(filePath) {
    return path.relative(process.cwd(), filePath);
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate and display the analysis report
   */
  generateReport() {
    console.log('📊 Callback Analysis Report');
    console.log('================================');
    console.log(`Files analyzed: ${this.fileCount}`);
    console.log(`React components: ${this.componentCount}`);
    console.log(`Callbacks found: ${this.callbackCount}`);
    console.log(`Current useCallback usage: ${this.useCallbackCount}`);
    console.log(`Current useMemo usage: ${this.useMemoCount}`);
    console.log(`Current React.memo usage: ${this.reactMemoCount}`);
    console.log('');

    if (this.issues.length === 0) {
      console.log('✅ Great! No obvious callback memoization issues found.');
      return;
    }

    // Group issues by severity
    const highSeverityIssues = this.issues.filter(issue => issue.severity === 'high');
    const mediumSeverityIssues = this.issues.filter(issue => issue.severity === 'medium');

    console.log(`🚨 Found ${this.issues.length} potential callback optimization opportunities`);
    console.log(`   🔴 High priority: ${highSeverityIssues.length}`);
    console.log(`   🟡 Medium priority: ${mediumSeverityIssues.length}`);
    console.log('');

    // Display high severity issues first
    if (highSeverityIssues.length > 0) {
      console.log('🔴 HIGH PRIORITY ISSUES');
      console.log('======================');
      this.displayIssues(highSeverityIssues);
    }

    if (mediumSeverityIssues.length > 0) {
      console.log('\n🟡 MEDIUM PRIORITY ISSUES');
      console.log('========================');
      this.displayIssues(mediumSeverityIssues);
    }

    // Summary and next steps
    console.log('\n📝 RECOMMENDATIONS SUMMARY');
    console.log('==========================');
    console.log('1. Focus on HIGH priority issues first - these likely cause performance problems');
    console.log('2. Use React DevTools Profiler to measure actual performance impact');
    console.log('3. Consider using React.memo() in combination with useCallback for child components');
    console.log('4. Remember to include all dependencies in useCallback dependency arrays');
    console.log('5. Don\'t over-optimize - only memoize what\'s actually causing performance issues');

    // Most problematic files
    const fileCounts = {};
    this.issues.forEach(issue => {
      fileCounts[issue.file] = (fileCounts[issue.file] || 0) + 1;
    });

    const sortedFiles = Object.entries(fileCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    if (sortedFiles.length > 0) {
      console.log('\n📁 FILES WITH MOST ISSUES');
      console.log('========================');
      sortedFiles.forEach(([file, count]) => {
        console.log(`${file}: ${count} issues`);
      });
    }
  }

  /**
   * Display issues in a formatted way
   */
  displayIssues(issues) {
    issues.forEach((issue, index) => {
      const { type, line, file, propName, functionName, recommendation } = issue;

      console.log(`\n${index + 1}. ${file}:${line}`);
      console.log(`   Type: ${type.replace('_', ' ').toUpperCase()}`);

      if (propName) console.log(`   Prop: ${propName}`);
      if (functionName) console.log(`   Function: ${functionName}`);

      console.log(`   💡 ${recommendation}`);
    });
  }
}

// Run the analyzer
if (require.main === module) {
  const targetDir = process.argv[2] || './apps/web';

  console.log('🚀 Starting Callback Analysis...');
  console.log(`📁 Target directory: ${targetDir}`);

  const analyzer = new CallbackAnalyzer();
  analyzer.analyzeDirectory(targetDir);
}

module.exports = CallbackAnalyzer;