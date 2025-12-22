#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Arrow Function Analyzer
 * 
 * Finds arrow function constants that should be function declarations.
 * Auto-detects project structure and supports interactive mode.
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

class ArrowFunctionAnalyzer {
    constructor(options = {}) {
        this.issues = [];
        this.fileCount = 0;
        this.issueCount = 0;
        this.fixedCount = 0;
        this.options = options;
        this.projectRoot = this.findProjectRoot();
        this.backupDir = path.join(this.projectRoot, '.arrow-analyzer-backups');
        this.gitignorePatterns = this.loadGitignore();
    }

    /**
     * Find project root (looks for package.json or turbo.json)
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
            '*.bundle.js',
            '.arrow-analyzer-backups'
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
        } catch (e) {
            // Ignore gitignore read errors
        }

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
     * Find all TypeScript/JavaScript files
     */
    findFiles(dir) {
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
                        } else if (/\.(tsx?|jsx?)$/.test(item) && !item.endsWith('.d.ts')) {
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
     * Analyze a file for arrow function constants
     */
    analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.fileCount++;

            const fileIssues = this.findArrowFunctionConstants(content, filePath);

            if (fileIssues.length > 0) {
                this.issues.push(...fileIssues);
                this.issueCount += fileIssues.length;
            }

            return fileIssues;
        } catch (e) {
            return [];
        }
    }

    /**
     * Find arrow function constants that should be function declarations
     */
    findArrowFunctionConstants(content, filePath) {
        const issues = [];
        const lines = content.split('\n');

        const arrowConstPattern = /^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(<[^>]+>\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*\{/;
        const arrowConstSimplePattern = /^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(<[^>]+>\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*\(/;
        const arrowSingleParamPattern = /^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(<[^>]+>\s*)?(\w+)\s*=>\s*[\{\(]/;

        const allowedPatterns = [
            /=\s*useCallback\s*\(/,
            /=\s*useMemo\s*\(/,
            /=\s*useRef\s*\(/,
            /=\s*useState\s*\(/,
            /=\s*useEffect\s*\(/,
            /=\s*use\w+Store\s*\(/,
            /=\s*create\w*\s*\(/,
            /=\s*memo\s*\(/,
            /=\s*forwardRef\s*\(/,
            /=\s*React\.memo\s*\(/,
            /=\s*React\.forwardRef\s*\(/,
            /=\s*styled\./,
            /=\s*css`/,
            /=\s*keyframes`/,
            /=\s*\w+\.create\s*\(/,
            /=\s*defineConfig\s*\(/,
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (allowedPatterns.some(pattern => pattern.test(line))) continue;
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

            let match = line.match(arrowConstPattern) ||
                line.match(arrowConstSimplePattern) ||
                line.match(arrowSingleParamPattern);

            if (match) {
                const indent = match[1] || '';
                const exportKeyword = match[2] || '';
                const funcName = match[4];
                const generics = match[5] || '';
                const params = match[6] || '';

                if (funcName.startsWith('_') || funcName === 'default') continue;

                const prevLines = lines.slice(Math.max(0, i - 3), i).join('\n');
                if (/[{,]\s*$/.test(prevLines.trim())) continue;

                issues.push({
                    file: path.relative(this.projectRoot, filePath),
                    absolutePath: filePath,
                    line: lineNum,
                    funcName,
                    original: line.trim(),
                    indent,
                    exportKeyword: exportKeyword.trim(),
                    generics: generics.trim(),
                    params,
                    suggestion: this.generateSuggestion(indent, exportKeyword.trim(), funcName, generics.trim(), params)
                });
            }
        }

        return issues;
    }

    generateSuggestion(indent, exportKeyword, funcName, generics, params) {
        const exp = exportKeyword ? `${exportKeyword} ` : '';
        const gen = generics ? `${generics}` : '';
        return `${indent}${exp}function ${funcName}${gen}(${params}) {`;
    }

    fixFile(filePath, fileIssues, dryRun = false) {
        if (fileIssues.length === 0) return 0;

        try {
            let content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            let fixedCount = 0;

            const sortedIssues = [...fileIssues].sort((a, b) => b.line - a.line);

            for (const issue of sortedIssues) {
                const lineIndex = issue.line - 1;
                const line = lines[lineIndex];

                const arrowIndex = line.indexOf('=>');
                if (arrowIndex === -1) continue;

                const afterArrow = line.substring(arrowIndex + 2).trim();
                const exp = issue.exportKeyword ? `${issue.exportKeyword} ` : '';
                const gen = issue.generics ? `${issue.generics}` : '';

                let returnType = '';
                const colonMatch = line.match(/\)\s*:\s*([^=]+)\s*=>/);
                if (colonMatch) {
                    returnType = `: ${colonMatch[1].trim()}`;
                }

                const newLine = `${issue.indent}${exp}function ${issue.funcName}${gen}(${issue.params})${returnType} ${afterArrow}`;

                if (dryRun) {
                    console.log(`\n  ${c('dim', `Line ${issue.line}:`)}`);
                    console.log(`  ${c('red', '-')} ${line.trim().substring(0, 70)}...`);
                    console.log(`  ${c('green', '+')} ${newLine.trim().substring(0, 70)}...`);
                } else {
                    lines[lineIndex] = newLine;
                }

                fixedCount++;
            }

            if (!dryRun && fixedCount > 0) {
                this.createBackup(filePath, content);
                fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
            }

            return fixedCount;
        } catch (e) {
            console.error(`${c('red', '❌')} Failed to fix ${filePath}: ${e.message}`);
            return 0;
        }
    }

    createBackup(filePath, content) {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        const relativePath = path.relative(this.projectRoot, filePath);
        const backupPath = path.join(this.backupDir, relativePath.replace(/\//g, '__'));

        const manifest = this.loadManifest();
        manifest[backupPath] = {
            originalPath: filePath,
            timestamp: new Date().toISOString()
        };
        this.saveManifest(manifest);

        fs.writeFileSync(backupPath, content, 'utf8');
    }

    loadManifest() {
        const manifestPath = path.join(this.backupDir, 'manifest.json');
        try {
            if (fs.existsSync(manifestPath)) {
                return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            }
        } catch (e) { }
        return {};
    }

    saveManifest(manifest) {
        const manifestPath = path.join(this.backupDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    revertBackups() {
        if (!fs.existsSync(this.backupDir)) {
            console.log(`${c('cyan', '📂')} No backups found to revert.`);
            return;
        }

        const manifest = this.loadManifest();
        const entries = Object.entries(manifest);

        if (entries.length === 0) {
            console.log(`${c('cyan', '📂')} No backups found to revert.`);
            return;
        }

        console.log(`\n${c('cyan', '🔄')} Reverting ${entries.length} files...\n`);

        let revertedCount = 0;
        for (const [backupPath, info] of entries) {
            try {
                if (fs.existsSync(backupPath)) {
                    const content = fs.readFileSync(backupPath, 'utf8');
                    fs.writeFileSync(info.originalPath, content, 'utf8');
                    fs.unlinkSync(backupPath);
                    console.log(`  ${c('green', '✅')} Reverted: ${path.relative(this.projectRoot, info.originalPath)}`);
                    revertedCount++;
                }
            } catch (e) {
                console.error(`  ${c('red', '❌')} Failed to revert ${info.originalPath}: ${e.message}`);
            }
        }

        this.saveManifest({});
        console.log(`\n${c('green', '✅')} Reverted ${revertedCount} files.`);
    }

    async analyzeDirectory(dirPath) {
        const files = this.findFiles(dirPath);

        console.log(`\n${c('cyan', '🔍')} Analyzing ${c('bold', files.length)} files...`);
        if (this.options.scope) {
            console.log(`${c('cyan', '📂')} Scope: ${this.options.scope}`);
        }
        console.log('');

        const batchSize = 20;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            await Promise.all(batch.map(file => this.analyzeFile(file)));
        }

        if (this.options.fix || this.options.dryRun) {
            await this.fixIssues();
        } else {
            this.generateReport();
        }
    }

    async fixIssues() {
        const dryRun = this.options.dryRun;

        if (this.issues.length === 0) {
            console.log(`${c('green', '✅')} No arrow function constants found to fix!`);
            return;
        }

        console.log(dryRun ?
            `${c('cyan', '👀')} DRY RUN - Showing what would be changed:\n` :
            `${c('yellow', '🔧')} Fixing issues...\n`);

        const issuesByFile = {};
        for (const issue of this.issues) {
            if (!issuesByFile[issue.absolutePath]) {
                issuesByFile[issue.absolutePath] = [];
            }
            issuesByFile[issue.absolutePath].push(issue);
        }

        let totalFixed = 0;
        for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
            console.log(`${c('cyan', '📄')} ${path.relative(this.projectRoot, filePath)} (${fileIssues.length} issues)`);
            const fixed = this.fixFile(filePath, fileIssues, dryRun);
            totalFixed += fixed;
        }

        console.log('');
        if (dryRun) {
            console.log(`${c('cyan', '📊')} Would fix ${c('bold', totalFixed)} arrow function constants.`);
            console.log(`${c('yellow', '🔧')} Run with ${c('bold', '--fix')} to apply changes.`);
        } else {
            console.log(`${c('green', '✅')} Fixed ${c('bold', totalFixed)} arrow function constants.`);
            console.log(`${c('cyan', '💾')} Backups saved to: ${this.backupDir}`);
            console.log(`${c('yellow', '🔄')} Run with ${c('bold', '--revert')} to undo changes.`);
        }
    }

    generateReport() {
        console.log(`${c('bold', '📊 Arrow Function Analysis Report')}`);
        console.log('══════════════════════════════════');
        console.log(`Files analyzed: ${c('cyan', this.fileCount)}`);
        console.log(`Issues found: ${this.issueCount > 0 ? c('yellow', this.issueCount) : c('green', '0')}`);
        console.log('');

        if (this.issues.length === 0) {
            console.log(`${c('green', '✅')} No arrow function constants found! Your code follows the convention.`);
            return;
        }

        console.log(`${c('yellow', '⚠️')}  ARROW FUNCTION CONSTANTS (should be function declarations)`);
        console.log('════════════════════════════════════════════════════════════\n');

        const issuesByFile = {};
        for (const issue of this.issues) {
            if (!issuesByFile[issue.file]) {
                issuesByFile[issue.file] = [];
            }
            issuesByFile[issue.file].push(issue);
        }

        let shownFiles = 0;
        for (const [file, fileIssues] of Object.entries(issuesByFile)) {
            if (shownFiles >= 10) {
                console.log(`\n${c('dim', `... and ${Object.keys(issuesByFile).length - 10} more files`)}`);
                break;
            }

            console.log(`${c('cyan', '📄')} ${file} (${fileIssues.length} issues)`);

            for (const issue of fileIssues.slice(0, 3)) {
                console.log(`   ${c('dim', `Line ${issue.line}:`)} ${issue.funcName}`);
            }
            if (fileIssues.length > 3) {
                console.log(`   ${c('dim', `... and ${fileIssues.length - 3} more`)}`);
            }
            console.log('');
            shownFiles++;
        }

        console.log(`\n${c('bold', '📝 SUMMARY')}`);
        console.log('══════════');
        console.log(`Total: ${c('yellow', this.issueCount)} arrow function constants should be function declarations`);
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

    const analyzer = new ArrowFunctionAnalyzer({});
    const webAppDir = analyzer.findWebAppDir();

    console.log(`
${c('bold', c('cyan', '╔═══════════════════════════════════════════╗'))}
${c('bold', c('cyan', '║'))}     ${c('bold', '🔍 Arrow Function Analyzer')}            ${c('bold', c('cyan', '║'))}
${c('bold', c('cyan', '╚═══════════════════════════════════════════╝'))}

${c('dim', 'Detects arrow function constants that should be function declarations.')}

${c('cyan', '📂')} Project root: ${c('bold', analyzer.projectRoot)}
${c('cyan', '📁')} Web app detected: ${c('bold', path.relative(analyzer.projectRoot, webAppDir))}

${c('bold', 'Select an action:')}

  ${c('cyan', '1)')} ${c('bold', 'Analyze')}    - Scan and report issues
  ${c('cyan', '2)')} ${c('bold', 'Dry Run')}    - Preview fixes without applying
  ${c('cyan', '3)')} ${c('bold', 'Auto-Fix')}   - Fix all issues (creates backups)
  ${c('cyan', '4)')} ${c('bold', 'Revert')}     - Restore from last backup
  ${c('cyan', '5)')} ${c('bold', 'Scoped')}     - Analyze specific directory
  ${c('cyan', '0)')} ${c('bold', 'Exit')}
`);

    const choice = await question(`${c('cyan', '→')} Enter choice (0-5): `);

    switch (choice.trim()) {
        case '1':
            console.log('');
            await new ArrowFunctionAnalyzer({}).analyzeDirectory(webAppDir);
            break;

        case '2':
            console.log('');
            await new ArrowFunctionAnalyzer({ dryRun: true }).analyzeDirectory(webAppDir);
            break;

        case '3':
            const confirm = await question(`\n${c('yellow', '⚠️')}  This will modify files. Continue? (y/N): `);
            if (confirm.toLowerCase() === 'y') {
                console.log('');
                await new ArrowFunctionAnalyzer({ fix: true }).analyzeDirectory(webAppDir);
            } else {
                console.log(`${c('dim', 'Cancelled.')}`);
            }
            break;

        case '4':
            console.log('');
            new ArrowFunctionAnalyzer({}).revertBackups();
            break;

        case '5':
            const scopePath = await question(`\n${c('cyan', '📂')} Enter path pattern (e.g., features/editor): `);
            if (scopePath.trim()) {
                console.log('');
                await new ArrowFunctionAnalyzer({ scope: scopePath.trim() }).analyzeDirectory(webAppDir);
            } else {
                console.log(`${c('dim', 'No scope provided, running full analysis...')}`);
                await new ArrowFunctionAnalyzer({}).analyzeDirectory(webAppDir);
            }
            break;

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
${c('bold', 'Arrow Function Analyzer')}
═══════════════════════

Finds arrow function constants that should be function declarations.
Auto-detects project structure.

${c('bold', 'Usage:')}
  node scripts/arrow-function-analyzer.js              ${c('dim', '# Interactive mode')}
  node scripts/arrow-function-analyzer.js [dir] [opts] ${c('dim', '# Direct mode')}

${c('bold', 'Options:')}
  ${c('cyan', '--fix')}           Auto-fix issues (creates backups first)
  ${c('cyan', '--dry-run')}       Show what would be fixed without changes
  ${c('cyan', '--revert')}        Revert all backups from last fix
  ${c('cyan', '--scope=<path>')}  Only analyze files matching path pattern
  ${c('cyan', '--help')}          Show this help message

${c('bold', 'Examples:')}
  node scripts/arrow-function-analyzer.js
  node scripts/arrow-function-analyzer.js --dry-run
  node scripts/arrow-function-analyzer.js --fix
  node scripts/arrow-function-analyzer.js --scope=features/editor
  node scripts/arrow-function-analyzer.js --revert

${c('bold', 'What it detects:')}
  ${c('red', '❌')} const Component = () => { ... }
  ${c('red', '❌')} export const helper = (x) => { ... }
  
${c('bold', 'What it allows:')}
  ${c('green', '✅')} const handler = useCallback(() => { ... }, [])
  ${c('green', '✅')} const value = useMemo(() => { ... }, [])
  ${c('green', '✅')} const store = create(() => { ... })
  ${c('green', '✅')} function Component() { ... }
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
        fix: args.includes('--fix'),
        dryRun: args.includes('--dry-run'),
        revert: args.includes('--revert'),
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

    const analyzer = new ArrowFunctionAnalyzer(options);

    if (options.revert) {
        analyzer.revertBackups();
        return;
    }

    const targetDir = args.find(arg => !arg.startsWith('--')) || analyzer.findWebAppDir();

    console.log(`${c('cyan', '🚀')} Starting Arrow Function Analysis...`);
    console.log(`${c('cyan', '📁')} Target directory: ${path.relative(analyzer.projectRoot, targetDir) || '.'}`);

    await analyzer.analyzeDirectory(targetDir);
}

main().catch(console.error);
