import subprocess
import re
import argparse
import os
import sys
import time
import json
from datetime import datetime
from pathlib import Path
import math
import threading
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

# Optional dependency flags
PYPERCLIP_AVAILABLE = False
try:
    import pyperclip  # type: ignore
    PYPERCLIP_AVAILABLE = True
except Exception:
    PYPERCLIP_AVAILABLE = False

try:
    from rich.console import Console
    from rich.text import Text
    from rich.panel import Panel
    from rich.table import Table
    from rich.prompt import Prompt
    from rich.live import Live
    from rich.layout import Layout
    from rich.align import Align
    from rich import box
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    print("Note: Install 'rich' library for enhanced secret display features: pip install rich")


SCRIPT_VERSION = "1.2"
LAST_UPDATED_TIMESTAMP = "13-08-2025 12:49:30 UTC"

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    PURPLE = '\033[35m'
    YELLOW = '\033[33m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    GRAY = '\033[90m'
    BRIGHT_CYAN = '\033[96m'
    BRIGHT_WHITE = '\033[97m'
    ORANGE = '\033[38;5;208m'
    LIGHT_BLUE = '\033[38;5;117m'


CONTENT_WIDTH = 60
STATE_FILE = Path.home() / ".turso_gen_state.json"
CONFIG_FILE = Path.home() / ".turso_gen_config.json"
VENV_DIR = Path.home() / ".turso_gen_venv"
REEXEC_ENV_FLAG = "TURSO_GEN_REEXEC"
DELETION_BACKUP_DIR = Path.home() / ".turso_deletion_backups"

# This main function has been moved to the end of the file

class SecretDisplay:
    """Class to handle secret display with asterisks and reveal functionality."""
    
    def __init__(self, secret, name="secret"):
        self.secret = secret
        self.name = name
        self.is_revealed = False
    
    def get_masked_display(self):
        """Return the secret masked with asterisks."""
        if len(self.secret) <= 8:
            return "*" * len(self.secret)
        else:
            
            return f"{self.secret[:4]}{'*' * (len(self.secret) - 8)}{self.secret[-4:]}"
    
    def get_full_display(self):
        """Return the full secret."""
        return self.secret
    
    def get_display(self, reveal=False):
        """Get the display version of the secret."""
        if reveal or self.is_revealed:
            return self.get_full_display()
        return self.get_masked_display()
    
    def toggle_reveal(self):
        """Toggle the reveal state."""
        self.is_revealed = not self.is_revealed
        return self.is_revealed
    
    def create_interactive_display(self):
        """Create an interactive display with reveal option."""
        if RICH_AVAILABLE:
            return self._create_rich_display()
        else:
            return self._create_simple_display()
    
    def _create_rich_display(self):
        """Create a rich-formatted interactive display."""
        from rich.text import Text
        from rich.panel import Panel
        from rich import print as rprint
        
        masked = self.get_masked_display()
        console = Console()
        
        
        text = Text()
        text.append(f"{self.name.upper()}: ", style="bold white")
        text.append(masked, style="bright_cyan")
        text.append(" ", style="")
        text.append("[Press 'r' to reveal]", style="dim cyan")
        
        return Panel(text, title=f"🔐 {self.name.title()}", border_style="cyan")
    
    def _create_simple_display(self):
        """Create a simple text display."""
        masked = self.get_masked_display()
        return f"{Colors.BOLD}{Colors.ORANGE}{self.name.upper()}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{masked}{Colors.ENDC} {Colors.CYAN}[Press 'r' to reveal]{Colors.ENDC}"
    
    @staticmethod
    def interactive_reveal_prompt(secrets_dict):
        """Interactive prompt to reveal secrets."""
        if not secrets_dict:
            return
            
        print(f"\n{Colors.BOLD}{Colors.CYAN}Secret Management:{Colors.ENDC}")
        print(f"{Colors.GRAY}Press 'r' + Enter to reveal all secrets, or Enter to continue{Colors.ENDC}")
        
        try:
            user_input = input(f"{Colors.BOLD}{Colors.ORANGE}Action (r/Enter): {Colors.ENDC}").strip().lower()
            
            if user_input == 'r':
                print(f"\n{Colors.BOLD}{Colors.OKGREEN}🔓 Secrets Revealed:{Colors.ENDC}")
                for name, secret_obj in secrets_dict.items():
                    print(f"{Colors.BOLD}{Colors.ORANGE}{name.upper()}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{secret_obj.get_full_display()}{Colors.ENDC}")
                
                
                copy_input = input(f"\n{Colors.BOLD}{Colors.ORANGE}Copy revealed secrets to clipboard? (y/N): {Colors.ENDC}").strip().lower()
                if copy_input == 'y':
                    try:
                        clipboard_content = "\n".join([f"{name.upper()}={secret_obj.get_full_display()}" for name, secret_obj in secrets_dict.items()])
                        pyperclip.copy(clipboard_content)
                        print_success("Revealed secrets copied to clipboard!")
                    except Exception as e:
                        print_warning(f"Could not copy to clipboard: {e}")
                        
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to continue...{Colors.ENDC}")
                
        except KeyboardInterrupt:
            print_info("\nContinuing with masked secrets...")

def cmd_exists(exe_name):
    return shutil.which(exe_name) is not None

def run_pip_install(packages, use_user=True):
    cmd = [sys.executable, "-m", "pip", "install"]
    if use_user:
        cmd.append("--user")
    cmd.extend(packages)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0, result.stdout + "\n" + result.stderr
    except Exception as e:
        return False, str(e)

def run_uv_pip_install(packages):
    # Supports uv or uvx; prefer 'uv' if present
    uv_bin = None
    for cand in ["uv", "uvx"]:
        if cmd_exists(cand):
            uv_bin = cand
            break
    if not uv_bin:
        return False, "uv/uvx not found"
    cmd = [uv_bin, "pip", "install", "--user"]
    cmd.extend(packages)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0, result.stdout + "\n" + result.stderr
    except Exception as e:
        return False, str(e)

def try_import(module_name):
    try:
        __import__(module_name)
        return True
    except Exception:
        return False

def bootstrap_dependencies(auto_confirm=False):
    global PYPERCLIP_AVAILABLE
    # Minimal Python version check
    if sys.version_info < (3, 6):
        print("Python 3.6+ is required to run this script.")
        sys.exit(1)

    # Skip all prompts in auto-confirm mode
    if auto_confirm:
        # Try to import pyperclip silently
        try:
            import pyperclip
            PYPERCLIP_AVAILABLE = True
        except:
            PYPERCLIP_AVAILABLE = False
        return

    # Ensure pyperclip (required for clipboard UX, but we can continue without it)
    if not PYPERCLIP_AVAILABLE:
        print("\n[!] Missing Python package: pyperclip (for clipboard support)")
        consent = None
        try:
            consent = input("Install 'pyperclip' now? (y/N): ").strip().lower()
        except Exception:
            consent = "n"
        if consent == "y":
            # Try pip --user first
            ok, out = run_pip_install(["pyperclip"], use_user=True)
            if not ok:
                # Try uv pip as fallback if available
                ok, out2 = run_uv_pip_install(["pyperclip"])
                out = out + "\n" + out2
            if ok and try_import("pyperclip"):
                import pyperclip  # type: ignore
                PYPERCLIP_AVAILABLE = True
                print("[ok] Installed 'pyperclip'.")
            else:
                print("[!] Could not install 'pyperclip'. Clipboard features may be limited.")
        else:
            print("[i] Continuing without 'pyperclip'. You can still copy manually.")

    # Offer to install rich (optional)
    if not RICH_AVAILABLE:
        try:
            consent_rich = input("Install optional 'rich' for enhanced display? (y/N): ").strip().lower()
        except Exception:
            consent_rich = "n"
        if consent_rich == "y":
            ok, _ = run_pip_install(["rich"], use_user=True)
            if not ok:
                ok, _ = run_uv_pip_install(["rich"])
            if ok and try_import("rich"):
                try:
                    from rich.console import Console  # noqa: F401
                    print("[ok] Installed 'rich'.")
                    # We won't flip RICH_AVAILABLE dynamically to avoid re-importing rich widgets everywhere
                    # The rest of the script already gracefully degrades without rich.
                except Exception:
                    pass

    # External CLI guidance
    if not cmd_exists("turso"):
        print("\n[!] Turso CLI not found in PATH.")
        print("    Install with: curl -sSfL https://get.tur.so/install.sh | bash")
        print("    Docs: https://docs.turso.tech/reference/turso-cli")


def print_ascii_header():
    """Print a beautiful ASCII header with version and update info."""
    
    version_text = f"Version: {SCRIPT_VERSION}"
    last_updated_text = f"Last Updated: {LAST_UPDATED_TIMESTAMP}"

    
    info_line_plain = f"{version_text}  {last_updated_text}"
    info_line_colored = f"{Colors.BOLD}{Colors.WHITE}{version_text}{Colors.ENDC}  {Colors.GRAY}{last_updated_text}{Colors.ENDC}"

    
    visible_length = len(info_line_plain)

    
    if visible_length < CONTENT_WIDTH:
        total_padding = CONTENT_WIDTH - visible_length
        left_padding = total_padding // 2
        right_padding = total_padding - left_padding 
    else:
        left_padding = 0
        right_padding = 0
        
        
        

    centered_info_line = f"{' ' * left_padding}{info_line_colored}{' ' * right_padding}"

    
    
    
    

    print(f"""
{Colors.CYAN}╔══════════════════════════════════════════════════════════════╗
║{centered_info_line}{Colors.CYAN}║
║                                                              ║
║  {Colors.BOLD}{Colors.WHITE}        ████████╗██╗   ██╗██████╗ ███████╗ ██████╗{Colors.ENDC}{Colors.CYAN}          ║
║  {Colors.BOLD}{Colors.WHITE}        ╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔═══██╗{Colors.ENDC}{Colors.CYAN}         ║
║  {Colors.BOLD}{Colors.WHITE}           ██║   ██║   ██║██████╔╝███████╗██║   ██║{Colors.ENDC}{Colors.CYAN}         ║
║  {Colors.BOLD}{Colors.WHITE}           ██║   ██║   ██║██╔══██╗╚════██║██║   ██║{Colors.ENDC}{Colors.CYAN}         ║
║  {Colors.BOLD}{Colors.WHITE}           ██║   ╚██████╔╝██║  ██║███████║╚██████╔╝{Colors.ENDC}{Colors.CYAN}         ║
║  {Colors.BOLD}{Colors.WHITE}          ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝{Colors.ENDC}{Colors.CYAN}           ║
║                                                              ║
║           {Colors.BOLD}{Colors.ORANGE}🚀 Database Generator & Token Creator 🚀{Colors.ENDC}{Colors.CYAN}           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝{Colors.ENDC}
""")

def print_step(step_num, total_steps, message):
    """Print a formatted step with progress indicator."""
    progress = "█" * step_num + "░" * (total_steps - step_num)
    print(f"\n{Colors.BOLD}{Colors.OKBLUE}[{step_num}/{total_steps}]{Colors.ENDC} {Colors.CYAN}[{progress}]{Colors.ENDC} {Colors.BOLD}{message}{Colors.ENDC}")

def print_success(message):
    """Print a success message with checkmark."""
    print(f"{Colors.OKGREEN}✅ {message}{Colors.ENDC}")

def print_error(message):
    """Print an error message with X mark."""
    print(f"{Colors.FAIL}❌ {message}{Colors.ENDC}")

def print_warning(message):
    """Print a warning message with warning icon."""
    print(f"{Colors.WARNING}⚠️  {message}{Colors.ENDC}")

def print_info(message):
    """Print an info message with info icon."""
    print(f"{Colors.OKCYAN}ℹ️  {message}{Colors.ENDC}")

def print_section_divider(title):
    """Print a section divider with title, respecting CONTENT_WIDTH."""
    divider = "═" * CONTENT_WIDTH
    print(f"\n{Colors.PURPLE}╔{divider}╗")
    print(f"║{Colors.BOLD}{Colors.WHITE}{title.center(CONTENT_WIDTH)}{Colors.ENDC}{Colors.PURPLE}║")
    print(f"╚{divider}╝{Colors.ENDC}")

def print_env_vars_box(DATABASE_URL, auth_token, db_name, url_var_name="DATABASE_URL", token_var_name="TURSO_AUTH_TOKEN"):
    """Print environment variables in a beautiful, perfectly aligned box."""
    print_section_divider("🔐 GENERATED CREDENTIALS")

    def create_padded_line(text_to_pad, total_width):
        
        plain_text = re.sub(r'\033\[[0-9;]*m', '', text_to_pad)
        padding = total_width - len(plain_text)
        return f"{text_to_pad}{' ' * max(0, padding)}" 

    line_title = create_padded_line(f"  {Colors.BOLD}{Colors.WHITE}DATABASE CREDENTIALS", CONTENT_WIDTH)
    line_db_name = create_padded_line(f" {Colors.BOLD}{Colors.WHITE}Database Name: {Colors.CYAN}{db_name}", CONTENT_WIDTH)
    line_created_at = create_padded_line(f" {Colors.BOLD}{Colors.WHITE}Created At:  {Colors.GRAY}{datetime.utcnow().strftime('%d-%m-%Y %H:%M:%S')} UTC", CONTENT_WIDTH)

    
    db_url_secret = SecretDisplay(DATABASE_URL, "database_url")
    auth_token_secret = SecretDisplay(auth_token, "auth_token")
    
    
    DATABASE_URL_display = db_url_secret.get_masked_display()
    if len(DATABASE_URL_display) > CONTENT_WIDTH - 1: 
        DATABASE_URL_display = DATABASE_URL_display[:CONTENT_WIDTH - 4] + "..."

    truncated_token = auth_token_secret.get_masked_display()
    if len(truncated_token) > CONTENT_WIDTH -1:
        truncated_token = truncated_token[:CONTENT_WIDTH-4] + "..."

    line_DATABASE_URL_val = create_padded_line(f" {Colors.BRIGHT_CYAN}{DATABASE_URL_display}{Colors.ENDC}", CONTENT_WIDTH)
    line_auth_token_val = create_padded_line(f" {Colors.BRIGHT_CYAN}{truncated_token}{Colors.ENDC}", CONTENT_WIDTH)
    
    
    secrets_dict = {
        "database_url": db_url_secret,
        "auth_token": auth_token_secret
    }


    print(f"""
{Colors.BOLD}{Colors.OKGREEN}┌{'─' * CONTENT_WIDTH}┐
│{line_title}│
├{'─' * CONTENT_WIDTH}┤{Colors.ENDC}
{Colors.BOLD}{Colors.WHITE}│{line_db_name}│{Colors.ENDC}
{Colors.BOLD}{Colors.WHITE}│{line_created_at}│{Colors.ENDC}
{Colors.BOLD}{Colors.OKGREEN}├{'─' * CONTENT_WIDTH}┤{Colors.ENDC}
{Colors.BOLD}{Colors.WHITE}│ {url_var_name}: {' ' * (CONTENT_WIDTH - len(f"{url_var_name}: "))}│{Colors.ENDC}
|{Colors.BOLD}{Colors.WHITE}│{line_DATABASE_URL_val}│{Colors.ENDC}
|{Colors.BOLD}{Colors.WHITE}│{' ' * CONTENT_WIDTH}│{Colors.ENDC}
|{Colors.BOLD}{Colors.WHITE}│ {token_var_name}: {' ' * (CONTENT_WIDTH - len(f"{token_var_name}: "))}│{Colors.ENDC}
|{Colors.BOLD}{Colors.WHITE}│{line_auth_token_val}│{Colors.ENDC}
{Colors.BOLD}{Colors.OKGREEN}└{'─' * CONTENT_WIDTH}┘{Colors.ENDC}
""")
    
    
    return secrets_dict


def print_footer(db_name):
    """Print a beautiful, perfectly aligned footer."""
    line1_raw = "🎉 SUCCESS! Your Turso database is ready to use! 🎉"
    line2_raw = "📋 Credentials copied to clipboard"
    line3_raw = "🔧 Ready to paste into your .env file"
    line4_raw = "Much love xxx remcostoeten 💖"

    line1 = f"{Colors.BOLD}{Colors.OKGREEN}{line1_raw}{Colors.ENDC}".center(CONTENT_WIDTH + len(f"{Colors.BOLD}{Colors.OKGREEN}{Colors.ENDC}") - len(line1_raw))
    line2 = f"{Colors.BOLD}{Colors.CYAN}{line2_raw}{Colors.ENDC}".center(CONTENT_WIDTH + len(f"{Colors.BOLD}{Colors.CYAN}{Colors.ENDC}") - len(line2_raw))
    line3 = f"{Colors.BOLD}{Colors.ORANGE}{line3_raw}{Colors.ENDC}".center(CONTENT_WIDTH + len(f"{Colors.BOLD}{Colors.ORANGE}{Colors.ENDC}") - len(line3_raw))
    line4 = f"{Colors.BOLD}{Colors.WHITE}{line4_raw}{Colors.ENDC}".center(CONTENT_WIDTH + len(f"{Colors.BOLD}{Colors.WHITE}{Colors.ENDC}") - len(line4_raw))

    
    
    text_5a_plain = "🗑️ To delete this DB, run:"
    text_5a_content_colored = f"{Colors.FAIL}{text_5a_plain}{Colors.ENDC}"
    padding_5a = CONTENT_WIDTH - len(text_5a_plain) 
    
    
    line5a_for_box = f"{text_5a_content_colored}{' ' * max(0, padding_5a)}{Colors.PURPLE}"

    
    indent = "  " 
    script_name = os.path.basename(sys.argv[0])

    cmd_part1_plain = f"python {script_name}"
    cmd_part1_colored = f"{Colors.BOLD}{Colors.WHITE}{cmd_part1_plain}{Colors.ENDC}" 

    cmd_part2_plain = " --delete-generation"
    cmd_part2_colored = f"{Colors.FAIL}{cmd_part2_plain}{Colors.ENDC}" 

    text_5b_plain_for_padding = f"{indent}{cmd_part1_plain}{cmd_part2_plain}" 
    text_5b_content_colored = f"{indent}{cmd_part1_colored}{cmd_part2_colored}" 

    padding_5b = CONTENT_WIDTH - len(text_5b_plain_for_padding) 
    
    line5b_for_box = f"{text_5b_content_colored}{' ' * max(0, padding_5b)}{Colors.PURPLE}"
    

    print(f"""
{Colors.PURPLE}╔{'═' * CONTENT_WIDTH}╗
║{line1}║
║{' ' * CONTENT_WIDTH}║
║{line2}║
║{line3}║
║{' ' * CONTENT_WIDTH}║
║{line5a_for_box}║
║{line5b_for_box}║
║{' ' * CONTENT_WIDTH}║
║{line4}║
╚{'═' * CONTENT_WIDTH}╝{Colors.ENDC}
""")

def run_command(command, timeout=30):
    """Run a shell command and return its output and error (if any)."""
    result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def save_last_generated_db(db_name):
    """Saves the last generated database name to a state file."""
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"last_database_name": db_name}, f)
    except Exception as e:
        print_warning(f"Could not save state file: {e}")

