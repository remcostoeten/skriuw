
#!/usr/bin/env bash
# SK Intro — ANSI/ASCII terminal animation (bash, no deps)

# ────────────────────────────────────────────────────────────────────────────────
# Config
DURATION="${DURATION:-7}"      # seconds to run (or press any key to exit)
FPS="${FPS:-30}"
TITLE="${TITLE:-SK}"
GLOW_CYCLE_MS="${GLOW_CYCLE_MS:-1600}" # one shimmer pass duration
PARTICLES="${PARTICLES:-70}"   # how many sparkles
BG_COLOR=0                     # 0 = default background

# ────────────────────────────────────────────────────────────────────────────────
# ASCII Art (monospace, wide, high-contrast). Edit freely.
read -r -d '' ART <<'ASCII'
███████╗██╗  ██╗
██╔════╝╚██╗██╔╝
█████╗   ╚███╔╝
██╔══╝   ██╔██╗
███████╗██╔╝ ██╗
╚══════╝╚═╝  ╚═╝

███████╗██╗  ██╗
██╔════╝╚██╗██╔╝
█████╗   ╚███╔╝
██╔══╝   ██╔██╗
███████╗██╔╝ ██╗
╚══════╝╚═╝  ╚═╝
ASCII

# The art above is two blocks; we'll transform the right block to "K"
# by overpainting columns, so both share vertical alignment.
# Overpaint map: (row, col) => char
declare -A PATCH
# 0-based (per visible columns within the right half)
# Draw a slanted K on the right block area.
# We'll compute actual offsets later; here is the local K shape.
read -r -d '' KSHAPE <<'KTXT'
0:0:██╗
1:0:██║
2:0:██║███╗
3:0:██║╚██║
4:0:██║ ██║
5:0:╚═╝  ╚═╝
KTXT

# ────────────────────────────────────────────────────────────────────────────────
# ANSI helpers
ESC=$'\033'
CSI="${ESC}["
RESET="${CSI}0m"
HIDE_CURSOR="${CSI}?25l"
SHOW_CURSOR="${CSI}?25h"
CLEAR="${CSI}2J"
BGC="${CSI}48;5;"
FGC="${CSI}38;5;"

function cursor_to() { printf "%s%d;%dH" "$CSI" "$1" "$2"; } # row col (1-based)

# Smooth 256-color gradient: returns color index (0-255) for t in [0..1]
# We'll use a custom palette sweep across 33→201 (magenta/purple/cyan range).
function grad_color() {
  local t="$1"
  # clamp
  (( $(echo "$t < 0" | bc -l) )) && t=0
  (( $(echo "$t > 1" | bc -l) )) && t=1
  local start=33 end=201
  local val
  val=$(python3 - <<PY
t=$t
start=$start
end=$end
print(int(round(start + (end-start)*t)))
PY
)
  echo "$val"
}

# ────────────────────────────────────────────────────────────────────────────────
# Measure terminal + art
function term_size() {
  # tput is more portable than stty size across shells
  ROWS=$(tput lines)
  COLS=$(tput cols)
}

