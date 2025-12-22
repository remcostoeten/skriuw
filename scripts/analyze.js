#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

/**
 * Code Analyzer Suite
 * 
 * Interactive launcher for all code analysis tools:
 * - Arrow Function Analyzer
 * - Callback Analyzer
 * - Props Naming Analyzer
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
    white: '\x1b[37m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

const ANALYZERS = {
    arrow: {
        name: 'Arrow Function Analyzer',
        file: 'arrow-function-analyzer.js',
        description: 'Converts const arrow functions to function declarations',
        icon: '🎯',
        rules: [
            'const Component = () => {}  →  function Component() {}',
            'Allows: useCallback, useMemo, create*, stores',
        ]
    },
    callback: {
        name: 'Callback Analyzer',
        file: 'callback-analyzer.js',
        description: 'Finds callbacks that need useCallback/useMemo',
        icon: '⚡',
        rules: [
            'Detects inline callbacks in JSX props',
            'Finds useEffect dependencies needing memoization',
        ]
    },
    props: {
        name: 'Props Naming Analyzer',
        file: 'props-naming-analyzer.js',
        description: 'Enforces Props naming convention',
        icon: '📋',
        rules: [
            'Single non-exported type must be named "Props"',
            'Converts interface to type',
        ]
    }
};

function runAnalyzer(analyzerKey, args = []) {
    const analyzer = ANALYZERS[analyzerKey];
    const scriptPath = path.join(__dirname, 'analyzers', analyzer.file);

    console.log(`\n${c('cyan', analyzer.icon)} Running ${c('bold', analyzer.name)}...`);
    console.log(`${c('dim', '─'.repeat(50))}\n`);

    const child = spawn('node', [scriptPath, ...args], {
        stdio: 'inherit',
        cwd: process.cwd()
    });

    return new Promise((resolve, reject) => {
        child.on('close', code => resolve(code));
        child.on('error', err => reject(err));
    });
}

function showBanner() {
    console.log(`
${c('cyan', '╔═══════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}                                                           ${c('cyan', '║')}
${c('cyan', '║')}   ${c('bold', '🔧 Code Analyzer Suite')}                                  ${c('cyan', '║')}
${c('cyan', '║')}   ${c('dim', 'Automated code quality and convention enforcement')}        ${c('cyan', '║')}
${c('cyan', '║')}                                                           ${c('cyan', '║')}
${c('cyan', '╚═══════════════════════════════════════════════════════════╝')}
`);
}

function showAnalyzerInfo() {
    console.log(`${c('bold', 'Available Analyzers:')}\n`);

    Object.entries(ANALYZERS).forEach(([key, analyzer], index) => {
        console.log(`  ${c('cyan', `${index + 1})`)} ${analyzer.icon} ${c('bold', analyzer.name)}`);
        console.log(`     ${c('dim', analyzer.description)}`);
        analyzer.rules.forEach(rule => {
            console.log(`     ${c('dim', '•')} ${c('dim', rule)}`);
        });
        console.log('');
    });
}

function showHelp() {
    showBanner();
    console.log(`${c('bold', 'Usage:')}
  node scripts/analyze.js              ${c('dim', '# Interactive mode')}
  node scripts/analyze.js <analyzer>   ${c('dim', '# Run specific analyzer')}
  node scripts/analyze.js all          ${c('dim', '# Run all analyzers')}

${c('bold', 'Analyzers:')}
  ${c('cyan', 'arrow')}      Arrow Function Analyzer
  ${c('cyan', 'callback')}   Callback Memoization Analyzer
  ${c('cyan', 'props')}      Props Naming Analyzer
  ${c('cyan', 'all')}        Run all analyzers sequentially

${c('bold', 'Options:')}
  ${c('cyan', '--help')}     Show this help message

${c('bold', 'Examples:')}
  node scripts/analyze.js arrow --dry-run
  node scripts/analyze.js props --fix
  node scripts/analyze.js callback --scope=features/editor
  node scripts/analyze.js all

${c('bold', 'Common Flags (passed to analyzers):')}
  ${c('cyan', '--fix')}           Auto-fix issues (creates backups)
  ${c('cyan', '--dry-run')}       Preview fixes without applying
  ${c('cyan', '--revert')}        Revert last fix
  ${c('cyan', '--scope=<path>')}  Limit to specific directory
`);
}

async function interactiveMode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    showBanner();
    showAnalyzerInfo();

    console.log(`${c('bold', 'Actions:')}
  ${c('cyan', '1)')} Run Arrow Function Analyzer
  ${c('cyan', '2)')} Run Callback Analyzer
  ${c('cyan', '3)')} Run Props Naming Analyzer
  ${c('cyan', '4)')} Run All Analyzers
  ${c('cyan', '0)')} Exit
`);

    const choice = await question(`${c('cyan', '→')} Enter choice (0-4): `);

    const analyzerKeys = ['arrow', 'callback', 'props'];

    switch (choice.trim()) {
        case '1':
        case '2':
        case '3':
            const selectedKey = analyzerKeys[parseInt(choice) - 1];
            console.log('');

            const modeChoice = await question(`${c('cyan', '→')} Mode: ${c('dim', '(1) Analyze  (2) Dry-run  (3) Fix  (4) Scoped')}: `);

            let args = [];
            switch (modeChoice.trim()) {
                case '2':
                    args = ['--dry-run'];
                    break;
                case '3':
                    const confirm = await question(`${c('yellow', '⚠️')}  This will modify files. Continue? (y/N): `);
                    if (confirm.toLowerCase() !== 'y') {
                        console.log(`${c('dim', 'Cancelled.')}`);
                        rl.close();
                        return;
                    }
                    args = ['--fix'];
                    break;
                case '4':
                    const scope = await question(`${c('cyan', '📂')} Enter path pattern: `);
                    if (scope.trim()) {
                        args = [`--scope=${scope.trim()}`];
                    }
                    break;
            }

            rl.close();
            await runAnalyzer(selectedKey, args);
            break;

        case '4':
            console.log(`\n${c('cyan', '🚀')} Running all analyzers...\n`);
            rl.close();

            for (const key of analyzerKeys) {
                await runAnalyzer(key, []);
                console.log('');
            }

            console.log(`${c('green', '✅')} All analyzers complete!`);
            break;

        case '0':
            console.log(`${c('dim', 'Goodbye!')}`);
            rl.close();
            break;

        default:
            console.log(`${c('red', 'Invalid choice.')}`);
            rl.close();
    }
}

async function main() {
    const args = process.argv.slice(2);

    // No args = interactive mode
    if (args.length === 0) {
        await interactiveMode();
        return;
    }

    // Help
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        return;
    }

    const analyzerArg = args[0];
    const passThroughArgs = args.slice(1);

    // Run all
    if (analyzerArg === 'all') {
        showBanner();
        console.log(`${c('cyan', '🚀')} Running all analyzers...\n`);

        for (const key of Object.keys(ANALYZERS)) {
            await runAnalyzer(key, passThroughArgs);
            console.log('');
        }

        console.log(`${c('green', '✅')} All analyzers complete!`);
        return;
    }

    // Run specific analyzer
    if (ANALYZERS[analyzerArg]) {
        await runAnalyzer(analyzerArg, passThroughArgs);
        return;
    }

    // Unknown command
    console.error(`${c('red', '❌')} Unknown analyzer: ${analyzerArg}`);
    console.log(`${c('dim', 'Available:')} arrow, callback, props, all`);
    console.log(`${c('dim', 'Run with --help for more info')}`);
    process.exit(1);
}

main().catch(err => {
    console.error(`${c('red', '❌')} Error: ${err.message}`);
    process.exit(1);
});
