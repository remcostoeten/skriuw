import type { ComponentType, SVGProps } from "react";
import {
  CalendarIcon,
  HashIcon,
  LinkIcon,
  ListIcon,
  ListTodoIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SquareCheckIcon,
  StarIcon,
  TypeIcon,
  UserIcon,
} from "@/shared/icons/static";
import type { NotePropertyType } from "./types";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export const TYPE_ICON: Readonly<Record<NotePropertyType, IconComponent>> = {
  text: TypeIcon,
  number: HashIcon,
  date: CalendarIcon,
  select: ListIcon,
  "multi-select": ListTodoIcon,
  person: UserIcon,
  url: LinkIcon,
  checkbox: SquareCheckIcon,
  rating: StarIcon,
  location: MapPinIcon,
  email: MailIcon,
  phone: PhoneIcon,
};