def read_last_generated_db():
    """Reads the last generated database name from the state file."""
    if not STATE_FILE.exists():
        return None
    try:
        with open(STATE_FILE, "r") as f:
            data = json.load(f)
            return data.get("last_database_name")
    except (json.JSONDecodeError, IOError) as e:
        print_warning(f"Could not read state file: {e}")
        
        
        return None

def load_config():
    """Load configuration from the config file."""
    default_config = {
        "prompts": {
            "delete_generation": True,
            "open_turso_web": True,
            "paste_to_env": True,
            "reveal_secrets": True
        },
        "env_file": {
            "default_path": ".env",
            "default_env_dir": "./"
        },
        "defaults": {
            "auto_reveal": "off",
            "no_clipboard": False,
            "default_db_prefix": "",
            "env_url_name": "DATABASE_URL",
            "env_token_name": "TURSO_AUTH_TOKEN"
        },
        "seeding": {
            "default_mode": "off",
            "confirm_before_seed": True,
            "drizzle_config_path": "",
            "sql_migration_path": ""
        },
        "display": {
            "show_version_info": True,
            "use_colors": True,
            "content_width": 60
        }
    }
    
    if not CONFIG_FILE.exists():
        return default_config
    
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
        
        merged_config = default_config.copy()
        merged_config.update(config)
        return merged_config
    except (json.JSONDecodeError, IOError) as e:
        print_warning(f"Could not read config file: {e}")
        return default_config

def save_config(config):
    """Save configuration to the config file."""
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
        print_success("Configuration saved successfully!")
    except IOError as e:
        print_error(f"Could not save config file: {e}")

