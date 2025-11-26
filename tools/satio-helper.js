#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { pathToFileURL } from 'url';

// Simple colors for terminal output
const colors = {
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m'
};

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'note';
}

async function prompt(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${colors.blue}${question}${colors.reset}`, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function detectMarkdownFiles(dir = '.') {
    const files = [];

    function scan(currentDir, depth = 0) {
        if (depth > 3) return; // Limit depth

        try {
            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                if (item.startsWith('.') || item === 'node_modules') continue;

                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scan(fullPath, depth + 1);
                } else if (item.endsWith('.md') || item.endsWith('.mdx')) {
                    files.push(fullPath);
                }
            }
        } catch (err) {
            // Skip directories we can't read
        }
    }

    scan(dir);
    return files;
}

function extractTitleFromMarkdown(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Try to find first H1
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) return h1Match[1].trim();

        // Try to find first H2 if no H1
        const h2Match = content.match(/^##\s+(.+)$/m);
        if (h2Match) return h2Match[1].trim();

        // Fallback to filename
        const name = path.basename(filePath, path.extname(filePath));
        return name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch {
        return path.basename(filePath, path.extname(filePath));
    }
}

function generateCommand(inputPath, name, folder, slug) {
    let command = 'bun run satio';

    command += ` --input "${inputPath}"`;
    command += ` --name "${name}"`;

    if (folder) {
        command += ` --folder "${folder}"`;
    }

    if (slug) {
        command += ` --slug "${slug}"`;
    }

    return command;
}

async function main() {
    console.log(`${colors.bright}${colors.blue}🌱 Satio Helper - Quick Command Generator${colors.reset}\n`);

    // Find markdown files
    const files = detectMarkdownFiles();

    if (files.length === 0) {
        console.log(`${colors.yellow}No markdown files found in current directory.${colors.reset}`);
        process.exit(0);
    }

    console.log(`${colors.green}Found ${files.length} markdown files:${colors.reset}\n`);

    // Display files with numbers
    files.forEach((file, index) => {
        const relativePath = path.relative(process.cwd(), file);
        const title = extractTitleFromMarkdown(file);
        console.log(`${colors.blue}${index + 1}.${colors.reset} ${relativePath}`);
        console.log(`   ${colors.dim}→ ${title}${colors.reset}`);
    });

    console.log('');
    const choice = await prompt('Select a file (enter number) or type a custom path: ');

    let selectedPath;
    const fileIndex = parseInt(choice, 10);

    if (!isNaN(fileIndex) && fileIndex >= 1 && fileIndex <= files.length) {
        selectedPath = files[fileIndex - 1];
    } else {
        selectedPath = choice;
        if (!fs.existsSync(selectedPath)) {
            console.log(`${colors.yellow}File not found: ${selectedPath}${colors.reset}`);
            process.exit(1);
        }
    }

    // Auto-detect title
    const autoTitle = extractTitleFromMarkdown(selectedPath);
    const title = await prompt(`Note title [${autoTitle}]: `) || autoTitle;

    const folder = await prompt('Parent folder (optional): ');

    const autoSlug = slugify(title);
    const slug = await prompt(`Custom slug [${autoSlug}] (optional): `) || undefined;

    const command = generateCommand(selectedPath, title, folder, slug);

    console.log(`\n${colors.bright}${colors.green}Generated command:${colors.reset}`);
    console.log(`${colors.yellow}${command}${colors.reset}\n`);

    const shouldRun = await prompt('Run this command now? [y/N]: ');

    if (shouldRun.toLowerCase() === 'y' || shouldRun.toLowerCase() === 'yes') {
        console.log(`\n${colors.blue}Running: ${command}${colors.reset}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`${colors.yellow}Error: ${error.message}${colors.reset}`);
                return;
            }
            if (stderr) {
                console.error(`${colors.yellow}Warning: ${stderr}${colors.reset}`);
            }
            console.log(stdout);
        });
    } else {
        console.log(`${colors.dim}Command copied to clipboard if you have pbcopy/clip available.${colors.reset}`);
    }
}

// Run main if this is the entry point (when executed directly)
const isMainModule = import.meta.url === pathToFileURL(process.argv[1]).href || 
                     process.argv[1]?.includes('satio-helper.js');

if (isMainModule) {
    main().catch(console.error);
}

export { generateCommand, detectMarkdownFiles, extractTitleFromMarkdown };