import {
	AlignLeft,
	AtSign,
	Calendar,
	CheckSquare,
	CircleDot,
	Hash,
	Link2,
	List,
	MapPin,
	Phone,
	Star,
	User,
	type LucideIcon,
} from "lucide-react";
import type { NotePropertyType } from "@/domain/notes/properties";

export const TYPE_ICON: Record<NotePropertyType, LucideIcon> = {
	text: AlignLeft,
	number: Hash,
	date: Calendar,
	select: CircleDot,
	"multi-select": List,
	person: User,
	url: Link2,
	checkbox: CheckSquare,
	rating: Star,
	location: MapPin,
	email: AtSign,
	phone: Phone,
};