# Split ART into an array; determine width and height
mapfile -t ART_LINES <<<"$ART"
ART_H=${#ART_LINES[@]}
ART_W=0
for ln in "${ART_LINES[@]}"; do
  (( ${#ln} > ART_W )) && ART_W=${#ln}
done

# Right block detection to place "K" patch
# We assume a blank line separates the two 6-line blocks (total 13 lines, as above).
# Find mid-line (blank), then right block starts after the blank line.
# Determine right block x offset by scanning the longest line for double space separation.
function detect_blocks() {
  local sep_row=-1
  for i in "${!ART_LINES[@]}"; do
    [[ -z "${ART_LINES[$i]// /}" ]] && { sep_row=$i; break; }
  done
  TOP1=0
  BOT1=$((sep_row-1))
  TOP2=$((sep_row+1))
  BOT2=$((ART_H-1))

  # naive split position: center between first visible char of left and right clusters
  # Find first non-space on right area per line
  local min_col=9999
  for ((r=TOP2; r<=BOT2; r++)); do
    line="${ART_LINES[$r]}"
    # index of first non-space
    if [[ "$line" =~ [^[:space:]] ]]; then
      idx=$(awk -v s="$line" 'BEGIN{print index(s,gensub(/^ +/,"",1,s))}')
      (( idx>0 && idx<min_col )) && min_col=$idx
    fi
  done
  RIGHT_X=$min_col
}
detect_blocks

# Build K patch absolute positions from KSHAPE
function build_k_patch() {
  while IFS=: read -r rr cc txt; do
    [[ -z "$rr$cc$txt" ]] && continue
    PATCH["$((TOP2+rr)),$((RIGHT_X+cc))"]="$txt"
  done <<<"$KSHAPE"
}
build_k_patch

# Overpaint function to apply K on right block
function apply_k_patch_to_line() {
  local row="$1"
  local line="$2"
  # Walk through keys that match this row; merge by replacing segment at col
  for key in "${!PATCH[@]}"; do
    IFS=',' read -r r c <<<"$key"
    [[ "$r" -ne "$row" ]] && continue
    local seg="${PATCH[$key]}"
    local left="${line:0:c-1}"
    local right="${line:c-1+${#seg}}"
    line="${left}${seg}${right}"
  done
  printf "%s" "$line"
}

# ────────────────────────────────────────────────────────────────────────────────
# Particles (random sparkles around the art box)
function init_particles() {
  P_X=()
  P_Y=()
  P_VY=()
  for ((i=0;i<PARTICLES;i++)); do
    P_X[i]=0
    P_Y[i]=0
    P_VY[i]=0
  done
}

function place_particles_centered_box() {
  # Box: centered art with padding
  local pad=2
  local y0=$(( ORY - pad ))
  local x0=$(( ORX - pad ))
  local y1=$(( ORY + ART_H + pad ))
  local x1=$(( ORX + ART_W + pad ))
  for ((i=0;i<PARTICLES;i++)); do
    P_X[i]=$(( x0 + RANDOM % (x1-x0+1) ))
    P_Y[i]=$(( y0 + RANDOM % (y1-y0+1) ))
    P_VY[i]=$(( (RANDOM%3) - 1 )) # -1..1 vertical drift
  done
}

function update_particles() {
  for ((i=0;i<PARTICLES;i++)); do
    # tiny random walk
    (( P_X[i]+= (RANDOM%3)-1 ))
    (( P_Y[i]+= P_VY[i] ))
  done
}

function draw_particles() {
  local char="·"
  local cidx
  for ((i=0;i<PARTICLES;i++)); do
    local y=${P_Y[i]} x=${P_X[i]}
    if (( y>0 && y<=ROWS && x>0 && x<=COLS )); then
      # soft glow tones
      cidx=$(( 240 + (RANDOM%15) ))
      printf "%s" "${FGC}${cidx}m"
      cursor_to "$y" "$x"
      printf "%s" "$char"
    fi
  done
  printf "%s" "$RESET"
}

# ────────────────────────────────────────────────────────────────────────────────
# Main draw: gradient + shimmer + subtle breathing scale
function draw_frame() {
  local t_ms="$1" # elapsed ms
  local shimmer_phase=$(( t_ms % GLOW_CYCLE_MS ))
  # value in [0..1]
  local s=$(python3 - <<PY
t=$shimmer_phase/$GLOW_CYCLE_MS
print(t)
PY
)

  # shimmer column across width
  local shine_col
  shine_col=$(python3 - <<PY
import math
W=$ART_W
t=$s
col=int(round((W-1)*(0.5-0.5*math.cos(2*math.pi*t))))
print(col)
PY
)

  # Render each line centered
  for ((r=0; r<ART_H; r++)); do
    local line="${ART_LINES[$r]}"
    # Patch the K on right block rows
    line="$(apply_k_patch_to_line "$r" "$line")"

    # Pad to width
    printf -v line "%-${ART_W}s" "$line"

    cursor_to $(( ORY + r )) "$ORX"

    # Per-column color (gradient + shimmer)
    local out=""
    local i ch g tcol highlight
    for ((i=0;i<ART_W;i++)); do
      ch="${line:i:1}"

      # Compute gradient factor across width with a soft sine wobble
      g=$(python3 - <<PY
import math
i=$i
W=$ART_W
tm=$t_ms/1000.0
base=i/(W-1) if W>1 else 0
w=0.08*math.sin(2*math.pi*(tm*0.35 + i/W))
print(min(1,max(0,base+w)))
PY
)

      tcol=$(grad_color "$g")

      # Highlight shimmer on the current shine_col and neighbors
      highlight=0
      if (( i==shine_col || i==shine_col-1 || i==shine_col+1 )); then
        highlight=1
      fi

      if (( highlight==1 )); then
        out+="${BGC}${BG_COLOR}m${FGC}$(( tcol+20>255?255:tcol+20 ))m${ESC}[1m${ch}${RESET}"
      else
        out+="${BGC}${BG_COLOR}m${FGC}${tcol}m${ch}"
      fi
    done
    printf "%s%s" "$out" "$RESET"
  done
}

# ────────────────────────────────────────────────────────────────────────────────
# Timing helpers
function now_ms()  {
    python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
}
function sleep_ms() { python3 - "$1" <<'PY'
import time,sys
ms=int(sys.argv[1])
time.sleep(ms/1000)
PY
}

# ────────────────────────────────────────────────────────────────────────────────
# Init & main loop
function cleanup() {
  printf "%s%s%s" "$RESET" "$CLEAR" "$SHOW_CURSOR"
  tput sgr0
  stty echo icanon time 1 min 0 2>/dev/null
}
trap cleanup EXIT

stty -echo -icanon time 0 min 0 2>/dev/null

printf "%s%s" "$HIDE_CURSOR" "$CLEAR"
term_size

# Compute origin to center the art
ORX=$(( (COLS - ART_W)/2 ))
ORY=$(( (ROWS - ART_H)/2 ))
(( ORX<1 )) && ORX=1
(( ORY<1 )) && ORY=1

init_particles
place_particles_centered_box

start=$(now_ms)
end=$(( start + DURATION*1000 ))
frame_ms=$(( 1000 / FPS ))
last_ms="$start"

# Gentle entrance fade
for a in $(seq 0 6); do
  printf "%s" "$CLEAR"
  draw_frame "$(( (a*150) ))"
  draw_particles
  sleep_ms 90
done

# Main animation
while :; do
  t=$(now_ms)
  # exit if duration reached or any key pressed
  if (( t >= end )); then break; fi
  if read -rsn1 -t 0.001 _; then break; fi

  # Re-center if terminal resized
  prev_cols="$COLS"; prev_rows="$ROWS"
  term_size
  if (( COLS!=prev_cols || ROWS!=prev_rows )); then
    ORX=$(( (COLS - ART_W)/2 ))
    ORY=$(( (ROWS - ART_H)/2 ))
    (( ORX<1 )) && ORX=1
    (( ORY<1 )) && ORY=1
    place_particles_centered_box
  fi

  printf "%s" "$CLEAR"
  draw_frame "$(( t - start ))"
  update_particles
  draw_particles

  # Frame pacing
  dt=$(( now - last ))
  sleep_ms "$frame_ms"
  last_ms="$t"
done

# Exit fade
for a in $(seq 6 -1 0); do
  printf "%s" "$CLEAR"
  draw_frame "$(( (a*150) ))"
  draw_particles
  sleep_ms 40
done