def configure_script():
    """Interactive configuration of the script."""
    print_section_divider("⚙️ SCRIPT CONFIGURATION")
    
    config = load_config()
    
    print_info("Configure script settings:")
    print(f"\n{Colors.BOLD}{Colors.WHITE}Post-completion prompts:{Colors.ENDC}")
    print(f"  1. Delete generation prompt: {Colors.CYAN}{'Enabled' if config['prompts']['delete_generation'] else 'Disabled'}{Colors.ENDC}")
    print(f"  2. Open Turso shell prompt: {Colors.CYAN}{'Enabled' if config['prompts']['open_turso_web'] else 'Disabled'}{Colors.ENDC}")
    print(f"  3. Paste to .env prompt: {Colors.CYAN}{'Enabled' if config['prompts']['paste_to_env'] else 'Disabled'}{Colors.ENDC}")
    print(f"  4. Reveal secrets prompt: {Colors.CYAN}{'Enabled' if config['prompts']['reveal_secrets'] else 'Disabled'}{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}Environment file settings:{Colors.ENDC}")
    print(f"  5. Default .env path: {Colors.CYAN}{config['env_file']['default_path']}{Colors.ENDC}")
    print(f"  6. Default .env directory: {Colors.CYAN}{config['env_file']['default_env_dir']}{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}Default behavior:{Colors.ENDC}")
    print(f"  7. Auto-reveal secrets: {Colors.CYAN}{config['defaults']['auto_reveal']}{Colors.ENDC}")
    print(f"  8. Skip clipboard by default: {Colors.CYAN}{'Yes' if config['defaults']['no_clipboard'] else 'No'}{Colors.ENDC}")
    print(f"  9. Default database prefix: {Colors.CYAN}{config['defaults']['default_db_prefix'] or 'None'}{Colors.ENDC}")
    print(f" 10. Default URL env var name: {Colors.CYAN}{config['defaults']['env_url_name']}{Colors.ENDC}")
    print(f" 11. Default token env var name: {Colors.CYAN}{config['defaults']['env_token_name']}{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}Seeding settings:{Colors.ENDC}")
    print(f" 12. Default seeding mode: {Colors.CYAN}{config['seeding']['default_mode']}{Colors.ENDC}")
    print(f" 13. Confirm before seed: {Colors.CYAN}{'Enabled' if config['seeding']['confirm_before_seed'] else 'Disabled'}{Colors.ENDC}")
    print(f" 14. Default Drizzle config path: {Colors.CYAN}{config['seeding']['drizzle_config_path'] or 'None'}{Colors.ENDC}")
    print(f" 15. Default SQL migration path: {Colors.CYAN}{config['seeding']['sql_migration_path'] or 'None'}{Colors.ENDC}")

    print(f"\n{Colors.BOLD}{Colors.WHITE}Display settings:{Colors.ENDC}")
    print(f" 16. Show version info: {Colors.CYAN}{'Enabled' if config['display']['show_version_info'] else 'Disabled'}{Colors.ENDC}")
    print(f" 17. Use colors: {Colors.CYAN}{'Enabled' if config['display']['use_colors'] else 'Disabled'}{Colors.ENDC}")
    print(f" 18. Content width: {Colors.CYAN}{config['display']['content_width']}{Colors.ENDC}")
    
    print("\nEnter the number to toggle/change, or press Enter to finish:")
    
    while True:
        try:
            choice = input(f"{Colors.BOLD}{Colors.ORANGE}Choice (1-18 or Enter): {Colors.ENDC}").strip()
            
            if not choice:
                break
            
            choice = int(choice)
            
            if choice == 1:
                config['prompts']['delete_generation'] = not config['prompts']['delete_generation']
                status = "Enabled" if config['prompts']['delete_generation'] else "Disabled"
                print(f"Delete generation prompt: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 2:
                config['prompts']['open_turso_web'] = not config['prompts']['open_turso_web']
                status = "Enabled" if config['prompts']['open_turso_web'] else "Disabled"
                print(f"Open Turso shell prompt: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 3:
                config['prompts']['paste_to_env'] = not config['prompts']['paste_to_env']
                status = "Enabled" if config['prompts']['paste_to_env'] else "Disabled"
                print(f"Paste to .env prompt: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 4:
                config['prompts']['reveal_secrets'] = not config['prompts']['reveal_secrets']
                status = "Enabled" if config['prompts']['reveal_secrets'] else "Disabled"
                print(f"Reveal secrets prompt: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 5:
                new_path = input(f"Enter new default .env filename [{config['env_file']['default_path']}]: ").strip()
                if new_path:
                    config['env_file']['default_path'] = new_path
                    print(f"Default .env path set to: {Colors.CYAN}{new_path}{Colors.ENDC}")
            elif choice == 6:
                new_dir = input(f"Enter new default .env directory [{config['env_file']['default_env_dir']}]: ").strip()
                if new_dir:
                    config['env_file']['default_env_dir'] = new_dir
                    print(f"Default .env directory set to: {Colors.CYAN}{new_dir}{Colors.ENDC}")
            elif choice == 7:
                current = config['defaults']['auto_reveal']
                new_value = 'on' if current == 'off' else 'off'
                config['defaults']['auto_reveal'] = new_value
                print(f"Auto-reveal secrets set to: {Colors.CYAN}{new_value}{Colors.ENDC}")
            elif choice == 8:
                config['defaults']['no_clipboard'] = not config['defaults']['no_clipboard']
                status = "Yes" if config['defaults']['no_clipboard'] else "No"
                print(f"Skip clipboard by default: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 9:
                new_prefix = input(f"Enter new default database prefix [{config['defaults']['default_db_prefix'] or 'None'}]: ").strip()
                config['defaults']['default_db_prefix'] = new_prefix
                display_prefix = new_prefix or 'None'
                print(f"Default database prefix set to: {Colors.CYAN}{display_prefix}{Colors.ENDC}")
            elif choice == 10:
                new_url_name = input(f"Enter new default URL env var name [{config['defaults']['env_url_name']}]: ").strip()
                if new_url_name:
                    config['defaults']['env_url_name'] = new_url_name
                    print(f"Default URL env var name set to: {Colors.CYAN}{new_url_name}{Colors.ENDC}")
            elif choice == 11:
                new_token_name = input(f"Enter new default token env var name [{config['defaults']['env_token_name']}]: ").strip()
                if new_token_name:
                    config['defaults']['env_token_name'] = new_token_name
                    print(f"Default token env var name set to: {Colors.CYAN}{new_token_name}{Colors.ENDC}")
            elif choice == 12:
                config['seeding']['default_mode'] = 'on' if config['seeding']['default_mode'] == 'off' else 'off'
                status = config['seeding']['default_mode']
                print(f"Default seeding mode: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 13:
                config['seeding']['confirm_before_seed'] = not config['seeding']['confirm_before_seed']
                status = "Enabled" if config['seeding']['confirm_before_seed'] else "Disabled"
                print(f"Confirm before seed: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 14:
                new_drizzle_path = input(f"Enter default Drizzle config path [{config['seeding']['drizzle_config_path']}]: ").strip()
                config['seeding']['drizzle_config_path'] = new_drizzle_path
                print(f"Default Drizzle config path set to: {Colors.CYAN}{new_drizzle_path or 'None'}{Colors.ENDC}")
            elif choice == 15:
                new_sql_path = input(f"Enter default SQL migration path [{config['seeding']['sql_migration_path']}]: ").strip()
                config['seeding']['sql_migration_path'] = new_sql_path
                print(f"Default SQL migration path set to: {Colors.CYAN}{new_sql_path or 'None'}{Colors.ENDC}")
            elif choice == 16:
                config['display']['show_version_info'] = not config['display']['show_version_info']
                status = "Enabled" if config['display']['show_version_info'] else "Disabled"
                print(f"Show version info: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 17:
                config['display']['use_colors'] = not config['display']['use_colors']
                status = "Enabled" if config['display']['use_colors'] else "Disabled"
                print(f"Use colors: {Colors.CYAN}{status}{Colors.ENDC}")
            elif choice == 18:
                try:
                    new_width = int(input(f"Enter new content width [{config['display']['content_width']}]: ").strip())
                    if 40 <= new_width <= 120:  
                        config['display']['content_width'] = new_width
                        print(f"Content width set to: {Colors.CYAN}{new_width}{Colors.ENDC}")
                    else:
                        print_warning("Width must be between 40 and 120 characters.")
                except ValueError:
                    print_warning("Please enter a valid number.")
            else:
                print_warning("Invalid choice. Please enter 1-18.")
                
        except ValueError:
            print_warning("Invalid input. Please enter a number 1-18.")
        except KeyboardInterrupt:
            print_error("\nConfiguration cancelled.")
            return
    
    save_config(config)


def run_drizzle_seeding(db_name, DATABASE_URL, auth_token):
    """Run Drizzle seeding operations."""
    print_section_divider("🌱 DRIZZLE SEEDING")
    print_info("Checking for Drizzle configuration...")
    
    config = load_config()
    
    
    drizzle_check, _, drizzle_code = run_command("npx drizzle-kit --version")
    if drizzle_code != 0:
        print_error("drizzle-kit not found. Please install it first:")
        print_info("npm install -g drizzle-kit")
        return False
    
    print_success("Drizzle-kit found.")
    
    
    drizzle_config_path = config['seeding']['drizzle_config_path']
    if drizzle_config_path:
        if not Path(drizzle_config_path).exists():
            print_warning(f"Configured Drizzle config path '{drizzle_config_path}' not found. Searching common locations...")
            drizzle_config_path = ""
    
    config_files = ["drizzle.config.ts", "drizzle.config.js", "drizzle.config.json"]
    if drizzle_config_path:
        config_files.insert(0, drizzle_config_path) 

    config_found = False
    for config_file in config_files:
        if Path(config_file).exists():
            print_success(f"Found Drizzle config: {Colors.CYAN}{config_file}{Colors.ENDC}")
            config_found = True
            break
    
    if not config_found:
        print_warning("No Drizzle config file found. Looking for schema files...")
        schema_patterns = ["**/schema.ts", "**/schema.js", "**/*schema*.ts", "**/*schema*.js"]
        schema_found = False
        for pattern in schema_patterns:
            import glob
            if glob.glob(pattern, recursive=True):
                schema_found = True
                break
        
        if not schema_found:
            print_error("No Drizzle schema files found. Please ensure you have a proper Drizzle setup.")
            return False
    
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}Choose Drizzle operation:{Colors.ENDC}")
    print(f"  1. {Colors.CYAN}drizzle-kit push{Colors.ENDC} - Push schema to database")
    print(f"  2. {Colors.CYAN}drizzle-kit migrate{Colors.ENDC} - Run migrations")
    print(f"  3. {Colors.CYAN}Both{Colors.ENDC} - Run push first, then migrate")
    
    try:
        choice = input(f"{Colors.BOLD}{Colors.ORANGE}Select option (1-3): {Colors.ENDC}").strip()
        
        
        env_vars = os.environ.copy()
        env_vars['DATABASE_URL'] = DATABASE_URL
        env_vars['TURSO_AUTH_TOKEN'] = auth_token
        
        success = True
        
        if choice in ['1', '3']:
            print_info("Running drizzle-kit push...")
            push_output, push_error, push_code = run_command("npx drizzle-kit push")
            if push_code == 0:
                print_success("Drizzle push completed successfully!")
                if push_output:
                    print_info(f"Output: {push_output}")
            else:
                print_error(f"Drizzle push failed: {push_error}")
                success = False
        
        if choice in ['2', '3'] and success:
            print_info("Running drizzle-kit migrate...")
            migrate_output, migrate_error, migrate_code = run_command("npx drizzle-kit migrate")
            if migrate_code == 0:
                print_success("Drizzle migrate completed successfully!")
                if migrate_output:
                    print_info(f"Output: {migrate_output}")
            else:
                print_error(f"Drizzle migrate failed: {migrate_error}")
                success = False
        
        return success
        
    except KeyboardInterrupt:
        print_info("\nDrizzle seeding cancelled.")
        return False

def run_sql_seeding(db_name):
    """Run SQL file seeding operations."""
    print_section_divider("📄 SQL SEEDING")
    print_info("Looking for SQL migration files...")
    
    config = load_config()
    sql_migration_path = config['seeding']['sql_migration_path']

    sql_files = []
    if sql_migration_path:
        if Path(sql_migration_path).is_dir():
            import glob
            files = glob.glob(f"{sql_migration_path}/*.sql")
            sql_files.extend(files)
            if not sql_files:
                print_warning(f"No SQL files found in configured path: {Colors.CYAN}{sql_migration_path}{Colors.ENDC}")
        else:
            print_warning(f"Configured SQL migration path '{sql_migration_path}' is not a directory. Searching common locations...")

    
    if not sql_files:
        sql_patterns = [
            "migrations/*.sql",
            "db/migrations/*.sql",
            "database/migrations/*.sql",
            "sql/*.sql",
            "*.sql"
        ]
        
        for pattern in sql_patterns:
            import glob
            files = glob.glob(pattern, recursive=True)
            sql_files.extend(files)
    
    if not sql_files:
        print_warning("No SQL files found in common directories.")
        try:
            custom_path = input(f"{Colors.BOLD}{Colors.ORANGE}Enter path to SQL files (or Enter to skip): {Colors.ENDC}").strip()
            if custom_path:
                import glob
                custom_files = glob.glob(f"{custom_path}/*.sql")
                sql_files.extend(custom_files)
        except KeyboardInterrupt:
            print_info("\nSQL seeding cancelled.")
            return False
    
    if not sql_files:
        print_error("No SQL files found to apply.")
        return False
    
    
    sql_files.sort()
    
    print_success(f"Found {len(sql_files)} SQL file(s):")
    for i, file in enumerate(sql_files, 1):
        print(f"  {i}. {Colors.CYAN}{file}{Colors.ENDC}")
    
    try:
        confirm = input(f"\n{Colors.BOLD}{Colors.ORANGE}Apply these SQL files to {db_name}? (y/N): {Colors.ENDC}").strip().lower()
        if confirm != 'y':
            print_info("SQL seeding cancelled.")
            return False
        
        
        success_count = 0
        for sql_file in sql_files:
            print_info(f"Applying {Colors.CYAN}{sql_file}{Colors.ENDC}...")
            try:
                with open(sql_file, 'r') as f:
                    sql_content = f.read()
                
                
                shell_cmd = f'echo "{sql_content}" | turso db shell {db_name}'
                output, error, code = run_command(shell_cmd)
                
                if code == 0:
                    print_success(f"Applied {sql_file}")
                    success_count += 1
                else:
                    print_error(f"Failed to apply {sql_file}: {error}")
                    
            except Exception as e:
                print_error(f"Error reading {sql_file}: {e}")
        
        if success_count == len(sql_files):
            print_success(f"All {success_count} SQL files applied successfully!")
            return True
        else:
            print_warning(f"Applied {success_count}/{len(sql_files)} files successfully.")
            return success_count > 0
            
    except KeyboardInterrupt:
        print_info("\nSQL seeding cancelled.")
        return False

def run_interactive_seeding(db_name, DATABASE_URL, auth_token):
    """Interactive seeding mode - let user choose."""
    print_section_divider("🎯 INTERACTIVE SEEDING")
    print_info("Choose your seeding method:")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}Available seeding options:{Colors.ENDC}")
    print(f"  1. {Colors.CYAN}Drizzle{Colors.ENDC} - Run drizzle-kit push/migrate")
    print(f"  2. {Colors.CYAN}SQL{Colors.ENDC} - Apply local SQL migration files")
    print(f"  3. {Colors.CYAN}Both{Colors.ENDC} - Run Drizzle first, then SQL")
    print(f"  4. {Colors.CYAN}Skip{Colors.ENDC} - Skip seeding")
    
    try:
        choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Select option (1-4): {Colors.ENDC}").strip()
        
        if choice == '1':
            return run_drizzle_seeding(db_name, DATABASE_URL, auth_token)
        elif choice == '2':
            return run_sql_seeding(db_name)
        elif choice == '3':
            drizzle_success = run_drizzle_seeding(db_name, DATABASE_URL, auth_token)
            if drizzle_success:
                return run_sql_seeding(db_name)
            else:
                print_warning("Skipping SQL seeding due to Drizzle failure.")
                return False
        elif choice == '4':
            print_info("Seeding skipped.")
            return True
        else:
            print_warning("Invalid choice. Skipping seeding.")
            return True
            
    except KeyboardInterrupt:
        print_info("\nSeeding cancelled.")
        return True

def handle_seeding(seed_mode, db_name, DATABASE_URL, auth_token):
    """Handle seeding based on the provided mode."""
    if not seed_mode:
        return True  
    
    print_info(f"Starting database seeding with mode: {Colors.CYAN}{seed_mode}{Colors.ENDC}")
    
    if seed_mode == 'drizzle':
        return run_drizzle_seeding(db_name, DATABASE_URL, auth_token)
    elif seed_mode == 'sql':
        return run_sql_seeding(db_name)
    elif seed_mode == 'interactive':
        return run_interactive_seeding(db_name, DATABASE_URL, auth_token)
    else:
        print_error(f"Unknown seeding mode: {seed_mode}")
        return False

def post_completion_prompts(db_name, DATABASE_URL, auth_token):
    """Handle post-completion prompts based on configuration."""
    config = load_config()
    
    
    options_title = "💡 ADDITIONAL OPTIONS AVAILABLE"
    option1 = "🗑️  Delete this database"
    option2 = "🔧 Open database shell"
    option3 = "💾 Save to .env file"
    
    
    title_padding = (CONTENT_WIDTH - len(options_title)) // 2
    option_padding = 3  
    
    print(f"""
{Colors.PURPLE}╔{'═' * CONTENT_WIDTH}╗
║{' ' * title_padding}{Colors.BOLD}{Colors.WHITE}{options_title}{Colors.ENDC}{Colors.PURPLE}{' ' * (CONTENT_WIDTH - title_padding - len(options_title))}║
║{' ' * CONTENT_WIDTH}║
║{' ' * option_padding}{Colors.CYAN}{option1}{Colors.ENDC}{Colors.PURPLE}{' ' * (CONTENT_WIDTH - option_padding - len(option1))}║
║{' ' * option_padding}{Colors.CYAN}{option2}{Colors.ENDC}{Colors.PURPLE}{' ' * (CONTENT_WIDTH - option_padding - len(option2))}║
║{' ' * option_padding}{Colors.CYAN}{option3}{Colors.ENDC}{Colors.PURPLE}{' ' * (CONTENT_WIDTH - option_padding - len(option3))}║
║{' ' * CONTENT_WIDTH}║
╚{'═' * CONTENT_WIDTH}╝{Colors.ENDC}""")
    
    try:
        options_choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Press 'o' to access options or Enter to finish: {Colors.ENDC}").strip().lower()
        
        if options_choice != 'o':
            return  
            
    except KeyboardInterrupt:
        print_info("\nFinishing...")
        return
    
    
    print_section_divider("🎯 POST-COMPLETION OPTIONS")
    
    
    if config['prompts']['delete_generation']:
        try:
            delete_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Delete this generation? (y/N): {Colors.ENDC}").strip().lower()
            if delete_choice == 'y':
                if delete_database(db_name):
                    print_success("Database deleted successfully!")
                    try:
                        STATE_FILE.unlink(missing_ok=True)
                        print_info("State file cleared.")
                    except OSError as e:
                        print_warning(f"Could not remove state file: {e}")
                    return  
        except KeyboardInterrupt:
            print_info("\nSkipping delete prompt.")
    
    
    if config['prompts']['open_turso_web']:
        try:
            shell_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Open database shell connection? (y/N): {Colors.ENDC}").strip().lower()
            if shell_choice == 'y':
                try:
                    print_success("Opening Turso database shell...")
                    print_info(f"Connecting to database: {Colors.CYAN}{db_name}{Colors.ENDC}")
                    print_info("Type '.quit' or '.exit' to close the shell.")
                    print("\n" + "="*60)
                    
                    
                    import subprocess
                    result = subprocess.call(["turso", "db", "shell", db_name])
                    
                    print("\n" + "="*60)
                    if result == 0:
                        print_success("Shell session completed.")
                    else:
                        print_warning("Shell session ended with non-zero exit code.")
                        
                except Exception as e:
                    print_error(f"Could not open database shell: {e}")
                    print_info(f"Manual command: {Colors.CYAN}turso db shell {db_name}{Colors.ENDC}")
        except KeyboardInterrupt:
            print_info("\nSkipping shell prompt.")
    
    
    if config['prompts']['paste_to_env']:
        try:
            env_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Paste credentials to .env file? (y/N): {Colors.ENDC}").strip().lower()
            if env_choice == 'y':
                
                default_env_path = config['env_file']['default_path']
                default_env_dir = config['env_file']['default_env_dir']
                
                suggested_path = f"{default_env_dir.rstrip('/')}/{default_env_path}"
                env_path = input(f"{Colors.BOLD}{Colors.ORANGE}Enter .env file path [{suggested_path}]: {Colors.ENDC}").strip()
                
                if not env_path:
                    env_path = suggested_path
                
                try:
                    env_file_path = Path(env_path)
                    env_file_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    
                    if env_file_path.exists():
                        overwrite = input(f"{Colors.BOLD}{Colors.ORANGE}File exists. Append to existing file? (Y/n): {Colors.ENDC}").strip().lower()
                        mode = 'a' if overwrite != 'n' else 'w'
                    else:
                        mode = 'w'
                    
                    with open(env_file_path, mode) as f:
                        if mode == 'a':
                            f.write("\n\n")
                        else:
                            pass
                        f.write(f"DATABASE_URL={DATABASE_URL}\n")
                        f.write(f"TURSO_AUTH_TOKEN={auth_token}\n")
                    
                    print_success(f"Credentials {'appended to' if mode == 'a' else 'written to'} {Colors.CYAN}{env_file_path}{Colors.ENDC}")
                    
                except IOError as e:
                    print_error(f"Could not write to {env_path}: {e}")
                    
        except KeyboardInterrupt:
            print_info("\nSkipping .env prompt.")

def check_database_exists(db_name):
    """Check if a database with the given name already exists."""
    print_info(f"Checking if database '{Colors.CYAN}{db_name}{Colors.ENDC}' already exists...")
    
    output, error, code = run_command("turso db list")
    if code != 0:
        print_warning("Could not fetch database list for existence check.")
        if error: print_warning(f"Turso CLI Error: {error}")
        return False  
    
    
    lines = output.strip().split('\n')
    if len(lines) < 2:  
        return False
    
    
    for line in lines[1:]:
        line = line.strip()
        if not line:  
            continue
        
        
        if line.startswith("NAME") and "GROUP" in line and "URL" in line:
            continue
            
        
        parts = line.split()
        if len(parts) >= 1:
            existing_name = parts[0]
            if existing_name == db_name:
                return True
    
    return False

def delete_database(db_name, verbose=True):
    """Deletes a Turso database.
    
    Args:
        db_name: Name of the database to delete
        verbose: If True, print progress messages. If False, operate silently.
    """
    if verbose:
        print_info(f"Attempting to delete database: {Colors.CYAN}{db_name}{Colors.ENDC}")
    command = f"turso db destroy {db_name} --yes" 

    output, error, code = run_command(command, timeout=60)

    
    
    if code == 0 and (f"Destroyed database {db_name}" in output or "successfully deleted" in output.lower()):
        if verbose:
            print_success(f"Successfully deleted database '{Colors.CYAN}{db_name}{Colors.ENDC}'")
        return True
    else:
        if verbose:
            print_error(f"Failed to delete database '{Colors.CYAN}{db_name}{Colors.ENDC}'")
            
            if error: print_error(f"Turso CLI Error: {error}")
            if output: print_info(f"Turso CLI Output: {output}")
        return False

def save_deletion_backup(databases_info):
    """Save database information before deletion for recovery records.
    
    Args:
        databases_info: List of database dictionaries with name, size, group, etc.
    
    Returns:
        Path to the backup file or None if failed
    """
    try:
        DELETION_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = DELETION_BACKUP_DIR / f"deletion_backup_{timestamp}.json"
        
        backup_data = {
            "timestamp": datetime.now().isoformat(),
            "databases_count": len(databases_info),
            "databases": databases_info,
            "total_size": sum(1 for db in databases_info),  # Could calculate actual size if needed
        }
        
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
        
        return backup_file
    except Exception as e:
        print_warning(f"Could not save deletion backup: {e}")
        return None

def delete_databases_batch(db_names, max_workers=5, dry_run=False):
    """Delete multiple databases in parallel with progress tracking.
    
    Args:
        db_names: List of database names to delete
        max_workers: Maximum number of parallel deletion threads
        dry_run: If True, simulate deletion without actually deleting
    
    Returns:
        Tuple of (successful_deletions, failed_deletions)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import sys
    
    if not db_names:
        return [], []
    
    total = len(db_names)
    successful = []
    failed = []
    
    if dry_run:
        print_info(f"DRY RUN: Simulating deletion of {Colors.CYAN}{total}{Colors.ENDC} database(s)...")
        print(f"{Colors.GRAY}{'─' * 60}{Colors.ENDC}")
        for name in db_names:
            print(f"  {Colors.YELLOW}[DRY RUN]{Colors.ENDC} Would delete: {Colors.CYAN}{name}{Colors.ENDC}")
            successful.append(name)
        print(f"{Colors.GRAY}{'─' * 60}{Colors.ENDC}")
        print_info(f"DRY RUN completed. {len(successful)} database(s) would be deleted.")
        return successful, failed
    
    print_info(f"Deleting {Colors.CYAN}{total}{Colors.ENDC} database(s) in parallel...")
    print(f"{Colors.GRAY}{'─' * 60}{Colors.ENDC}")
    
    def delete_with_status(db_name):
        """Delete a database and return status."""
        command = f"turso db destroy {db_name} --yes"
        output, error, code = run_command(command, timeout=60)
        
        success = code == 0 and (f"Destroyed database {db_name}" in output or "successfully deleted" in output.lower())
        return {
            'name': db_name,
            'success': success,
            'error': error if not success else None
        }
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(delete_with_status, name): name for name in db_names}
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            result = future.result()
            
            # Update progress line
            progress = f"Progress: [{completed}/{total}]"
            status_icon = "✅" if result['success'] else "❌"
            db_display = f"{status_icon} {result['name'][:30]}{'...' if len(result['name']) > 30 else ''}"
            
            # Clear line and print progress
            sys.stdout.write(f"\r{Colors.CYAN}{progress}{Colors.ENDC} - {db_display}" + " " * 20)
            sys.stdout.flush()
            
            if result['success']:
                successful.append(result['name'])
            else:
                failed.append(result['name'])
    
    # Clear the progress line
    sys.stdout.write("\r" + " " * 80 + "\r")
    sys.stdout.flush()
    
    # Print summary
    print(f"{Colors.GRAY}{'─' * 60}{Colors.ENDC}")
    if successful:
        print_success(f"✅ Successfully deleted {len(successful)} database(s)")
    if failed:
        print_error(f"❌ Failed to delete {len(failed)} database(s)")
        if len(failed) <= 5:
            for name in failed:
                print(f"  - {Colors.FAIL}{name}{Colors.ENDC}")
    
    return successful, failed

def delete_last_generated_db():
    """Handler for the --delete-generation flag."""
    print_section_divider("🗑️ Delete Last Generated Database")
    db_name = read_last_generated_db()
    if not db_name:
        print_error("No previously generated database found to delete.")
        print_info(f"State file ({STATE_FILE}) not found, empty, or unreadable.")
        sys.exit(1)

    if delete_database(db_name):
        try:
            STATE_FILE.unlink() 
            print_info("Cleared state file for the deleted database.")
        except OSError as e:
            print_warning(f"Could not remove state file {STATE_FILE}: {e}")
    else:
        sys.exit(1) 

def fetch_all_database_details(lazy=False, page_size=25):
    """Fetch details for all databases with optional lazy loading."""
    print_info("Fetching database list...")
    output, error, code = run_command("turso db list")
    if code != 0:
        print_error("Failed to fetch database list.")
        if error: print_error(f"Turso CLI Error: {error}")
        return []
    
    
    lines = output.strip().split('\n')
    if len(lines) < 2:  
        print_warning("No databases found.")
        return []
    
    db_list = []
    
    for line in lines[1:]:
        line = line.strip()
        if not line:  
            continue
        
        
        if line.startswith("NAME") and "GROUP" in line and "URL" in line:
            continue
            
        
        parts = line.split()
        if len(parts) >= 3:  
            db_name = parts[0]
            db_group = parts[1]
            
            db_list.append({
                "name": db_name,
                "selected": False,
                "group": db_group,
                "size": "Loading...",
                "details_loaded": False
            })
    
    if not db_list:
        print_warning("No databases found.")
        return []
    
    print_info(f"Found {Colors.CYAN}{len(db_list)}{Colors.ENDC} databases.")
    
    if not lazy:
        
        print_info("Loading database details...")
        load_database_details_batch(db_list, 0, len(db_list))
    else:
        
        print_info(f"Loading details for first {page_size} databases...")
        load_database_details_batch(db_list, 0, min(page_size, len(db_list)))
    
    return db_list

def load_database_details_batch(db_list, start_idx, end_idx):
    """Load database details for a specific batch of databases."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    batch = db_list[start_idx:end_idx]
    unloaded = [db for db in batch if not db.get("details_loaded", False)]
    
    if not unloaded:
        return  
    
    def fetch_db_details(db_data):
        if db_data.get("details_loaded", False):
            return db_data
            
        name = db_data["name"]
        output, error, code = run_command(f"turso db show {name}")
        if code == 0:
            try:
                
                size_match = re.search(r'Size:\s+([\d.]+\s*[KMGTP]?B)', output)
                size = size_match.group(1) if size_match else "Unknown"
                
                
                group_match = re.search(r'Group:\s+(\w+)', output)
                group = group_match.group(1) if group_match else db_data.get("group", "default")
                
                db_data["group"] = group
                db_data["size"] = size
                db_data["details_loaded"] = True
            except Exception as e:
                db_data["group"] = db_data.get("group", "Error")
                db_data["size"] = "Error"
                db_data["details_loaded"] = True
        else:
            db_data["group"] = db_data.get("group", "Error")
            db_data["size"] = "Error"
            db_data["details_loaded"] = True
        return db_data
    
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_db_details, db): db for db in unloaded}
        
        completed = 0
        for future in as_completed(futures):
            completed += 1
            
            print(f"\r{Colors.GRAY}Loading: [{completed}/{len(unloaded)}]{Colors.ENDC}", end='', flush=True)
    
    print("\r" + " " * 50 + "\r", end='')  

def get_database_details(db_name):
    """Get detailed information about a database including size."""
    show_output, show_error, show_code = run_command(f"turso db show {db_name}", timeout=30)
    if show_code != 0:
        return None
    
    
    size_match = re.search(r'Size:\s+([\d.]+\s*[KMGTP]?B)', show_output)
    size = size_match.group(1) if size_match else "Unknown"
    
    return {"size": size}

def find_empty_databases():
    """Find and return all empty databases."""
    print_info("Searching for empty databases...")
    
    
    databases = fetch_all_database_details(lazy=False)
    
    if not databases:
        print_warning("No databases found.")
        return []
    
    
    empty_databases = []
    for db in databases:
        size = db.get("size", "Unknown")
        
        if size in ["0 B", "0 bytes", "0KB", "0 KB", "0B"]:
            empty_databases.append(db)
        
        elif size.startswith("0 ") or size.startswith("0."):
            
            size_match = re.match(r'^([\d.]+)\s*([KMGTP]?B)', size)
            if size_match:
                size_value = float(size_match.group(1))
                if size_value == 0:
                    empty_databases.append(db)
    
    
    if empty_databases:
        print_info(f"Found {Colors.CYAN}{len(empty_databases)}{Colors.ENDC} empty database(s).")
    else:
        print_info("No empty databases found.")
    
    return empty_databases

def interactive_deletion():
    """Interactive deletion with lazy loading support."""
    databases = fetch_all_database_details(lazy=True, page_size=25)

    if not databases:
        print_warning("No databases available to delete.")
        return

    databases.sort(key=lambda db: db['name'].lower())

    page_size = 25
    current_page = 0
    total_pages = math.ceil(len(databases) / page_size)
    current_index = 0

    print_info("\nUse the following controls:")
    print(f"  {Colors.CYAN}↑/↓{Colors.ENDC} or {Colors.CYAN}j/k{Colors.ENDC} - Navigate")
    print(f"  {Colors.CYAN}SPACE{Colors.ENDC} - Toggle selection")
    print(f"  {Colors.CYAN}a{Colors.ENDC} - Select all on page")
    print(f"  {Colors.CYAN}d{Colors.ENDC} - Deselect all on page")
    print(f"  {Colors.CYAN}n/p{Colors.ENDC} - Next/Previous page")
    print(f"  {Colors.CYAN}ENTER{Colors.ENDC} - Confirm deletion")
    print(f"  {Colors.CYAN}q{Colors.ENDC} or {Colors.CYAN}ESC{Colors.ENDC} - Cancel")

    def display_page():
        import shutil
        start_idx = current_page * page_size
        end_idx = min(start_idx + page_size, len(databases))
        load_database_details_batch(databases, start_idx, end_idx)

        os.system('clear' if os.name == 'posix' else 'cls')
        cols = max(60, shutil.get_terminal_size(fallback=(100, 24)).columns)

        # Compact single-line title + page indicator
        title = "🗑️  INTERACTIVE DATABASE DELETION"
        title_line = f"{title} — Page {current_page + 1}/{total_pages}"
        print(f"{Colors.PURPLE}{title_line}{Colors.ENDC}")
        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")

        # Dynamic columns: name | group | size
        group_w = 18
        size_w = 12
        prefix_w = 2 + 1 + 3 + 1  # indicator + spaces and checkbox
        sep_w = 3 + 3              # ' | ' twice
        name_w = max(20, cols - (prefix_w + sep_w + group_w + size_w))

        header = f"{'':2} {'Sel':3} {'Database Name':{name_w}} | {'Group':{group_w}} | {'Size':{size_w}}"
        print(f"{Colors.BOLD}{Colors.WHITE}{header}{Colors.ENDC}")
        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")

        for i in range(start_idx, end_idx):
            db = databases[i]
            is_current = (i == current_index)
            is_selected = db.get("selected", False)

            sel_indicator = "[✓]" if is_selected else "[ ]"
            row_indicator = "▶" if is_current else " "

            raw_name = db['name']
            db_name = (raw_name[: name_w - 2] + "..") if len(raw_name) > name_w else raw_name
            raw_group = db.get('group', 'default')
            db_group = (raw_group[: group_w - 2] + "..") if len(raw_group) > group_w else raw_group
            raw_size = db.get('size', 'Unknown')
            db_size = (raw_size[: size_w - 2] + "..") if len(raw_size) > size_w else raw_size

            name_color = Colors.CYAN if is_selected else Colors.WHITE
            bg_color = Colors.OKGREEN if (is_current and is_selected) else (Colors.YELLOW if is_current else "")
            reset_color = Colors.ENDC if is_current or is_selected else ""

            line = f"{row_indicator:2} {sel_indicator:3} {name_color}{db_name:{name_w}}{Colors.ENDC} | {db_group:{group_w}} | {db_size:{size_w}}"
            print(f"{bg_color}{line}{reset_color}")

        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")

        selected_count = sum(1 for db in databases if db.get("selected", False))
        if selected_count > 0:
            print(f"{Colors.BOLD}{Colors.ORANGE}Selected: {selected_count} • ENTER to delete • SPACE to toggle • q to quit{Colors.ENDC}")
        else:
            print(f"{Colors.GRAY}SPACE to toggle • ENTER to delete • n/p to page • q to quit{Colors.ENDC}")

    try:
        import termios, tty
        old_settings = termios.tcgetattr(sys.stdin)
        tty.setraw(sys.stdin.fileno())

        while True:
            display_page()
            char = sys.stdin.read(1)

            if char == '':
                next_char = sys.stdin.read(1)
                if next_char == '[':
                    arrow = sys.stdin.read(1)
                    if arrow == 'A' and current_index > 0:
                        current_index -= 1
                        if current_index < current_page * page_size:
                            current_page -= 1
                    elif arrow == 'B' and current_index < len(databases) - 1:
                        current_index += 1
                        if current_index >= (current_page + 1) * page_size:
                            current_page += 1
                else:
                    break

            elif char == ' ':
                databases[current_index]["selected"] = not databases[current_index].get("selected", False)

            elif char in ('j', 'J') and current_index < len(databases) - 1:
                current_index += 1
                if current_index >= (current_page + 1) * page_size:
                    current_page += 1

            elif char in ('k', 'K') and current_index > 0:
                current_index -= 1
                if current_index < current_page * page_size:
                    current_page -= 1

            elif char in ('n', 'N') and current_page < total_pages - 1:
                current_page += 1
                current_index = current_page * page_size

            elif char in ('p', 'P') and current_page > 0:
                current_page -= 1
                current_index = current_page * page_size

            elif char in ('a', 'A'):
                start_idx = current_page * page_size
                end_idx = min(start_idx + page_size, len(databases))
                for i in range(start_idx, end_idx):
                    databases[i]["selected"] = True

            elif char in ('d', 'D'):
                start_idx = current_page * page_size
                end_idx = min(start_idx + page_size, len(databases))
                for i in range(start_idx, end_idx):
                    databases[i]["selected"] = False
            elif char in ('\r', '\n'):
                selected_dbs = [db for db in databases if db.get("selected", False)]
                if selected_dbs:
                    termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)

                    os.system('clear' if os.name == 'posix' else 'cls')
                    print_section_divider("🚨 CONFIRM DELETION")
                    print_warning("You are about to PERMANENTLY delete the following databases:")
                    for db in selected_dbs:
                        print(f"  - {Colors.BOLD}{Colors.FAIL}{db['name']}{Colors.ENDC} (Size: {db.get('size', 'Unknown')})")

                    confirm = input(f"\n{Colors.BOLD}{Colors.ORANGE}Type 'DELETE' to confirm deletion: {Colors.ENDC}").strip()

                    if confirm == 'DELETE':
                        # Ask about dry-run
                        dry_run_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Perform dry-run first? (y/N): {Colors.ENDC}").strip().lower()
                        
                        db_names = [db['name'] for db in selected_dbs]
                        
                        if dry_run_choice == 'y':
                            # Perform dry-run
                            delete_databases_batch(db_names, max_workers=5, dry_run=True)
                            proceed = input(f"\n{Colors.BOLD}{Colors.ORANGE}Proceed with actual deletion? (y/N): {Colors.ENDC}").strip().lower()
                            if proceed != 'y':
                                print_info("Deletion cancelled.")
                                tty.setraw(sys.stdin.fileno())
                                continue
                        
                        # Save backup before deletion
                        backup_file = save_deletion_backup(selected_dbs)
                        if backup_file:
                            print_success(f"Backup saved to: {Colors.CYAN}{backup_file}{Colors.ENDC}")
                        
                        print_info("\nProceeding with deletion...")
                        successful, failed = delete_databases_batch(db_names, max_workers=5)
                        
                        input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to exit...{Colors.ENDC}")
                        break
                    else:
                        print_info("\nDeletion cancelled.")
                        tty.setraw(sys.stdin.fileno())

            elif char in ('q', 'Q'):
                break

            elif char == '':
                raise KeyboardInterrupt

    except KeyboardInterrupt:
        print_error("\n\nOperation cancelled by user.")
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
        print("\n")

# Removed a duplicated, partially broken interactive deletion block to resolve syntax/indent issues

def delete_empty_databases_interactive(auto_confirm=False, delete_all=False):
    """Interactive deletion for empty databases only.
    
    Args:
        auto_confirm: If True, skip confirmation prompts (for CI/automation)
        delete_all: If True, delete all empty databases without selection
    """
    
    databases = find_empty_databases()
    
    
    if not databases:
        print_warning("No empty databases found to delete.")
        return
    
    
    if auto_confirm and delete_all:
        print_section_divider("🗑️  AUTO-DELETE EMPTY DATABASES")
        print_info(f"Found {Colors.CYAN}{len(databases)}{Colors.ENDC} empty database(s) to delete:")
        for db in databases:
            print(f"  - {Colors.BOLD}{db['name']}{Colors.ENDC} (Size: {db['size']})")
        
        # Save backup even in auto-confirm mode
        backup_file = save_deletion_backup(databases)
        if backup_file:
            print_success(f"Backup saved to: {Colors.CYAN}{backup_file}{Colors.ENDC}")
        
        print_info("\nProceeding with deletion (auto-confirm mode)...")
        
        # Use batch deletion for parallel execution
        db_names = [db['name'] for db in databases]
        successful, failed = delete_databases_batch(db_names, max_workers=5)
        
        # Results are already printed by delete_databases_batch
        return
    
    
    if not auto_confirm and len(databases) > 1:
        print_section_divider("🗑️  DELETE EMPTY DATABASES")
        print_info(f"Found {Colors.CYAN}{len(databases)}{Colors.ENDC} empty database(s).")
        print("\nHow would you like to proceed?")
        print(f"  {Colors.CYAN}1{Colors.ENDC} - Delete ALL empty databases at once")
        print(f"  {Colors.CYAN}2{Colors.ENDC} - Select databases individually")
        print(f"  {Colors.CYAN}3{Colors.ENDC} - Cancel")
        
        choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Enter your choice (1-3): {Colors.ENDC}").strip()
        
        if choice == '1':
            
            os.system('clear' if os.name == 'posix' else 'cls')
            print_section_divider("🚨 CONFIRM BULK DELETION")
            print_warning("You are about to PERMANENTLY delete ALL empty databases:")
            for db in databases:
                print(f"  - {Colors.BOLD}{Colors.FAIL}{db['name']}{Colors.ENDC} (Group: {db['group']}, Size: {db['size']})")
            
            confirm = input(f"\n{Colors.BOLD}{Colors.ORANGE}Type 'DELETE ALL' to confirm deletion of all {len(databases)} databases: {Colors.ENDC}").strip()
            
            if confirm == 'DELETE ALL':
                # Save backup before bulk deletion
                backup_file = save_deletion_backup(databases)
                if backup_file:
                    print_success(f"Backup saved to: {Colors.CYAN}{backup_file}{Colors.ENDC}")
                
                print_info("\nProceeding with bulk deletion...")
                
                # Use batch deletion for parallel execution
                db_names = [db['name'] for db in databases]
                successful, failed_databases = delete_databases_batch(db_names, max_workers=5)
                
                # Results are already printed by delete_databases_batch
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to exit...{Colors.ENDC}")
                return
            else:
                print_info("\nBulk deletion cancelled.")
                return
        elif choice == '3':
            print_info("Operation cancelled.")
            return
        elif choice != '2':
            print_warning("Invalid choice. Defaulting to individual selection.")
    
    
    for db in databases:
        db["selected"] = False
    
    
    page_size = 25
    current_page = 0
    total_pages = math.ceil(len(databases) / page_size)
    
    print_info("\nUse the following controls:")
    print(f"  {Colors.CYAN}↑/↓{Colors.ENDC} or {Colors.CYAN}j/k{Colors.ENDC} - Navigate")
    print(f"  {Colors.CYAN}SPACE{Colors.ENDC} - Toggle selection")
    print(f"  {Colors.CYAN}a{Colors.ENDC} - Select all on page")
    print(f"  {Colors.CYAN}d{Colors.ENDC} - Deselect all on page")
    if total_pages > 1:
        print(f"  {Colors.CYAN}n/p{Colors.ENDC} - Next/Previous page")
    print(f"  {Colors.CYAN}ENTER{Colors.ENDC} - Confirm deletion")
    print(f"  {Colors.CYAN}q{Colors.ENDC} or {Colors.CYAN}ESC{Colors.ENDC} - Cancel")
    
    current_index = 0
    
    def display_page():
        import shutil
        os.system('clear' if os.name == 'posix' else 'cls')
        cols = max(60, shutil.get_terminal_size(fallback=(100, 24)).columns)
        
        # Compact single-line title + page indicator
        title = "🗑️  DELETE EMPTY DATABASES"
        title_line = f"{title} — Page {current_page + 1}/{total_pages} — {len(databases)} empty DBs"
        print(f"{Colors.PURPLE}{title_line}{Colors.ENDC}")
        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")
        
        start_idx = current_page * page_size
        end_idx = min(start_idx + page_size, len(databases))
        
        group_w = 18
        size_w = 12
        prefix_w = 2 + 1 + 3 + 1
        sep_w = 3 + 3
        name_w = max(20, cols - (prefix_w + sep_w + group_w + size_w))
        
        header = f"{'':2} {'Sel':3} {'Database Name':{name_w}} | {'Group':{group_w}} | {'Size':{size_w}}"
        print(f"{Colors.BOLD}{Colors.WHITE}{header}{Colors.ENDC}")
        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")
        
        for i in range(start_idx, end_idx):
            db = databases[i]
            is_current = (i == current_index)
            is_selected = db.get("selected", False)
            
            sel_indicator = "[✓]" if is_selected else "[ ]"
            row_indicator = "▶" if is_current else " "
            
            raw_name = db['name']
            db_name = (raw_name[: name_w - 2] + "..") if len(raw_name) > name_w else raw_name
            raw_group = db.get('group', 'default')
            db_group = (raw_group[: group_w - 2] + "..") if len(raw_group) > group_w else raw_group
            raw_size = db.get('size', 'Unknown')
            db_size = (raw_size[: size_w - 2] + "..") if len(raw_size) > size_w else raw_size

            name_color = Colors.CYAN if is_selected else Colors.WHITE
            bg_color = Colors.OKGREEN if (is_current and is_selected) else (Colors.YELLOW if is_current else "")
            reset_color = Colors.ENDC if is_current or is_selected else ""

            line = f"{row_indicator:2} {sel_indicator:3} {name_color}{db_name:{name_w}}{Colors.ENDC} | {db_group:{group_w}} | {db_size:{size_w}}"
            print(f"{bg_color}{line}{reset_color}")
        
        print(f"{Colors.GRAY}{'─' * cols}{Colors.ENDC}")
        
        selected_count = sum(1 for db in databases if db["selected"])
        if selected_count > 0:
            print(f"{Colors.BOLD}{Colors.ORANGE}Selected: {selected_count} • ENTER to delete • SPACE to toggle • q to quit{Colors.ENDC}")
        else:
            print(f"{Colors.GRAY}SPACE to toggle • ENTER to delete • n/p to page • q to quit{Colors.ENDC}")
    
    
    import termios, tty
    old_settings = termios.tcgetattr(sys.stdin)
    
    try:
        tty.setraw(sys.stdin.fileno())
        
        while True:
            display_page()
            
            
            char = sys.stdin.read(1)
            
            if char == '\x1b':  
                next_char = sys.stdin.read(1)
                if next_char == '[':  
                    arrow = sys.stdin.read(1)
                    if arrow == 'A':  
                        if current_index > 0:
                            current_index -= 1
                            if current_index < current_page * page_size:
                                current_page -= 1
                    elif arrow == 'B':  
                        if current_index < len(databases) - 1:
                            current_index += 1
                            if current_index >= (current_page + 1) * page_size:
                                current_page += 1
                else:
                    
                    break
            
            elif char == ' ':  
                databases[current_index]["selected"] = not databases[current_index]["selected"]
            
            elif char == 'j' or char == 'J':  
                if current_index < len(databases) - 1:
                    current_index += 1
                    if current_index >= (current_page + 1) * page_size:
                        current_page += 1
            
            elif char == 'k' or char == 'K':  
                if current_index > 0:
                    current_index -= 1
                    if current_index < current_page * page_size:
                        current_page -= 1
            
            elif char == 'n' or char == 'N':  
                if current_page < total_pages - 1:
                    current_page += 1
                    current_index = current_page * page_size
            
            elif char == 'p' or char == 'P':  
                if current_page > 0:
                    current_page -= 1
                    current_index = current_page * page_size
            
            elif char == 'a' or char == 'A':  
                start_idx = current_page * page_size
                end_idx = min(start_idx + page_size, len(databases))
                for i in range(start_idx, end_idx):
                    databases[i]["selected"] = True
            
            elif char == 'd' or char == 'D':  
                start_idx = current_page * page_size
                end_idx = min(start_idx + page_size, len(databases))
                for i in range(start_idx, end_idx):
                    databases[i]["selected"] = False
            
            elif char == '\r' or char == '\n':  
                selected_dbs = [db for db in databases if db["selected"]]
                if selected_dbs:
                    
                    termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
                    
                    os.system('clear' if os.name == 'posix' else 'cls')
                    print_section_divider("🚨 CONFIRM EMPTY DATABASE DELETION")
                    print_warning("You are about to PERMANENTLY delete the following empty databases:")
                    for db in selected_dbs:
                        print(f"  - {Colors.BOLD}{Colors.FAIL}{db['name']}{Colors.ENDC} (Size: {db['size']})")
                    
                    confirm = input(f"\n{Colors.BOLD}{Colors.ORANGE}Type 'DELETE' to confirm deletion: {Colors.ENDC}").strip()
                    
                    if confirm == 'DELETE':
                        # Ask about dry-run for empty databases too
                        dry_run_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Perform dry-run first? (y/N): {Colors.ENDC}").strip().lower()
                        
                        db_names = [db['name'] for db in selected_dbs]
                        
                        if dry_run_choice == 'y':
                            # Perform dry-run
                            delete_databases_batch(db_names, max_workers=5, dry_run=True)
                            proceed = input(f"\n{Colors.BOLD}{Colors.ORANGE}Proceed with actual deletion? (y/N): {Colors.ENDC}").strip().lower()
                            if proceed != 'y':
                                print_info("Deletion cancelled.")
                                tty.setraw(sys.stdin.fileno())
                                continue
                        
                        # Save backup before deletion
                        backup_file = save_deletion_backup(selected_dbs)
                        if backup_file:
                            print_success(f"Backup saved to: {Colors.CYAN}{backup_file}{Colors.ENDC}")
                        
                        print_info("\nProceeding with deletion...")
                        successful, failed_databases = delete_databases_batch(db_names, max_workers=5)
                        
                        input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to exit...{Colors.ENDC}")
                        break
                    else:
                        print_info("\nDeletion cancelled.")
                        
                        tty.setraw(sys.stdin.fileno())
            
            elif char == 'q' or char == 'Q':  
                break
            
            elif char == '\x03':  
                raise KeyboardInterrupt
    
    except KeyboardInterrupt:
        print_error("\n\nOperation cancelled by user.")
    finally:
        
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
        print("\n")  


def check_dependencies():
    """Check if required dependencies are installed with comprehensive safety guards."""
    print_step(1, 6, "Checking system dependencies...")
    
    missing_deps = []
    warnings = []
    
    
    turso_output, turso_error, turso_code = run_command("turso --version")
    if turso_code != 0:
        missing_deps.append({
            "name": "Turso CLI",
            "install_cmd": "curl -sSfL https://get.tur.so/install.sh | bash",
            "docs": "https://docs.turso.tech/reference/turso-cli",
            "reason": "Required for database operations"
        })
    else:
        turso_version = turso_output.split('\n')[0] if turso_output else "Unknown version"
        print_success(f"Turso CLI found: {Colors.CYAN}{turso_version}{Colors.ENDC}")
    
    
    clipboard_available = False
    try:
        pyperclip.copy("test_clipboard_turso_gen")
        if pyperclip.paste() == "test_clipboard_turso_gen":
            print_success("Clipboard functionality available.")
            clipboard_available = True
        else:
            raise pyperclip.PyperclipException("Paste check failed")
    except Exception as e:
        warnings.append({
            "message": f"Clipboard functionality limited: {e}",
            "solutions": get_clipboard_solutions()
        })
    
    
    python_version = sys.version_info
    if python_version < (3, 6):
        missing_deps.append({
            "name": "Python 3.6+",
            "install_cmd": "Please upgrade Python",
            "docs": "https://python.org/downloads",
            "reason": "Script requires Python 3.6 or higher"
        })
    else:
        print_success(f"Python version: {Colors.CYAN}{python_version.major}.{python_version.minor}.{python_version.micro}{Colors.ENDC}")
    
    
    if missing_deps:
        print_section_divider("❌ MISSING DEPENDENCIES")
        print_error("Some required dependencies are missing:")
        
        for dep in missing_deps:
            print(f"\n{Colors.BOLD}{Colors.FAIL}• {dep['name']}{Colors.ENDC}")
            print(f"  {Colors.GRAY}Reason: {dep['reason']}{Colors.ENDC}")
            print(f"  {Colors.CYAN}Install: {dep['install_cmd']}{Colors.ENDC}")
            print(f"  {Colors.GRAY}Docs: {dep['docs']}{Colors.ENDC}")
        
        print(f"\n{Colors.BOLD}{Colors.ORANGE}Please install the missing dependencies and try again.{Colors.ENDC}")
        
        
        try:
            create_installer = input(f"\n{Colors.BOLD}{Colors.ORANGE}Create installation script? (y/N): {Colors.ENDC}").strip().lower()
            if create_installer == 'y':
                create_installation_script(missing_deps)
        except KeyboardInterrupt:
            pass
        
        sys.exit(1)
    
    
    if warnings:
        for warning in warnings:
            print_warning(warning["message"])
            for solution in warning["solutions"]:
                print_info(solution)
    
    return clipboard_available

def get_clipboard_solutions():
    """Get platform-specific clipboard solutions."""
    import platform
    system = platform.system().lower()
    
    if system == "linux":
        return [
            "For Linux, install xclip: sudo apt-get install xclip",
            "Or install xsel: sudo apt-get install xsel",
            "For Wayland: sudo apt-get install wl-clipboard"
        ]
    elif system == "darwin":  
        return [
            "macOS clipboard should work by default",
            "If issues persist, try: pip install pyobjc-framework-Cocoa"
        ]
    elif system == "windows":
        return [
            "Windows clipboard should work by default",
            "If issues persist, try running as administrator"
        ]
    else:
        return ["Please check your system's clipboard manager"]

def create_installation_script(missing_deps):
    """Create a platform-specific installation script."""
    import platform
    system = platform.system().lower()
    
    if system in ("linux", "darwin"):
        script_name = "install_dependencies.sh"
        lines = [
            "#!/usr/bin/env bash",
            "set -euo pipefail",
            "echo 'Installing Turso DB Creator CLI dependencies...'",
        ]
        for dep in missing_deps:
            if "Turso CLI" in dep.get("name", "") and dep.get("install_cmd"):
                lines.append(dep["install_cmd"])
        lines.append("pip install pyperclip rich")
        if system == "linux":
            lines.extend([
                "sudo apt-get update",
                "sudo apt-get install -y xclip xsel wl-clipboard || true",
            ])
        lines.append("echo 'Dependencies installed successfully!'")
        script_content = "\n".join(lines) + "\n"
    else:
        script_name = "install_dependencies.bat"
        script_content = (
            "@echo off\n"
            "echo Installing Turso DB Creator CLI dependencies...\n\n"
            "pip install pyperclip rich\n\n"
            "echo Please install Turso CLI manually from: https://docs.turso.tech/reference/turso-cli\n"
            "pause\n"
        )
    
    try:
        with open(script_name, 'w') as f:
            f.write(script_content)
        if system != "windows":
            os.chmod(script_name, 0o755)
        print_success(f"Installation script created: {Colors.CYAN}{script_name}{Colors.ENDC}")
        print_info(f"Run it with: {Colors.BOLD}./{script_name}{Colors.ENDC}")
    except IOError as e:
        print_error(f"Could not create installation script: {e}")









def interactive_main_menu():
    """Display the main interactive menu and handle user selection."""
    while True:
        os.system('clear' if os.name == 'posix' else 'cls')
        print_ascii_header()
        print_section_divider("🎯 INTERACTIVE MODE")
        
        print(f"\n{Colors.BOLD}{Colors.WHITE}Select an option:{Colors.ENDC}")
        print(f"  {Colors.CYAN}1{Colors.ENDC} - Create new database")
        print(f"  {Colors.CYAN}2{Colors.ENDC} - Delete last generated database")
        print(f"  {Colors.CYAN}3{Colors.ENDC} - Delete empty databases")
        print(f"  {Colors.CYAN}4{Colors.ENDC} - Interactive database deletion")
        print(f"  {Colors.CYAN}5{Colors.ENDC} - Configure script settings")
        print(f"  {Colors.CYAN}6{Colors.ENDC} - Database seeding options")
        print(f"  {Colors.CYAN}7{Colors.ENDC} - Help / Documentation")
        print(f"  {Colors.CYAN}8{Colors.ENDC} - Exit")
        
        try:
            choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Enter your choice (1-8): {Colors.ENDC}").strip()
            
            if choice == '1':
                
                os.system('clear' if os.name == 'posix' else 'cls')
                print_ascii_header()
                create_database_interactive()
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to return to menu...{Colors.ENDC}")
                
            elif choice == '2':
                
                os.system('clear' if os.name == 'posix' else 'cls')
                print_ascii_header()
                print_section_divider("🗑️  DELETE LAST GENERATION")
                if STATE_FILE.exists():
                    try:
                        with open(STATE_FILE, 'r') as f:
                            state = json.load(f)
                            last_db_name = state.get('last_database_name')
                            if last_db_name:
                                confirm = input(f"{Colors.BOLD}{Colors.ORANGE}Delete database '{last_db_name}'? (y/N): {Colors.ENDC}").strip().lower()
                                if confirm == 'y':
                                    if delete_database(last_db_name):
                                        print_success(f"Database '{last_db_name}' deleted successfully!")
                                        STATE_FILE.unlink(missing_ok=True)
                                        print_info("State file cleared.")
                                    else:
                                        print_error(f"Failed to delete database '{last_db_name}'.")
                                else:
                                    print_info("Deletion cancelled.")
                            else:
                                print_warning("No database name found in state file.")
                    except (json.JSONDecodeError, KeyError) as e:
                        print_error(f"Could not read state file: {e}")
                else:
                    print_warning("No previous generation found (state file doesn't exist).")
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to return to menu...{Colors.ENDC}")
                
            elif choice == '3':
                
                os.system('clear' if os.name == 'posix' else 'cls')
                # Show backup directory info
                print_info(f"Deletion backups are saved to: {Colors.CYAN}{DELETION_BACKUP_DIR}{Colors.ENDC}")
                delete_empty_databases_interactive(auto_confirm=False, delete_all=False)
                
            elif choice == '4':
                
                interactive_deletion()
                
            elif choice == '5':
                
                os.system('clear' if os.name == 'posix' else 'cls')
                print_ascii_header()
                configure_script()
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to return to menu...{Colors.ENDC}")
                
            elif choice == '6':
                
                database_seeding_menu()
                
            elif choice == '7':
                
                show_interactive_help()
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to return to menu...{Colors.ENDC}")
                
            elif choice == '8':
                
                print_info("Exiting...")
                sys.exit(0)
                
            else:
                print_warning("Invalid choice. Please select 1-8.")
                time.sleep(1)
                
        except KeyboardInterrupt:
            print_error("\n\nOperation cancelled by user.")
            sys.exit(1)
            
def show_interactive_help():
    """Display comprehensive help information for interactive mode."""
    os.system('clear' if os.name == 'posix' else 'cls')
    print_ascii_header()
    print_section_divider("📚 HELP & DOCUMENTATION")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}🚀 Quick Start:{Colors.ENDC}")
    print(f"{Colors.GRAY}This interactive mode provides easy access to all Turso database operations.{Colors.ENDC}")
    print(f"{Colors.GRAY}Simply select an option from the menu and follow the prompts.{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}📋 Available Operations:{Colors.ENDC}")
    
    print(f"\n{Colors.CYAN}1. Create New Database:{Colors.ENDC}")
    print(f"   - Generates a new Turso database with authentication token")
    print(f"   - Automatically copies credentials to clipboard")
    print(f"   - Option to save to .env file")
    print(f"   - Supports custom naming or auto-generated names")
    
    print(f"\n{Colors.CYAN}2. Delete Last Generated:{Colors.ENDC}")
    print(f"   - Removes the most recently created database by this script")
    print(f"   - Uses state tracking to identify the correct database")
    
    print(f"\n{Colors.CYAN}3. Delete Empty Databases:{Colors.ENDC}")
    print(f"   - Finds all databases with 0 bytes of data")
    print(f"   - Offers bulk or individual deletion options")
    print(f"   - Great for cleaning up test databases")
    
    print(f"\n{Colors.CYAN}4. Interactive Database Deletion:{Colors.ENDC}")
    print(f"   - Browse all your databases with pagination")
    print(f"   - Select multiple databases for deletion")
    print(f"   - Shows database size and group information")
    
    print(f"\n{Colors.CYAN}5. Configure Script:{Colors.ENDC}")
    print(f"   - Set default environment variable names")
    print(f"   - Configure auto-reveal preferences")
    print(f"   - Customize prompts and behaviors")
    print(f"   - Set default database prefixes")
    
    print(f"\n{Colors.CYAN}6. Database Seeding:{Colors.ENDC}")
    print(f"   - Drizzle migrations (drizzle-kit push/migrate)")
    print(f"   - SQL file migrations")
    print(f"   - Interactive seeding selection")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}⌨️  Keyboard Shortcuts:{Colors.ENDC}")
    print(f"   {Colors.CYAN}Ctrl+C{Colors.ENDC} - Cancel current operation")
    print(f"   {Colors.CYAN}Enter{Colors.ENDC}  - Confirm selection")
    print(f"   {Colors.CYAN}↑/↓{Colors.ENDC}    - Navigate in selection menus")
    print(f"   {Colors.CYAN}Space{Colors.ENDC}  - Toggle selection in lists")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}💡 Tips:{Colors.ENDC}")
    print(f"   • Run {Colors.CYAN}turso auth login{Colors.ENDC} before using this script")
    print(f"   • Credentials are automatically masked for security")
    print(f"   • Use configuration menu to disable unwanted prompts")
    print(f"   • State file tracks your last created database")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}🔧 Command Line Usage:{Colors.ENDC}")
    print(f"   {Colors.CYAN}python3 generate-turso-db.py interactive{Colors.ENDC}")
    print(f"   {Colors.CYAN}python3 generate-turso-db.py i{Colors.ENDC}")
    print(f"   {Colors.CYAN}python3 generate-turso-db.py -i{Colors.ENDC}")
    print(f"   {Colors.CYAN}python3 generate-turso-db.py --interactive{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.WHITE}📖 For more information:{Colors.ENDC}")
    print(f"   Visit: {Colors.CYAN}https://docs.turso.tech{Colors.ENDC}")
    print(f"   Script Version: {Colors.CYAN}{SCRIPT_VERSION}{Colors.ENDC}")
    print(f"   Last Updated: {Colors.GRAY}{LAST_UPDATED_TIMESTAMP}{Colors.ENDC}")

