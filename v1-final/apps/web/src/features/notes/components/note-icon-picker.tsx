"use client";

import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { memo, useEffect, useState } from "react";

const NOTE_ICON_EMOJIS = [
	"📝",
	"📄",
	"📑",
	"📋",
	"📌",
	"📍",
	"🎯",
	"💡",
	"⭐",
	"🌟",
	"✨",
	"🔥",
	"💪",
	"🎨",
	"🎵",
	"🎶",
	"📚",
	"📖",
	"📕",
	"📗",
	"📘",
	"📙",
	"📓",
	"📔",
	"🗂️",
	"📁",
	"📂",
	"🗄️",
	"🔖",
	"🏷️",
	"💭",
	"🗨️",
	"❤️",
	"💙",
	"💚",
	"💛",
	"💜",
	"🧡",
	"🖤",
	"🤍",
	"🚀",
	"💻",
	"⚡",
	"🔧",
	"🛠️",
	"📊",
	"📈",
	"📉",
	"🎉",
	"🎊",
	"🏆",
	"🥇",
	"🎁",
	"🎈",
	"🔔",
	"📢",
	"🌱",
	"🌿",
	"🌳",
	"🌸",
	"🌺",
	"🌻",
	"🍀",
	"🌴",
	"⚽",
	"🏀",
	"🎮",
	"🎲",
	"♟️",
	"🎭",
	"🎪",
	"🎤",
	"☀️",
	"🌙",
	"⭐",
	"🌈",
	"🌊",
	"🔥",
	"❄️",
	"🌪️",
	"💼",
	"🏠",
	"🏢",
	"🏫",
	"✈️",
	"🚗",
	"🚢",
	"🚲",
	"💎",
	"👑",
	"🔑",
	"🛡️",
	"⚔️",
	"💰",
	"💳",
	"🪪",
];

const NOTE_ICON_KEYWORDS: Record<string, string[]> = {
	"📝": ["memo", "write", "note", "pencil"],
	"📄": ["page", "document", "file"],
	"📑": ["bookmark", "tabs", "document"],
	"📋": ["clipboard", "checklist", "todo"],
	"📌": ["pin", "pushpin", "mark"],
	"📍": ["pin", "location", "round pin"],
	"🎯": ["target", "goal", "bullseye", "focus"],
	"💡": ["idea", "bulb", "lightbulb", "insight"],
	"⭐": ["star", "favorite"],
	"🌟": ["star", "sparkle", "glow"],
	"✨": ["sparkles", "new", "magic"],
	"🔥": ["fire", "hot", "trending"],
	"💪": ["muscle", "strength", "flex"],
	"🎨": ["art", "palette", "design", "paint"],
	"🎵": ["music", "note", "song"],
	"🎶": ["music", "notes", "song"],
	"📚": ["books", "library", "study", "reading"],
	"📖": ["book", "open book", "reading"],
	"📕": ["book", "red book"],
	"📗": ["book", "green book"],
	"📘": ["book", "blue book"],
	"📙": ["book", "orange book"],
	"📓": ["notebook", "journal"],
	"📔": ["notebook", "diary"],
	"🗂️": ["folders", "card index", "archive"],
	"📁": ["folder", "directory"],
	"📂": ["folder", "open folder"],
	"🗄️": ["cabinet", "archive", "storage"],
	"🔖": ["bookmark", "tag"],
	"🏷️": ["tag", "label", "price"],
	"💭": ["thought", "bubble", "think"],
	"🗨️": ["speech", "chat", "bubble", "comment"],
	"❤️": ["heart", "love", "red"],
	"💙": ["heart", "love", "blue"],
	"💚": ["heart", "love", "green"],
	"💛": ["heart", "love", "yellow"],
	"💜": ["heart", "love", "purple"],
	"🧡": ["heart", "love", "orange"],
	"🖤": ["heart", "love", "black"],
	"🤍": ["heart", "love", "white"],
	"🚀": ["rocket", "launch", "ship it", "fast"],
	"💻": ["laptop", "computer", "code", "dev"],
	"⚡": ["lightning", "bolt", "fast", "energy"],
	"🔧": ["wrench", "fix", "tool", "settings"],
	"🛠️": ["tools", "build", "fix"],
	"📊": ["chart", "bar chart", "stats", "data"],
	"📈": ["chart", "growth", "trending up", "stats"],
	"📉": ["chart", "decline", "trending down", "stats"],
	"🎉": ["party", "celebration", "confetti"],
	"🎊": ["party", "confetti", "celebration"],
	"🏆": ["trophy", "win", "award", "champion"],
	"🥇": ["medal", "gold", "first place", "win"],
	"🎁": ["gift", "present", "box"],
	"🎈": ["balloon", "party"],
	"🔔": ["bell", "notification", "alert"],
	"📢": ["megaphone", "announcement", "loud"],
	"🌱": ["seedling", "plant", "growth", "sprout"],
	"🌿": ["herb", "leaf", "plant"],
	"🌳": ["tree", "nature", "plant"],
	"🌸": ["flower", "blossom", "cherry"],
	"🌺": ["flower", "hibiscus"],
	"🌻": ["flower", "sunflower"],
	"🍀": ["clover", "luck", "four leaf"],
	"🌴": ["palm tree", "tropical"],
	"⚽": ["soccer", "football", "sports"],
	"🏀": ["basketball", "sports"],
	"🎮": ["game", "controller", "gaming"],
	"🎲": ["dice", "game", "random"],
	"♟️": ["chess", "strategy", "pawn"],
	"🎭": ["theater", "drama", "masks"],
	"🎪": ["circus", "tent", "event"],
	"🎤": ["microphone", "sing", "speak"],
	"☀️": ["sun", "sunny", "weather"],
	"🌙": ["moon", "night", "sleep"],
	"🌈": ["rainbow", "colorful"],
	"🌊": ["wave", "ocean", "water"],
	"❄️": ["snowflake", "cold", "winter"],
	"🌪️": ["tornado", "storm", "chaos"],
	"💼": ["briefcase", "work", "business", "job"],
	"🏠": ["house", "home"],
	"🏢": ["building", "office", "company"],
	"🏫": ["school", "education"],
	"✈️": ["airplane", "flight", "travel"],
	"🚗": ["car", "drive", "vehicle"],
	"🚢": ["ship", "boat", "sail"],
	"🚲": ["bike", "bicycle"],
	"💎": ["gem", "diamond", "premium", "value"],
	"👑": ["crown", "king", "premium"],
	"🔑": ["key", "unlock", "access", "password"],
	"🛡️": ["shield", "security", "protect"],
	"⚔️": ["swords", "battle", "fight"],
	"💰": ["money", "bag", "finance", "cash"],
	"💳": ["card", "credit card", "payment"],
	"🪪": ["id", "identity", "card", "license"],
};

