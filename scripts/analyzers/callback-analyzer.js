#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Callback Memoization Analyzer
 * 
 * Analyzes React components to find callbacks that may need memoization
 * and provides intelligent recommendations for useCallback usage.
 */

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

class CallbackAnalyzer {
  constructor(options = {}) {
    this.issues = [];
    this.fileCount = 0;
    this.componentCount = 0;
    this.callbackCount = 0;
    this.useMemoCount = 0;
    this.useCallbackCount = 0;
    this.reactMemoCount = 0;
    this.options = options;
    this.projectRoot = this.findProjectRoot();
    this.gitignorePatterns = this.loadGitignore();
  }

  /**
   * Find project root
   */
  findProjectRoot() {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'turbo.json')) ||
        fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return process.cwd();
  }

  /**
   * Auto-detect web app directory
   */
  findWebAppDir() {
    const possiblePaths = [
      'apps/web',
      'apps/frontend',
      'src',
      'app',
      'packages/web',
      'packages/app',
    ];

    for (const p of possiblePaths) {
      const fullPath = path.join(this.projectRoot, p);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return this.projectRoot;
  }

  /**
   * Load .gitignore patterns
   */
  loadGitignore() {
    const patterns = [
      'node_modules',
      '.next',
      'dist',
      'build',
      '.git',
      'coverage',
      '.turbo',
      'target',
      'src-tauri',
      '*.min.js',
      '*.bundle.js'
    ];

    try {
      const gitignorePath = path.join(this.projectRoot, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        patterns.push(...lines);
      }
    } catch (e) { }

    return patterns;
  }

  /**
   * Check if path should be ignored
   */
  shouldIgnore(filePath) {
    const relativePath = path.relative(this.projectRoot, filePath);

    for (const pattern of this.gitignorePatterns) {
      if (relativePath.includes(pattern.replace(/^\*+/, '').replace(/\*+$/, ''))) {
        return true;
      }
      if (pattern.startsWith('*') && relativePath.endsWith(pattern.slice(1))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find all React component files
   */
  findReactFiles(dir) {
    const files = [];

    const traverse = (currentDir) => {
      try {
        const items = fs.readdirSync(currentDir);

        for (const item of items) {
          const fullPath = path.join(currentDir, item);

          if (this.shouldIgnore(fullPath)) continue;

          try {
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              traverse(fullPath);
            } else if (/\.(tsx|jsx)$/.test(item)) {
              if (this.options.scope) {
                if (!fullPath.includes(this.options.scope)) continue;
              }
              files.push(fullPath);
            }
          } catch (e) { }
        }
      } catch (e) { }
    };

    traverse(dir);
    return files;
  }

  /**
   * Analyze directory with parallel processing
   */
  async analyzeDirectory(dirPath) {
    const files = this.findReactFiles(dirPath);

    console.log(`\n${c('cyan', '🔍')} Analyzing ${c('bold', files.length)} React files...`);
    if (this.options.scope) {
      console.log(`${c('cyan', '📂')} Scope: ${this.options.scope}`);
    }
    console.log('');

    // Parallel batch processing
    const batchSize = 20;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.analyzeFile(file)));
    }

    this.generateReport();
  }

  /**
   * Analyze a single file
   */
  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.fileCount++;

      if (!this.isReactComponent(content)) return;

      this.componentCount++;
      this.countMemoizationUsage(content);
      this.analyzeCallbacks(content, filePath);
    } catch (error) {
      // Skip unreadable files
    }
  }

  isReactComponent(content) {
    return (
      content.includes('import React') ||
      content.includes('from "react"') ||
      content.includes("from 'react'") ||
      content.includes('React.') ||
      content.includes('export default') ||
      content.includes('export function') ||
      content.includes('export const')
    );
  }

  countMemoizationUsage(content) {
    this.useMemoCount += (content.match(/useMemo\s*\(/g) || []).length;
    this.useCallbackCount += (content.match(/useCallback\s*\(/g) || []).length;
    this.reactMemoCount += (content.match(/React\.memo\s*\(/g) || []).length;
  }

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
      const line = lines[lineNum - 1] || '';

      if (line.includes('useCallback') || context.includes('useCallback(')) continue;
      if (/=>\s*set\w+\([^)]*\)\s*}/.test(line)) continue;
      if (/=>\s*\w+\([^)]*\)\s*}/.test(line) && !line.includes('.map') && !line.includes('.filter')) continue;

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
    const inlineFunctionPattern = /(?:const|let)\s+(\w+)\s*=\s*(\([^)]*\)|[^=]+)\s*=>/g;

    while ((match = inlineFunctionPattern.exec(content)) !== null) {
      const functionName = match[1];
      const funcStart = match.index;
      const lineNum = this.getLineNumber(content, funcStart);
      const context = this.getContext(content, funcStart, 3);
      const line = lines[lineNum - 1] || '';

      if (context.includes('useCallback(') || context.includes('useMemo(')) continue;
      if (line.includes('useRef(') || context.includes('useRef(')) continue;
      if (/\.(filter|map|reduce|find|findIndex|some|every|includes)\s*\(/.test(line)) continue;
      if (!line.includes('=>') && !line.includes('function')) continue;

      this.callbackCount++;

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

    // Pattern 3: useEffect dependencies
    const useEffectPattern = /useEffect\s*\(\s*\(\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\},\s*\[([^\]]*)\]\s*\)/g;

    while ((match = useEffectPattern.exec(content)) !== null) {
      const effectBody = match[1];
      const deps = match[2].split(',').map(dep => dep.trim()).filter(Boolean);

      for (const dep of deps) {
        if (dep.startsWith('use') || dep === '' || dep.includes('.')) continue;
        if (!this.isFunctionCall(effectBody, dep)) continue;

        const useCallbackPattern = new RegExp(`const\\s+${dep}\\s*=\\s*useCallback`);
        if (useCallbackPattern.test(content)) continue;

        const zustandPattern = new RegExp(`const\\s+${dep}\\s*=\\s*use\\w+Store\\s*\\(`);
        if (zustandPattern.test(content)) continue;

        const hookPatterns = [
          new RegExp(`const\\s+\\{[^}]*${dep}[^}]*\\}\\s*=\\s*use\\w+\\(`),
          new RegExp(`const\\s+${dep}\\s*=\\s*use\\w+\\(`)
        ];
        if (hookPatterns.some(pattern => pattern.test(content))) continue;

        const lineNum = this.getLineNumber(content, match.index);

        this.issues.push({
          type: 'useeffect_dependency',
          line: lineNum,
          file: path.relative(this.projectRoot, filePath),
          dependency: dep,
          severity: 'high',
          recommendation: `Consider wrapping '${dep}' in useCallback or move it outside the effect`
        });
      }
    }
  }

  analyzeCallbackForMemoization(callback) {
    const { type, line, file, propName, functionName, context, severity } = callback;

    if (context.includes('useCallback')) return;

    const needsMemoization = this.evaluateMemoizationNeed(callback);

    if (needsMemoization) {
      const recommendation = this.generateRecommendation(callback);
      this.issues.push({
        type,
        line,
        file: path.relative(this.projectRoot, file),
        propName,
        functionName,
        severity,
        recommendation,
        context
      });
    }
  }

  evaluateMemoizationNeed(callback) {
    const { context, propName, functionName } = callback;

    if (this.isExpensiveOperation(context)) return true;
    if (this.isInRenderLoop(context)) return true;
    if (this.isPassedToChildComponent(context)) return true;
    if (this.isEventWithFrequentTriggers(propName)) return true;
    if (this.isInArrayDependency(context)) return true;
    if (this.isUsedInMultiplePlaces(context, functionName)) return true;
    if (this.closesOverState(context)) return true;
    if (this.closesOverProps(context)) return true;

    return false;
  }

  isExpensiveOperation(context) {
    const expensivePatterns = [
      /\.map\s*\(/, /\.filter\s*\(/, /\.reduce\s*\(/, /\.sort\s*\(/,
      /\.find\s*\(/, /for\s*\(/, /while\s*\(/, /Array\(\s*\d+\s*\)/,
      /new\s+Array/, /\.forEach\s*\(/, /JSON\.parse/, /JSON\.stringify/
    ];
    return expensivePatterns.some(pattern => pattern.test(context));
  }

  isInRenderLoop(context) {
    return context.includes('return (') || context.includes('return <') || context.match(/{\s*\w+\s*=>/);
  }

  isPassedToChildComponent(context) {
    return /<[A-Z][a-zA-Z0-9]*\s+[^>]*\{[^}]*=>/.test(context);
  }

  isEventWithFrequentTriggers(propName) {
    const frequentEvents = ['onScroll', 'onResize', 'onChange', 'onInput', 'onMouseMove', 'onTouchMove', 'onWheel', 'onDrag', 'onKeyDown', 'onKeyUp'];
    return frequentEvents.includes(propName);
  }

  isInArrayDependency(context) {
    return /\[.*\w+.*\]/.test(context) && (context.includes('useEffect') || context.includes('useMemo') || context.includes('useCallback'));
  }

  isUsedInMultiplePlaces(context, functionName) {
    if (!functionName) return false;
    const regex = new RegExp(`\\b${functionName}\\b`, 'g');
    const matches = context.match(regex) || [];
    return matches.length > 2;
  }

  closesOverState(context) {
    return /useState\s*\(\s*\)[^;]*\[\s*(\w+)/.test(context);
  }

  closesOverProps(context) {
    return /props\.\w+/.test(context);
  }

  isFunctionUsedAsCallback(content, functionName) {
    const patterns = [
      new RegExp(`\\w+\\s*=\\s*${functionName}`, 'g'),
      new RegExp(`<[^>]+\\w+=\\{${functionName}`, 'g'),
      new RegExp(`\\[\\s*[^\\]]*${functionName}[^\\]]*\\]`, 'g')
    ];
    return patterns.some(pattern => pattern.test(content));
  }

  isFunctionCall(effectContent, name) {
    return new RegExp(`\\b${name}\\s*\\(`).test(effectContent);
  }

  generateRecommendation(callback) {
    const { type, propName, functionName } = callback;

    switch (type) {
      case 'jsx_inline':
        return `Extract inline callback: const handle${this.capitalize(propName)} = useCallback(() => { ... }, [deps]);`;
      case 'inline_function':
        return `Wrap '${functionName}' in useCallback: const ${functionName} = useCallback(() => { ... }, [deps]);`;
      case 'useeffect_dependency':
        return `Wrap dependency in useCallback or move outside effect scope`;
      default:
        return 'Consider wrapping this callback in useCallback';
    }
  }

  getLineNumber(content, position) {
    return content.substring(0, position).split('\n').length;
  }

  getContext(content, position, contextLines = 5) {
    const lines = content.split('\n');
    const lineNum = this.getLineNumber(content, position);
    const start = Math.max(0, lineNum - contextLines);
    const end = Math.min(lines.length, lineNum + contextLines);
    return lines.slice(start, end).join('\n');
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  generateReport() {
    console.log(`${c('bold', '📊 Callback Analysis Report')}`);
    console.log('══════════════════════════════');
    console.log(`Files analyzed: ${c('cyan', this.fileCount)}`);
    console.log(`React components: ${c('cyan', this.componentCount)}`);
    console.log(`Callbacks found: ${c('cyan', this.callbackCount)}`);
    console.log(`Current useCallback: ${c('green', this.useCallbackCount)}`);
    console.log(`Current useMemo: ${c('green', this.useMemoCount)}`);
    console.log(`Current React.memo: ${c('green', this.reactMemoCount)}`);
    console.log('');

    if (this.issues.length === 0) {
      console.log(`${c('green', '✅')} Great! No obvious callback memoization issues found.`);
      return;
    }

    const highIssues = this.issues.filter(i => i.severity === 'high');
    const mediumIssues = this.issues.filter(i => i.severity === 'medium');

    console.log(`${c('yellow', '⚠️')}  Found ${c('bold', this.issues.length)} potential optimization opportunities`);
    console.log(`   ${c('red', '🔴')} High priority: ${highIssues.length}`);
    console.log(`   ${c('yellow', '🟡')} Medium priority: ${mediumIssues.length}`);
    console.log('');

    if (highIssues.length > 0) {
      console.log(`${c('red', '🔴 HIGH PRIORITY ISSUES')}`);
      console.log('═══════════════════════\n');
      this.displayIssues(highIssues.slice(0, 10));
      if (highIssues.length > 10) {
        console.log(`\n${c('dim', `... and ${highIssues.length - 10} more high priority issues`)}`);
      }
    }

    if (mediumIssues.length > 0) {
      console.log(`\n${c('yellow', '🟡 MEDIUM PRIORITY ISSUES')}`);
      console.log('═════════════════════════\n');
      this.displayIssues(mediumIssues.slice(0, 5));
      if (mediumIssues.length > 5) {
        console.log(`\n${c('dim', `... and ${mediumIssues.length - 5} more medium priority issues`)}`);
      }
    }

    // Files with most issues
    const fileCounts = {};
    this.issues.forEach(issue => {
      fileCounts[issue.file] = (fileCounts[issue.file] || 0) + 1;
    });

    const sortedFiles = Object.entries(fileCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

    if (sortedFiles.length > 0) {
      console.log(`\n${c('bold', '📁 FILES WITH MOST ISSUES')}`);
      console.log('══════════════════════════');
      sortedFiles.forEach(([file, count]) => {
        console.log(`${c('cyan', file)}: ${count} issues`);
      });
    }

    console.log(`\n${c('bold', '📝 RECOMMENDATIONS')}`);
    console.log('═══════════════════');
    console.log('1. Focus on HIGH priority issues first');
    console.log('2. Use React DevTools Profiler to measure impact');
    console.log('3. Combine useCallback with React.memo for children');
    console.log("4. Don't over-optimize - measure first!");
  }

  displayIssues(issues) {
    issues.forEach((issue, index) => {
      console.log(`${c('cyan', `${index + 1}.`)} ${issue.file}:${issue.line}`);
      console.log(`   ${c('dim', 'Type:')} ${issue.type.replace('_', ' ').toUpperCase()}`);
      if (issue.propName) console.log(`   ${c('dim', 'Prop:')} ${issue.propName}`);
      if (issue.functionName) console.log(`   ${c('dim', 'Function:')} ${issue.functionName}`);
      if (issue.dependency) console.log(`   ${c('dim', 'Dependency:')} ${issue.dependency}`);
      console.log(`   ${c('yellow', '💡')} ${issue.recommendation}`);
      console.log('');
    });
  }
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  const analyzer = new CallbackAnalyzer({});
  const webAppDir = analyzer.findWebAppDir();

  console.log(`
${c('bold', c('cyan', '╔═══════════════════════════════════════════╗'))}
${c('bold', c('cyan', '║'))}     ${c('bold', '🔍 Callback Memoization Analyzer')}       ${c('bold', c('cyan', '║'))}
${c('bold', c('cyan', '╚═══════════════════════════════════════════╝'))}

${c('dim', 'Finds callbacks that may need useCallback/useMemo optimization.')}

${c('cyan', '📂')} Project root: ${c('bold', analyzer.projectRoot)}
${c('cyan', '📁')} Web app detected: ${c('bold', path.relative(analyzer.projectRoot, webAppDir))}

${c('bold', 'Select an action:')}

  ${c('cyan', '1)')} ${c('bold', 'Analyze')}    - Full callback analysis
  ${c('cyan', '2)')} ${c('bold', 'Scoped')}     - Analyze specific directory
  ${c('cyan', '3)')} ${c('bold', 'Quick')}      - High priority only
  ${c('cyan', '0)')} ${c('bold', 'Exit')}
`);

  const choice = await question(`${c('cyan', '→')} Enter choice (0-3): `);

  switch (choice.trim()) {
    case '1':
      console.log('');
      await new CallbackAnalyzer({}).analyzeDirectory(webAppDir);
      break;

    case '2': {
      const scopePath = await question(`\n${c('cyan', '📂')} Enter path pattern (e.g., features/editor): `);
      if (scopePath.trim()) {
        console.log('');
        await new CallbackAnalyzer({ scope: scopePath.trim() }).analyzeDirectory(webAppDir);
      } else {
        console.log(`${c('dim', 'No scope provided, running full analysis...')}`);
        await new CallbackAnalyzer({}).analyzeDirectory(webAppDir);
      }
      break;
    }

    case '3': {
      console.log('');
      const quickAnalyzer = new CallbackAnalyzer({ highPriorityOnly: true });
      await quickAnalyzer.analyzeDirectory(webAppDir);
      break;
    }

    case '0':
      console.log(`${c('dim', 'Goodbye!')}`);
      break;

    default:
      console.log(`${c('red', 'Invalid choice.')}`);
  }

  rl.close();
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${c('bold', 'Callback Memoization Analyzer')}
═══════════════════════════════

Finds React callbacks that may need useCallback/useMemo optimization.
Auto-detects project structure.

${c('bold', 'Usage:')}
  node scripts/callback-analyzer.js              ${c('dim', '# Interactive mode')}
  node scripts/callback-analyzer.js [dir] [opts] ${c('dim', '# Direct mode')}

${c('bold', 'Options:')}
  ${c('cyan', '--scope=<path>')}  Only analyze files matching path pattern
  ${c('cyan', '--help')}          Show this help message

${c('bold', 'Examples:')}
  node scripts/callback-analyzer.js
  node scripts/callback-analyzer.js --scope=features/editor

${c('bold', 'What it detects:')}
  ${c('red', '⚠️')}  Inline callbacks in JSX: onClick={() => ...}
  ${c('red', '⚠️')}  Functions used as callbacks without useCallback
  ${c('red', '⚠️')}  useEffect dependencies that should be memoized
  
${c('bold', 'What it ignores:')}
  ${c('green', '✅')} Already wrapped in useCallback/useMemo
  ${c('green', '✅')} Simple state setters: onChange={e => setValue(e.target.value)}
  ${c('green', '✅')} Zustand store functions (stable references)
  ${c('green', '✅')} Functions from custom hooks
`);
}

// Main
async function main() {
  const args = process.argv.slice(2);

  // No arguments = interactive mode
  if (args.length === 0) {
    await interactiveMode();
    return;
  }

  const options = {
    help: args.includes('--help'),
    scope: null
  };

  const scopeArg = args.find(arg => arg.startsWith('--scope='));
  if (scopeArg) {
    options.scope = scopeArg.split('=')[1];
  }

  if (options.help) {
    showHelp();
    return;
  }

  const analyzer = new CallbackAnalyzer(options);
  const targetDir = args.find(arg => !arg.startsWith('--')) || analyzer.findWebAppDir();

  console.log(`${c('cyan', '🚀')} Starting Callback Analysis...`);
  console.log(`${c('cyan', '📁')} Target directory: ${path.relative(analyzer.projectRoot, targetDir) || '.'}`);

  await analyzer.analyzeDirectory(targetDir);
}

main().catch(console.error);

module.exports = CallbackAnalyzer;