import os
import re
import sys

# Configuration
ROOT_DIR = "/home/remcostoeten/dev/huidige_skriuw"
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx'}
IGNORE_DIRS = {'node_modules', '.next', 'dist', '.git', '.turbo', 'build', '.vercel'}

# Known entry point patterns (regex for filenames)
ENTRY_POINT_FILES = {
    r'page\.(tsx|jsx|ts|js)$',
    r'layout\.(tsx|jsx|ts|js)$',
    r'loading\.(tsx|jsx|ts|js)$',
    r'error\.(tsx|jsx|ts|js)$',
    r'not-found\.(tsx|jsx|ts|js)$',
    r'template\.(tsx|jsx|ts|js)$',
    r'route\.(ts|js)$',
    r'middleware\.(ts|js)$',
    r'next\.config\.(ts|js|mjs)$',
    r'postcss\.config\.(js|mjs)$',
    r'tailwind\.config\.(ts|js)$',
    r'jest\.config\.(ts|js)$',
    r'robots\.ts$',
    r'sitemap\.ts$',
}

# Path mappings (simplified based on common conventions and checked tsconfig)
# We will primarily look for file basename usage and explicit path resolution where possible.
# But for a "deep dive" valid first pass, we can use a "mentioned" heuristic?
# Actually, strict import resolution is better.

def get_all_files(root_dir):
    all_files = []
    for root, dirs, files in os.walk(root_dir):
        # Filter directories inplace
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in EXTENSIONS:
                all_files.append(os.path.join(root, file))
    return all_files

def extract_imports(file_path):
    imports = set()
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Regex for static imports
            # import ... from '...'
            static_matches = re.findall(r'from\s+[\'"]([^\'"]+)[\'"]', content)
            imports.update(static_matches)
            
            # Regex for require
            require_matches = re.findall(r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)', content)
            imports.update(require_matches)
            
            # Regex for dynamic imports import('...')
            dynamic_matches = re.findall(r'import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)', content)
            imports.update(dynamic_matches)

    except Exception as e:
        # print(f"Error reading {file_path}: {e}")
        pass
    return imports

def resolve_import(import_path, source_file, all_files_set):
    """
    Attempts to resolve an import string to a concrete file path.
    """
    possible_paths = []
    
    # helper for extension checking
    def try_exts(base_path):
        cands = []
        cands.append(base_path) # exact match (unlikely for ts)
        for ext in EXTENSIONS:
            cands.append(base_path + ext)
            cands.append(os.path.join(base_path, 'index' + ext))
        return cands

    # 1. Relative imports
    if import_path.startswith('.'):
        source_dir = os.path.dirname(source_file)
        abs_path = os.path.normpath(os.path.join(source_dir, import_path))
        possible_paths.extend(try_exts(abs_path))
    
    # 2. Alias imports (@/)
    elif import_path.startswith('@/'):
        # Assuming @ maps to apps/web/something? 
        # Based on typical next.js monorepo:
        # If we are in apps/web, @/ usually maps to apps/web/src/ or similar.
        # But wait, the user's file list showed `apps/web/lib`, not `src/lib`.
        # Let's verify commonly used roots.
        # We'll try resolving @/ relative to `apps/web/` if valid, or `src/` if valid.
        
        # Hardcoding a common assumption for this specific user structure:
        # /home/remcostoeten/dev/huidige_skriuw/apps/web directory structure doesn't have src at root?
        # Checked list_dir: has `app`, `components`, `lib`. No `src` at apps/web root?
        # Wait, list_dir output: "app", "components", "lib" are directly in apps/web.
        # So @/ likely maps to apps/web/
        
        web_root = os.path.join(ROOT_DIR, 'apps/web')
        suffix = import_path[2:] # remove @/
        abs_path = os.path.normpath(os.path.join(web_root, suffix))
        possible_paths.extend(try_exts(abs_path))

    # 3. Monorepo packages (@skriuw/...)
    elif import_path.startswith('@skriuw/'):
        # e.g. @skriuw/db -> packages/db/src/index.ts (usually)
        # We won't resolve these fully to *files* inside the package easily without reading package.json exports.
        # But we can try a simple mapping if they import specific files.
        pass

    # Check existence
    for p in possible_paths:
        if p in all_files_set:
            return p
    
    return None

def main():
    print("Scanning for files...", file=sys.stderr)
    all_files = get_all_files(ROOT_DIR)
    all_files_set = set(all_files)
    
    print(f"Found {len(all_files)} files.", file=sys.stderr)
    
    # Build reference map: defined_file -> count
    ref_counts = {f: 0 for f in all_files}
    
    print("Analyzing imports...", file=sys.stderr)
    for f in all_files:
        imports = extract_imports(f)
        for imp in imports:
            resolved = resolve_import(imp, f, all_files_set)
            if resolved:
                ref_counts[resolved] += 1
            # else:
                # Could capture unresolved imports for debugging
                # pass

    # Filter for unused
    unused = []
    for f, count in ref_counts.items():
        if count == 0:
            # Check if it's an entry point
            basename = os.path.basename(f)
            is_entry = False
            for pattern in ENTRY_POINT_FILES:
                if re.search(pattern, basename):
                    is_entry = True
                    break
            
            # Special ignore for shadcn-like components logs? or scripts/
            if '/scripts/' in f: # often standalone
                is_entry = True
            
            if not is_entry:
                unused.append(f)
    
    # Print results
    print(f"# Unused Files Report")
    print(f"Total files scanned: {len(all_files)}")
    print(f"Potential unused files found: {len(unused)}")
    print("\n---")
    
    for f in sorted(unused):
        # print relative path
        rel = os.path.relpath(f, ROOT_DIR)
        print(f"- [ ] {rel}")

if __name__ == "__main__":
    main()