def database_seeding_menu():
    """Submenu for database seeding options."""
    while True:
        os.system('clear' if os.name == 'posix' else 'cls')
        print_ascii_header()
        print_section_divider("🌱 DATABASE SEEDING OPTIONS")
        
        print(f"\n{Colors.BOLD}{Colors.WHITE}Select seeding method:{Colors.ENDC}")
        print(f"  {Colors.CYAN}1{Colors.ENDC} - Create database with Drizzle seeding")
        print(f"  {Colors.CYAN}2{Colors.ENDC} - Create database with SQL file seeding")
        print(f"  {Colors.CYAN}3{Colors.ENDC} - Create database and choose seeding interactively")
        print(f"  {Colors.CYAN}4{Colors.ENDC} - Back to main menu")
        
        try:
            choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Enter your choice (1-4): {Colors.ENDC}").strip()
            
            if choice in ['1', '2', '3']:
                seed_mode = {'1': 'drizzle', '2': 'sql', '3': 'interactive'}[choice]
                create_database_interactive(seed_mode=seed_mode)
                input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to return to menu...{Colors.ENDC}")
            elif choice == '4':
                break
            else:
                print_warning("Invalid choice. Please select 1-4.")
                time.sleep(1)
                
        except KeyboardInterrupt:
            break

