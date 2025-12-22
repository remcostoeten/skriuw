#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Props Naming Analyzer
 * 
 * Enforces the convention:
 * - Single non-exported type/interface in a file MUST be named "Props"
 * - Exported types should NOT be named "Props"
 * - Interfaces should be converted to type
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

class PropsNamingAnalyzer {
    constructor(options = {}) {
        this.issues = [];
        this.fileCount = 0;
        this.issueCount = 0;
        this.fixedCount = 0;
        this.options = options;
        this.projectRoot = this.findProjectRoot();
        this.backupDir = path.join(this.projectRoot, '.props-analyzer-backups');
        this.gitignorePatterns = this.loadGitignore();
    }

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

    findWebAppDir() {
        const possiblePaths = ['apps/web', 'apps/frontend', 'src', 'app', 'packages/web'];
        for (const p of possiblePaths) {
            const fullPath = path.join(this.projectRoot, p);
            if (fs.existsSync(fullPath)) return fullPath;
        }
        return this.projectRoot;
    }

    loadGitignore() {
        const patterns = [
            'node_modules', '.next', 'dist', 'build', '.git', 'coverage',
            '.turbo', 'target', 'src-tauri', '*.min.js', '*.d.ts',
            '.props-analyzer-backups'
        ];

        try {
            const gitignorePath = path.join(this.projectRoot, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                patterns.push(...lines);
            }
        } catch (e) { }

        return patterns;
    }