function matchesQuery(emoji: string, query: string) {
	if (!query) return true;
	const keywords = NOTE_ICON_KEYWORDS[emoji] ?? [];
	return keywords.some((keyword) => keyword.includes(query)) || emoji.includes(query);
}

type Props = {
	icon?: string;
	onIconChange: (icon: string) => void;
};

export const NoteIconPicker = memo(function NoteIconPicker({ icon, onIconChange }: Props) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const normalizedQuery = query.trim().toLowerCase();
	const filteredEmojis = NOTE_ICON_EMOJIS.filter((emoji) => matchesQuery(emoji, normalizedQuery));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={icon ? `Change note icon, currently ${icon}` : "Choose note icon"}
					onKeyDown={(event) => {
						if (event.key === "/") {
							event.preventDefault();
							setOpen(true);
						}
					}}
					className={cn(
						"flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors",
						icon
							? "hover:bg-accent"
							: "text-muted-foreground hover:bg-accent hover:text-foreground",
					)}
				>
					{icon || <Smile className="h-4 w-4" />}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[232px] p-2" align="start" side="bottom">
				<input
					type="search"
					aria-label="Search emoji"
					autoFocus
					value={query}
					placeholder="Search emoji..."
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "/") event.stopPropagation();
					}}
					className="mb-1.5 w-full rounded-md bg-accent px-2.5 py-1.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring/50"
				/>
				{filteredEmojis.length > 0 ? (
					<div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
						{filteredEmojis.map((emoji, index) => (
							<button
								key={`${emoji}-${index}`}
								type="button"
								aria-label={`Use ${emoji} as note icon`}
								onClick={() => {
									onIconChange(emoji);
									setOpen(false);
								}}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-md text-base transition-colors hover:bg-accent",
									icon === emoji && "bg-accent",
								)}
							>
								{emoji}
							</button>
						))}
					</div>
				) : (
					<p className="px-1.5 py-2 text-sm text-muted-foreground/60">No emoji found</p>
				)}
			</PopoverContent>
		</Popover>
	);
});