def create_database_interactive(seed_mode=None):
    """Interactive database creation with optional seeding."""
    try:
        
        check_dependencies()
        
        
        print_step(1, 6, "Verifying Turso CLI authentication...")
        auth_output, auth_error, auth_code = run_command("turso auth status")
        if auth_code != 0 or "You are not logged in" in auth_output or "not authenticated" in auth_output.lower():
            print_error("Turso CLI authentication failed or you are not logged in.")
            print_info(f"Please run: {Colors.BOLD}turso auth login{Colors.ENDC}")
            return
        whoami_output, _, _ = run_command("turso auth whoami")
        print_success(f"Turso CLI authentication verified (Logged in as: {Colors.CYAN}{whoami_output or 'user'}{Colors.ENDC}).")
        
        
        print_step(2, 6, "Database configuration...")
        db_name_input = input(f"{Colors.BOLD}{Colors.ORANGE}Enter database name (or press Enter for auto-generated): {Colors.ENDC}").strip()
        
        
        print_step(3, 6, "Creating new Turso database...")
        
        # Get available groups and let user select
        groups_output, groups_error, groups_code = run_command("turso group list")
        if groups_code != 0:
            print_warning("Could not fetch database groups. Using default group.")
            selected_group = "default"
        else:
            # Parse available groups
            available_groups = []
            for line in groups_output.split('\n'):
                if line.strip() and not line.startswith('NAME'):
                    group_name = line.split()[0]
                    if group_name:  # Make sure it's not empty
                        available_groups.append(group_name)
            
            if len(available_groups) > 1:
                print_info(f"Available database groups:")
                for i, group in enumerate(available_groups, 1):
                    print(f"  {i}. {Colors.CYAN}{group}{Colors.ENDC}")
                
                while True:
                    try:
                        group_choice = input(f"{Colors.BOLD}{Colors.ORANGE}Select group (1-{len(available_groups)}) or press Enter for default: {Colors.ENDC}").strip()
                        if not group_choice:
                            selected_group = "default"
                            break
                        group_idx = int(group_choice) - 1
                        if 0 <= group_idx < len(available_groups):
                            selected_group = available_groups[group_idx]
                            break
                        else:
                            print_warning(f"Please enter a number between 1 and {len(available_groups)}.")
                    except ValueError:
                        print_warning("Please enter a valid number.")
            else:
                selected_group = available_groups[0] if available_groups else "default"
        
        db_create_command = f"turso db create"
        if db_name_input:
            db_create_command += f" {db_name_input}"
        db_create_command += f" --group {selected_group}"
        
        print_info(f"Creating database in group: {Colors.CYAN}{selected_group}{Colors.ENDC}")
        create_output, create_error, create_code = run_command(db_create_command, timeout=90)
        if create_code != 0:
            print_error(f"Database creation failed: {create_error or 'Unknown error'}")
            return
        
        db_name_match = re.search(r'(?:Created database|Database)\s+([\w-]+)', create_output)
        if not db_name_match:
            print_error("Could not extract database name from Turso output.")
            print_info(f"Output: {create_output}")
            return
        
        db_name = db_name_match.group(1)
        print_success(f"Database '{Colors.CYAN}{db_name}{Colors.ENDC}' created successfully!")
        
        
        try:
            with open(STATE_FILE, "w") as f:
                json.dump({"last_database_name": db_name}, f)
        except Exception as e:
            print_warning(f"Could not save state file: {e}")
        
        
        print_step(4, 6, "Retrieving database connection details...")
        show_output, show_error, show_code = run_command(f"turso db show {db_name}", timeout=60)
        if show_code != 0:
            print_error(f"Failed to get database details for {db_name}: {show_error}")
            return
        
        url_match = re.search(r'URL:\s+(libsql://[\w.-]+)', show_output)
        if not url_match:
            print_error("Could not extract database URL from Turso output.")
            return
        DATABASE_URL = url_match.group(1)
        print_success("Database URL retrieved.")
        
        
        print_step(5, 6, "Generating authentication token...")
        token_output, token_error, token_code = run_command(f"turso db tokens create {db_name}", timeout=60)
        if token_code != 0:
            print_error(f"Token creation failed for {db_name}: {token_error}")
            return
        auth_token = token_output.strip()
        if not auth_token or len(auth_token) < 10:
            print_error("Generated token appears invalid or empty.")
            return
        print_success("Authentication token generated.")
        
        
        config = load_config()
        url_var_name = config['defaults']['env_url_name']
        token_var_name = config['defaults']['env_token_name']
        
        secrets_dict = print_env_vars_box(DATABASE_URL, auth_token, db_name, url_var_name, token_var_name)
        
        print_step(6, 6, "Finalizing setup...")
        
        
        env_vars_string = f"{url_var_name}={DATABASE_URL}\n{token_var_name}={auth_token}"
        try:
            pyperclip.copy(env_vars_string)
            print_success("🔗 URL and auth token copied to clipboard!")
        except Exception as e:
            print_warning(f"Could not copy to clipboard: {e}")
        
        
        if seed_mode:
            seeding_success = handle_seeding(seed_mode, db_name, DATABASE_URL, auth_token)
            if seeding_success:
                print_success("Database seeding completed successfully!")
            else:
                print_warning("Database seeding completed with some issues.")
        
        
        save_env = input(f"\n{Colors.BOLD}{Colors.ORANGE}Save credentials to .env file? (y/N): {Colors.ENDC}").strip().lower()
        if save_env == 'y':
            env_path = input(f"{Colors.BOLD}{Colors.ORANGE}Enter .env file path [.env]: {Colors.ENDC}").strip() or ".env"
            try:
                env_file_path = Path(env_path)
                env_file_path.parent.mkdir(parents=True, exist_ok=True)
                
                mode = 'a' if env_file_path.exists() else 'w'
                with open(env_file_path, mode) as f:
                    if mode == 'a':
                        f.write("\n\n")
                    f.write(f"{url_var_name}={DATABASE_URL}\n")
                    f.write(f"{token_var_name}={auth_token}\n")
                
                print_success(f"Credentials {'appended to' if mode == 'a' else 'written to'} {Colors.CYAN}{env_file_path}{Colors.ENDC}")
            except IOError as e:
                print_error(f"Could not write to {env_path}: {e}")
        
        print_footer(db_name)
        
    except KeyboardInterrupt:
        print_error("\n\nOperation cancelled by user.")
    except Exception as e:
        print_error(f"An unexpected error occurred: {e}")