    shouldIgnore(filePath) {
        const relativePath = path.relative(this.projectRoot, filePath);
        for (const pattern of this.gitignorePatterns) {
            if (relativePath.includes(pattern.replace(/^\*+/, '').replace(/\*+$/, ''))) return true;
            if (pattern.startsWith('*') && relativePath.endsWith(pattern.slice(1))) return true;
        }
        return false;
    }

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
                            if (this.options.scope && !fullPath.includes(this.options.scope)) continue;
                            files.push(fullPath);
                        }
                    } catch (e) { }
                }
            } catch (e) { }
        };
        traverse(dir);
        return files;
    }

    analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.fileCount++;

            const fileIssues = this.findPropsNamingIssues(content, filePath);
            if (fileIssues.length > 0) {
                this.issues.push(...fileIssues);
                this.issueCount += fileIssues.length;
            }
            return fileIssues;
        } catch (e) {
            return [];
        }
    }

    findPropsNamingIssues(content, filePath) {
        const issues = [];
        const lines = content.split('\n');

        // Find all type/interface declarations
        const typeDeclarations = [];

        // Pattern for type declarations: type Name = { ... } or type Name = ...
        const typePattern = /^(\s*)(export\s+)?type\s+(\w+)\s*=\s*/gm;
        // Pattern for interface declarations: interface Name { ... }
        const interfacePattern = /^(\s*)(export\s+)?interface\s+(\w+)\s*\{/gm;

        let match;

        // Find types
        while ((match = typePattern.exec(content)) !== null) {
            const lineNum = this.getLineNumber(content, match.index);
            typeDeclarations.push({
                name: match[3],
                isExported: !!match[2],
                isInterface: false,
                line: lineNum,
                indent: match[1],
                original: lines[lineNum - 1],
                index: match.index
            });
        }

        // Find interfaces
        while ((match = interfacePattern.exec(content)) !== null) {
            const lineNum = this.getLineNumber(content, match.index);
            typeDeclarations.push({
                name: match[3],
                isExported: !!match[2],
                isInterface: true,
                line: lineNum,
                indent: match[1],
                original: lines[lineNum - 1],
                index: match.index
            });
        }

        // Filter to only non-exported types
        const nonExportedTypes = typeDeclarations.filter(t => !t.isExported);
        const exportedTypes = typeDeclarations.filter(t => t.isExported);

        // Rule 1: If there's exactly ONE non-exported type/interface, it must be named "Props"
        if (nonExportedTypes.length === 1) {
            const typeDecl = nonExportedTypes[0];

            // Check if it's not named Props
            if (typeDecl.name !== 'Props') {
                issues.push({
                    file: path.relative(this.projectRoot, filePath),
                    absolutePath: filePath,
                    line: typeDecl.line,
                    type: 'wrong_name',
                    currentName: typeDecl.name,
                    expectedName: 'Props',
                    isInterface: typeDecl.isInterface,
                    original: typeDecl.original,
                    indent: typeDecl.indent,
                    severity: 'high'
                });
            }

            // Check if it's an interface (should be type)
            if (typeDecl.isInterface && typeDecl.name === 'Props') {
                issues.push({
                    file: path.relative(this.projectRoot, filePath),
                    absolutePath: filePath,
                    line: typeDecl.line,
                    type: 'interface_to_type',
                    currentName: typeDecl.name,
                    isInterface: true,
                    original: typeDecl.original,
                    indent: typeDecl.indent,
                    severity: 'medium'
                });
            }
        }

        // Rule 2: Exported types should NOT be named "Props"
        for (const typeDecl of exportedTypes) {
            if (typeDecl.name === 'Props') {
                issues.push({
                    file: path.relative(this.projectRoot, filePath),
                    absolutePath: filePath,
                    line: typeDecl.line,
                    type: 'exported_props',
                    currentName: 'Props',
                    isInterface: typeDecl.isInterface,
                    original: typeDecl.original,
                    severity: 'warning'
                });
            }
        }

        // Rule 3: Any non-exported interface should be converted to type
        for (const typeDecl of nonExportedTypes) {
            if (typeDecl.isInterface && typeDecl.name !== 'Props') {
                // This will be handled along with the rename
            }
        }

        return issues;
    }

    getLineNumber(content, position) {
        return content.substring(0, position).split('\n').length;
    }

    fixFile(filePath, fileIssues, dryRun = false) {
        if (fileIssues.length === 0) return 0;

        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let fixedCount = 0;

            // Sort by line number descending
            const sortedIssues = [...fileIssues].sort((a, b) => b.line - a.line);

            for (const issue of sortedIssues) {
                if (issue.type === 'exported_props') {
                    // We can't auto-fix this, just report
                    if (dryRun) {
                        console.log(`\n  ${c('yellow', '⚠️')}  Line ${issue.line}: Exported type named 'Props' - needs manual rename`);
                    }
                    continue;
                }

                const lines = content.split('\n');
                const lineIndex = issue.line - 1;
                const line = lines[lineIndex];

                let newLine = line;

                if (issue.type === 'wrong_name') {
                    // Rename the type/interface to Props and convert interface to type
                    if (issue.isInterface) {
                        // Convert: interface Name { -> type Props = {
                        newLine = line.replace(
                            new RegExp(`interface\\s+${issue.currentName}\\s*\\{`),
                            `type Props = {`
                        );
                    } else {
                        // Rename: type Name = -> type Props =
                        newLine = line.replace(
                            new RegExp(`type\\s+${issue.currentName}\\s*=`),
                            `type Props =`
                        );
                    }

                    // Also replace all usages of the old name in the file
                    if (!dryRun) {
                        // Only replace type annotation contexts
                        const typeContextPatterns = [
                            new RegExp(`:\\s*${issue.currentName}\\b`, 'g'),      // : TypeName
                            new RegExp(`<${issue.currentName}\\b`, 'g'),          // <TypeName
                            new RegExp(`as\\s+${issue.currentName}\\b`, 'g'),     // as TypeName
                        ];
                        for (const pattern of typeContextPatterns) {
                            content = content.replace(pattern, (match) => 
                                match.replace(issue.currentName, 'Props')
                            );
                        }
                    }
                } else if (issue.type === 'interface_to_type') {
                    // Convert: interface Props { -> type Props = {
                    newLine = line.replace(
                        /interface\s+Props\s*\{/,
                        'type Props = {'
                    );
                }

                if (dryRun) {
                    console.log(`\n  ${c('dim', `Line ${issue.line}:`)}`);
                    console.log(`  ${c('red', '-')} ${line.trim()}`);
                    console.log(`  ${c('green', '+')} ${newLine.trim()}`);
                } else {
                    lines[lineIndex] = newLine;
                    content = lines.join('\n');
                }

                fixedCount++;
            }

            if (!dryRun && fixedCount > 0) {
                this.createBackup(filePath, fs.readFileSync(filePath, 'utf8'));
                fs.writeFileSync(filePath, content, 'utf8');
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
        manifest[backupPath] = { originalPath: filePath, timestamp: new Date().toISOString() };
        this.saveManifest(manifest);
        fs.writeFileSync(backupPath, content, 'utf8');
    }

    loadManifest() {
        const manifestPath = path.join(this.backupDir, 'manifest.json');
        try {
            if (fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
        if (this.options.scope) console.log(`${c('cyan', '📂')} Scope: ${this.options.scope}`);
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
            console.log(`${c('green', '✅')} No Props naming issues found!`);
            return;
        }

        console.log(dryRun ?
            `${c('cyan', '👀')} DRY RUN - Showing what would be changed:\n` :
            `${c('yellow', '🔧')} Fixing issues...\n`);

        const issuesByFile = {};
        for (const issue of this.issues) {
            if (!issuesByFile[issue.absolutePath]) issuesByFile[issue.absolutePath] = [];
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
            console.log(`${c('cyan', '📊')} Would fix ${c('bold', totalFixed)} Props naming issues.`);
            console.log(`${c('yellow', '🔧')} Run with ${c('bold', '--fix')} to apply changes.`);
        } else {
            console.log(`${c('green', '✅')} Fixed ${c('bold', totalFixed)} Props naming issues.`);
            console.log(`${c('cyan', '💾')} Backups saved to: ${this.backupDir}`);
            console.log(`${c('yellow', '🔄')} Run with ${c('bold', '--revert')} to undo changes.`);
        }
    }

    generateReport() {
        console.log(`${c('bold', '📊 Props Naming Analysis Report')}`);
        console.log('═════════════════════════════════');
        console.log(`Files analyzed: ${c('cyan', this.fileCount)}`);
        console.log(`Issues found: ${this.issueCount > 0 ? c('yellow', this.issueCount) : c('green', '0')}`);
        console.log('');

        if (this.issues.length === 0) {
            console.log(`${c('green', '✅')} No Props naming issues found! Your code follows the convention.`);
            return;
        }

        const wrongNameIssues = this.issues.filter(i => i.type === 'wrong_name');
        const interfaceIssues = this.issues.filter(i => i.type === 'interface_to_type');
        const exportedPropsIssues = this.issues.filter(i => i.type === 'exported_props');

        console.log(`${c('yellow', '⚠️')}  PROPS NAMING ISSUES`);
        console.log('═════════════════════\n');

        if (wrongNameIssues.length > 0) {
            console.log(`${c('red', '🔴')} Single non-exported type not named "Props": ${wrongNameIssues.length}`);
            wrongNameIssues.slice(0, 5).forEach(issue => {
                console.log(`   ${c('cyan', issue.file)}:${issue.line}`);
                console.log(`   ${c('dim', 'Current:')} ${issue.currentName} → ${c('green', 'Props')}`);
            });
            if (wrongNameIssues.length > 5) console.log(`   ${c('dim', `... and ${wrongNameIssues.length - 5} more`)}`);
            console.log('');
        }

        if (interfaceIssues.length > 0) {
            console.log(`${c('yellow', '🟡')} Interface should be type: ${interfaceIssues.length}`);
            interfaceIssues.slice(0, 3).forEach(issue => {
                console.log(`   ${c('cyan', issue.file)}:${issue.line}`);
            });
            if (interfaceIssues.length > 3) console.log(`   ${c('dim', `... and ${interfaceIssues.length - 3} more`)}`);
            console.log('');
        }

        if (exportedPropsIssues.length > 0) {
            console.log(`${c('magenta', '⚠️')}  Exported type named "Props" (needs manual fix): ${exportedPropsIssues.length}`);
            exportedPropsIssues.forEach(issue => {
                console.log(`   ${c('cyan', issue.file)}:${issue.line}`);
            });
            console.log('');
        }

        console.log(`\n${c('bold', '📝 CONVENTION')}`);
        console.log('══════════════');
        console.log(`${c('green', '✅')} type Props = { ... }           ${c('dim', '// Single non-exported type')}`);
        console.log(`${c('red', '❌')} type ComponentProps = { ... }  ${c('dim', '// Wrong name')}`);
        console.log(`${c('red', '❌')} interface Props { ... }        ${c('dim', '// Should be type')}`);
        console.log(`${c('red', '❌')} export type Props = { ... }    ${c('dim', '// Exported should have specific name')}`);
    }
}

async function interactiveMode() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    const analyzer = new PropsNamingAnalyzer({});
    const webAppDir = analyzer.findWebAppDir();

    console.log(`
${c('bold', c('cyan', '╔═══════════════════════════════════════════╗'))}
${c('bold', c('cyan', '║'))}     ${c('bold', '🔍 Props Naming Analyzer')}              ${c('bold', c('cyan', '║'))}
${c('bold', c('cyan', '╚═══════════════════════════════════════════╝'))}

${c('dim', 'Enforces: Single non-exported type/interface must be named "Props"')}

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
            await new PropsNamingAnalyzer({}).analyzeDirectory(webAppDir);
            break;
        case '2':
            console.log('');
            await new PropsNamingAnalyzer({ dryRun: true }).analyzeDirectory(webAppDir);
            break;
        case '3':
            const confirm = await question(`\n${c('yellow', '⚠️')}  This will modify files. Continue? (y/N): `);
            if (confirm.toLowerCase() === 'y') {
                console.log('');
                await new PropsNamingAnalyzer({ fix: true }).analyzeDirectory(webAppDir);
            } else {
                console.log(`${c('dim', 'Cancelled.')}`);
            }
            break;
        case '4':
            console.log('');
            new PropsNamingAnalyzer({}).revertBackups();
            break;
        case '5':
            const scopePath = await question(`\n${c('cyan', '📂')} Enter path pattern (e.g., features/editor): `);
            console.log('');
            await new PropsNamingAnalyzer({ scope: scopePath.trim() || undefined }).analyzeDirectory(webAppDir);
            break;
        case '0':
            console.log(`${c('dim', 'Goodbye!')}`);
            break;
        default:
            console.log(`${c('red', 'Invalid choice.')}`);
    }

    rl.close();
}

function showHelp() {
    console.log(`
${c('bold', 'Props Naming Analyzer')}
══════════════════════

Enforces the Props naming convention:
- Single non-exported type/interface must be named "Props"
- Interfaces should be converted to type
- Exported types should NOT be named "Props"

${c('bold', 'Usage:')}
  node scripts/props-naming-analyzer.js              ${c('dim', '# Interactive mode')}
  node scripts/props-naming-analyzer.js [dir] [opts] ${c('dim', '# Direct mode')}

${c('bold', 'Options:')}
  ${c('cyan', '--fix')}           Auto-fix issues (creates backups first)
  ${c('cyan', '--dry-run')}       Show what would be fixed without changes
  ${c('cyan', '--revert')}        Revert all backups from last fix
  ${c('cyan', '--scope=<path>')}  Only analyze files matching path pattern
  ${c('cyan', '--help')}          Show this help message

${c('bold', 'Examples:')}
  node scripts/props-naming-analyzer.js
  node scripts/props-naming-analyzer.js --dry-run
  node scripts/props-naming-analyzer.js --fix
  node scripts/props-naming-analyzer.js --scope=features/editor

${c('bold', 'What it fixes:')}
  ${c('red', '❌')} type ComponentProps = {}  →  ${c('green', '✅')} type Props = {}
  ${c('red', '❌')} interface Props {}        →  ${c('green', '✅')} type Props = {}
`);
}

async function main() {
    const args = process.argv.slice(2);

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
    if (scopeArg) options.scope = scopeArg.split('=')[1];

    if (options.help) { showHelp(); return; }

    const analyzer = new PropsNamingAnalyzer(options);

    if (options.revert) { analyzer.revertBackups(); return; }

    const targetDir = args.find(arg => !arg.startsWith('--')) || analyzer.findWebAppDir();

    console.log(`${c('cyan', '🚀')} Starting Props Naming Analysis...`);
    console.log(`${c('cyan', '📁')} Target directory: ${path.relative(analyzer.projectRoot, targetDir) || '.'}`);

    await analyzer.analyzeDirectory(targetDir);
}

main().catch(console.error);
