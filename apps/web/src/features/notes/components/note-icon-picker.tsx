"use client";

import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { memo, useState } from "react";

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

type Props = {
	icon?: string;
	onIconChange: (icon: string) => void;
};

export const NoteIconPicker = memo(function NoteIconPicker({ icon, onIconChange }: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={icon ? `Change note icon, currently ${icon}` : "Choose note icon"}
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
			<PopoverContent className="w-[232px] p-2" align="start" side="right">
				<div className="grid grid-cols-8 gap-0.5">
					{NOTE_ICON_EMOJIS.map((emoji) => (
						<button
							key={emoji}
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
			</PopoverContent>
		</Popover>
	);
});