def main():
    script_name = os.path.basename(sys.argv[0])
    parser = argparse.ArgumentParser(
        description=f'{Colors.BOLD}{Colors.ORANGE}Turso Database & Token Generator{Colors.ENDC} - Automate Turso DB tasks.',
        formatter_class=argparse.RawTextHelpFormatter, 
        epilog=f"""
{Colors.BOLD}{Colors.WHITE}Examples:{Colors.ENDC}
  {Colors.CYAN}python {script_name}{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} interactive{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --overwrite .env.local{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --no-clipboard{Colors.ENDC}
    {Colors.GRAY}

{Colors.BOLD}{Colors.OKGREEN}Database Seeding:{Colors.ENDC}
  {Colors.CYAN}python {script_name} --seed{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --seed drizzle{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --seed sql{Colors.ENDC}
    {Colors.GRAY}

{Colors.BOLD}{Colors.PURPLE}Interactive Mode:{Colors.ENDC}
  {Colors.CYAN}python {script_name} interactive{Colors.ENDC}
  {Colors.CYAN}python {script_name} i{Colors.ENDC}
  {Colors.CYAN}python {script_name} -i{Colors.ENDC}
  {Colors.CYAN}python {script_name} --interactive{Colors.ENDC}
    {Colors.GRAY}

{Colors.BOLD}{Colors.ORANGE}Configuration:{Colors.ENDC}
  {Colors.CYAN}python {script_name} --configure{Colors.ENDC}
    {Colors.GRAY}

{Colors.BOLD}{Colors.FAIL}Deletion Commands:{Colors.ENDC}
  {Colors.CYAN}python {script_name} --delete-generation{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --delete-empty{Colors.ENDC}
    {Colors.GRAY}

  {Colors.CYAN}python {script_name} --delete-interactive{Colors.ENDC}
    {Colors.GRAY}

{Colors.BOLD}{Colors.GRAY}Note: The --seed flag replaces previous --migrate-* variants.{Colors.ENDC}
        """
    )
    
    parser.add_argument('mode', nargs='?', choices=['interactive', 'i'], 
                       help='Launch interactive mode (can use "interactive" or "i")')
    
    
    parser.add_argument('-i', '--interactive', action='store_true',
                       help='Launch interactive mode with menu-driven interface')
    
    parser.add_argument('--name', metavar='DB_NAME',
                       help='Custom name for the database. If not provided, Turso will generate a random name.')
    parser.add_argument('--group', metavar='GROUP',
                       help='Turso group name where the database should be created.')
    parser.add_argument('--overwrite', metavar='FILENAME',
                       help='Filename (e.g., .env or .env.production) to update/create in project root.')
    parser.add_argument('--no-clipboard', action='store_true',
                       help='Skip copying credentials to the clipboard.')
    parser.add_argument('--auto-reveal', choices=['on', 'off'], default='off',
                       help='Automatically reveal secrets without prompting. Default: off')
    parser.add_argument('--env-url-name', metavar='VAR_NAME', default='DATABASE_URL',
                       help='Custom name for the database URL environment variable. Default: DATABASE_URL')
    parser.add_argument('--env-token-name', metavar='VAR_NAME', default='TURSO_AUTH_TOKEN',
                       help='Custom name for the auth token environment variable. Default: TURSO_AUTH_TOKEN')
    parser.add_argument('--configure', action='store_true',
                       help='Open configuration menu to set preferences.')
    parser.add_argument('--seed', nargs='?', const='interactive', 
                       choices=['drizzle', 'sql', 'interactive'], metavar='MODE',
                       help='Run database seeding after creation. MODE can be: drizzle (run drizzle-kit push/migrate), sql (apply local SQL files), or interactive (choose method). If no mode specified, falls back to configuration or prompts user.')

    delete_group = parser.add_argument_group(f'{Colors.BOLD}{Colors.FAIL}Deletion Options{Colors.ENDC} (use one at a time)')
    delete_group.add_argument('--delete-generation', action='store_true',
                              help='Delete the last database created by THIS script (uses state file).')
    delete_group.add_argument('--delete-empty', action='store_true',
                              help='Find and delete empty databases (databases with 0 bytes or minimal size).')
    delete_group.add_argument('--delete-empty-all', action='store_true',
                              help='Delete ALL empty databases without confirmation (CI/automation mode).')
    delete_group.add_argument('--delete-interactive', action='store_true',
                              help='Interactive menu to select and delete any databases.')
    delete_group.add_argument('--dry-run', action='store_true',
                              help='Simulate deletion operations without actually deleting (works with other delete flags).')
    delete_group.add_argument('--auto-confirm', action='store_true',
                              help='Skip all confirmation prompts (use with caution, for CI/automation).')

    args = parser.parse_args()
    
    
    is_interactive = (
        args.interactive or 
        args.mode in ['interactive', 'i'] or
        (len(sys.argv) == 2 and sys.argv[1] in ['interactive', 'i', '-i', '--i'])
    )
    
    if is_interactive:
        interactive_main_menu()
        sys.exit(0)
    
    
    config = load_config()
    
    
    if '--auto-reveal' not in sys.argv:
        args.auto_reveal = config['defaults']['auto_reveal']
    
    if '--no-clipboard' not in sys.argv and config['defaults']['no_clipboard']:
        args.no_clipboard = True
    
    
    if not args.name and config['defaults']['default_db_prefix']:
        prefix = config['defaults']['default_db_prefix']
        args.name = f"{prefix}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    
    
    global CONTENT_WIDTH
    CONTENT_WIDTH = config['display']['content_width']

    if args.delete_generation:
        print_section_divider("🗑️  DELETE LAST GENERATION")
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, 'r') as f:
                    state = json.load(f)
                    last_db_name = state.get('last_database_name')
                    if last_db_name:
                        if delete_database(last_db_name):
                            print_success(f"Database '{last_db_name}' deleted successfully!")
                            STATE_FILE.unlink(missing_ok=True)
                            print_info("State file cleared.")
                        else:
                            print_error(f"Failed to delete database '{last_db_name}'.")
                    else:
                        print_warning("No database name found in state file.")
            except (json.JSONDecodeError, KeyError) as e:
                print_error(f"Could not read state file: {e}")
        else:
            print_warning("No previous generation found (state file doesn't exist).")
        sys.exit(0)

    if args.delete_empty or args.delete_empty_all:
        print_section_divider("🗑️ DELETE EMPTY DATABASES")
        
        # Check for dry-run mode
        if args.dry_run:
            print_info("Running in DRY-RUN mode - no databases will be deleted")
            databases = find_empty_databases()
            if databases:
                print_info(f"Would delete {len(databases)} empty database(s):")
                for db in databases:
                    print(f"  {Colors.YELLOW}[DRY RUN]{Colors.ENDC} {db['name']} (Size: {db['size']})")
            else:
                print_info("No empty databases found.")
            sys.exit(0)
        
        auto_confirm = args.auto_confirm or args.delete_empty_all
        delete_all = args.delete_empty_all
        delete_empty_databases_interactive(auto_confirm=auto_confirm, delete_all=delete_all)
        sys.exit(0)

    if args.delete_interactive:
        print_section_divider("🗑️  INTERACTIVE DATABASE DELETION")
        if args.dry_run:
            print_info("DRY-RUN mode enabled - deletions will be simulated")
        interactive_deletion()
        sys.exit(0)

    if args.configure:
        os.system('clear' if os.name == 'posix' else 'cls')
        print_ascii_header()
        configure_script()
        sys.exit(0)

    # Skip header and clear screen if auto-confirm mode
    if not args.auto_confirm:
        os.system('clear' if os.name == 'posix' else 'cls')
        print_ascii_header()

    try:
        # Skip dependency checks in auto-confirm mode (assume they're installed)
        if not args.auto_confirm:
            check_dependencies()

        
        
        
        if not args.auto_confirm:
            print_step(2, 6, "Verifying Turso CLI authentication...")
        auth_output, auth_error, auth_code = run_command("turso auth status")
        if auth_code != 0 or "You are not logged in" in auth_output or "not authenticated" in auth_output.lower():
            print_error("Turso CLI authentication failed or you are not logged in.")
            print_info(f"Please run: {Colors.BOLD}turso auth login{Colors.ENDC}")
            sys.exit(1)
        whoami_output, _, _ = run_command("turso auth whoami")
        if not args.auto_confirm:
            print_success(f"Turso CLI authentication verified (Logged in as: {Colors.CYAN}{whoami_output or 'user'}{Colors.ENDC}).")
            print_step(3, 6, "Creating new Turso database...")
        
        
        # Automatically select a group if none is specified
        if not args.group:
            groups_output, groups_error, groups_code = run_command("turso group list")
            if groups_code == 0:
                # Parse available groups and use the first one (typically 'default')
                for line in groups_output.split('\n'):
                    if line.strip() and not line.startswith('NAME'):
                        group_name = line.split()[0]
                        if group_name:
                            args.group = group_name
                            if not args.auto_confirm:
                                print_info(f"Auto-selected group: {Colors.CYAN}{args.group}{Colors.ENDC}")
                            break
            
            # Fallback to 'default' if we couldn't parse groups
            if not args.group:
                args.group = "default"
                if not args.auto_confirm:
                    print_info(f"Using fallback group: {Colors.CYAN}{args.group}{Colors.ENDC}")
        
        db_create_command = f"turso db create"
        if args.name:
            db_create_command += f" {args.name}"
        db_create_command += f" --group {args.group}"
        
        create_output, create_error, create_code = run_command(db_create_command, timeout=90)
        if create_code != 0:
            print_error(f"Database creation failed: {create_error or 'Unknown error'}")
            sys.exit(1)

        db_name_match = re.search(r'(?:Created database|Database)\s+([\w-]+)', create_output) 
        if not db_name_match:
            print_error("Could not extract database name from Turso output.")
            print_info(f"Output: {create_output}")
            sys.exit(1)
        db_name = db_name_match.group(1)
        if not args.auto_confirm:
            print_success(f"Database '{Colors.CYAN}{db_name}{Colors.ENDC}' created successfully!")
        
        try:
            with open(STATE_FILE, "w") as f:
                json.dump({"last_database_name": db_name}, f)
        except Exception as e:
            print_warning(f"Could not save state file: {e}")

        if not args.auto_confirm:
            print_step(4, 6, "Retrieving database connection details...")
        show_output, show_error, show_code = run_command(f"turso db show {db_name}", timeout=60)
        if show_code != 0:
            print_error(f"Failed to get database details for {db_name}: {show_error}")
            sys.exit(1)

        url_match = re.search(r'URL:\s+(libsql://[\w.-]+)', show_output)
        if not url_match:
            print_error("Could not extract database URL from Turso output.")
            print_info(f"Output: {show_output}")
            sys.exit(1)
        DATABASE_URL = url_match.group(1)
        if not args.auto_confirm:
            print_success("Database URL retrieved.")
            print_step(5, 6, "Generating authentication token...")
        token_output, token_error, token_code = run_command(f"turso db tokens create {db_name}", timeout=60)
        if token_code != 0:
            print_error(f"Token creation failed for {db_name}: {token_error}")
            sys.exit(1)
        auth_token = token_output.strip() 
        if not auth_token or len(auth_token) < 10: 
            print_error("Generated token appears invalid or empty.")
            print_info(f"Output: {token_output}")
            sys.exit(1)
        if not args.auto_confirm:
            print_success("Authentication token generated.")

        
        url_var_name = args.env_url_name
        token_var_name = args.env_token_name
        
        new_vars = {url_var_name: DATABASE_URL, token_var_name: auth_token}
        env_vars_string_for_clipboard = f"{url_var_name}={DATABASE_URL}\n{token_var_name}={auth_token}"

        
        # Skip the visual box display in auto-confirm mode
        if not args.auto_confirm:
            secrets_dict = print_env_vars_box(DATABASE_URL, auth_token, db_name, url_var_name, token_var_name)
            print_step(6, 6, "Finalizing setup...")
        
        
        if not args.no_clipboard:
            try:
                pyperclip.copy(env_vars_string_for_clipboard)
                if not args.auto_confirm:
                    print_success("🔗 URL and auth token copied to clipboard!")
                
                # Skip all reveal prompts in auto-confirm mode
                if args.auto_confirm:
                    # In auto-confirm mode, only print final success message
                    print("✅ Credentials copied to clipboard successfully")
                    # Don't exit yet - need to check for --overwrite flag
                elif args.auto_reveal == 'on':
                    print(f"\n{Colors.BOLD}{Colors.OKGREEN}🔓 Secrets Revealed (auto-reveal enabled):{Colors.ENDC}")
                    print(f"{Colors.BOLD}{Colors.ORANGE}{url_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{DATABASE_URL}{Colors.ENDC}")
                    print(f"{Colors.BOLD}{Colors.ORANGE}{token_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{auth_token}{Colors.ENDC}")
                    input(f"{Colors.BOLD}{Colors.GRAY}Press Enter to continue...{Colors.ENDC}")
                else:
                    try:
                        reveal_choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Do you want to reveal them? (y/N): {Colors.ENDC}").strip().lower()
                        if reveal_choice == 'y':
                            print(f"\n{Colors.BOLD}{Colors.OKGREEN}🔓 Secrets Revealed:{Colors.ENDC}")
                            print(f"{Colors.BOLD}{Colors.ORANGE}{url_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{DATABASE_URL}{Colors.ENDC}")
                            print(f"{Colors.BOLD}{Colors.ORANGE}{token_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{auth_token}{Colors.ENDC}")
                            input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to continue...{Colors.ENDC}")
                        else:
                            print_info("Continuing with masked secrets...")
                    except KeyboardInterrupt:
                        print_info("\nContinuing with masked secrets...")
                    
            except Exception as e:
                if args.auto_confirm:
                    print(f"⚠️ Warning: Could not copy to clipboard - {e}")
                    # Don't exit on clipboard error if we have --overwrite
                    if not args.overwrite:
                        sys.exit(1)  # Only exit if no --overwrite provided
                else:
                    print_warning(f"Could not copy to clipboard: {e}")
                    print_info("You can manually copy the credentials from the box above.")
                
                try:
                    reveal_choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Do you want to reveal the secrets? (y/N): {Colors.ENDC}").strip().lower()
                    if reveal_choice == 'y':
                        print(f"\n{Colors.BOLD}{Colors.OKGREEN}🔓 Secrets Revealed:{Colors.ENDC}")
                        print(f"{Colors.BOLD}{Colors.ORANGE}{url_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{DATABASE_URL}{Colors.ENDC}")
                        print(f"{Colors.BOLD}{Colors.ORANGE}{token_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{auth_token}{Colors.ENDC}")
                        input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to continue...{Colors.ENDC}")
                except KeyboardInterrupt:
                    print_info("\nContinuing...")
        else:
            
            try:
                reveal_choice = input(f"\n{Colors.BOLD}{Colors.ORANGE}Do you want to reveal the secrets? (y/N): {Colors.ENDC}").strip().lower()
                if reveal_choice == 'y':
                    print(f"\n{Colors.BOLD}{Colors.OKGREEN}🔓 Secrets Revealed:{Colors.ENDC}")
                    print(f"{Colors.BOLD}{Colors.ORANGE}{url_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{DATABASE_URL}{Colors.ENDC}")
                    print(f"{Colors.BOLD}{Colors.ORANGE}{token_var_name}: {Colors.ENDC}{Colors.BRIGHT_CYAN}{auth_token}{Colors.ENDC}")
                    input(f"\n{Colors.BOLD}{Colors.GRAY}Press Enter to continue...{Colors.ENDC}")
            except KeyboardInterrupt:
                print_info("\nContinuing...")
        
        if args.overwrite:
            
            project_root = Path.cwd() 
            
            current_dir_check = Path.cwd()
            while current_dir_check != current_dir_check.parent: 
                if (current_dir_check / ".git").is_dir():
                    project_root = current_dir_check
                    if not args.auto_confirm:  # Only print in non-auto mode
                        print_info(f"Project root identified at: {Colors.CYAN}{project_root}{Colors.ENDC}")
                    break
                current_dir_check = current_dir_check.parent

            env_file_path = project_root / args.overwrite

            
            try:
                
                env_file_path.parent.mkdir(parents=True, exist_ok=True)

                mode = 'a' if env_file_path.exists() else 'w'
                with open(env_file_path, mode) as f:
                    if mode == 'a':
                        f.write("\n\n")
                    f.write(f"DATABASE_URL={DATABASE_URL}\n")
                    f.write(f"TURSO_AUTH_TOKEN={auth_token}\n")
                if args.auto_confirm:
                    print(f"✅ Environment variables {'appended to' if mode == 'a' else 'written to'} {env_file_path}")
                else:
                    print_success(f"Environment variables {'appended to' if mode == 'a' else 'written to'} {Colors.CYAN}{env_file_path}{Colors.ENDC}")
            except IOError as e:
                if args.auto_confirm:
                    print(f"❌ Error: Could not write to {env_file_path}: {e}")
                    sys.exit(1)
                else:
                    print_error(f"Could not write to {env_file_path}: {e}")
        elif not args.auto_confirm:
            print_info(f"To save credentials to a file, use: {Colors.BOLD}--overwrite FILENAME{Colors.ENDC}")
        
        # Exit here if auto-confirm mode (after handling --overwrite)
        if args.auto_confirm:
            sys.exit(0)

        
        if args.seed:
            seeding_success = handle_seeding(args.seed, db_name, DATABASE_URL, auth_token)
            if seeding_success:
                print_success("Database seeding completed successfully!")
            else:
                print_warning("Database seeding completed with some issues.")

        # Skip footer and prompts in auto-confirm mode
        if not args.auto_confirm:
            print_footer(db_name)
            post_completion_prompts(db_name, DATABASE_URL, auth_token)

    except KeyboardInterrupt:
        print_error("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print_error(f"An unexpected error occurred: {e}")
        
        
        
        sys.exit(1)

if __name__ == "__main__":
    # Check if auto-confirm is in args before bootstrap
    auto_confirm = '--auto-confirm' in sys.argv
    try:
        bootstrap_dependencies(auto_confirm=auto_confirm)
    except Exception:
        pass
    main()
