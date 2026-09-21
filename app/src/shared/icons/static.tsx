import { selectGlyph, type GlyphGrid, type GlyphName } from "@skriuw/icons";
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

type GlyphProps = IconProps & {
  glyph: GlyphName;
  /** Pins one of Fluent's drawings instead of choosing by size. */
  grid?: GlyphGrid;
};

/**
 * Draws a Fluent Regular glyph from the shared icon data. Icons are decorative
 * unless the caller labels them, so they stay out of the accessibility tree by
 * default.
 */
export function FluentIcon({ glyph, grid, size = 16, ...props }: GlyphProps) {
  const drawing = selectGlyph(glyph, size, grid);
  const labelled = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${drawing.grid} ${drawing.grid}`}
      width={size}
      height={size}
      fill="currentColor"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      {...props}
    >
      <path d={drawing.d} />
    </svg>
  );
}

function glyphIcon(glyph: GlyphName) {
  function GlyphIcon(props: IconProps) {
    return <FluentIcon glyph={glyph} {...props} />;
  }
  GlyphIcon.displayName = `FluentIcon(${glyph})`;
  return GlyphIcon;
}

export const AppWindowIcon = glyphIcon("window");
export const AlignCenterIcon = glyphIcon("text_align_center");
export const AlignLeftIcon = glyphIcon("text_align_left");
export const AlignRightIcon = glyphIcon("text_align_right");
export const ArrowDownIcon = glyphIcon("arrow_down");
export const ArrowLeftIcon = glyphIcon("arrow_left");
export const ArrowRightIcon = glyphIcon("arrow_right");
export const ArrowUpDownIcon = glyphIcon("arrow_sort");
export const ArrowUpIcon = glyphIcon("arrow_up");
export const BarChartIcon = glyphIcon("data_bar_vertical");
export const BoldIcon = glyphIcon("text_bold");
export const CalendarDaysIcon = glyphIcon("calendar_ltr");
export const CalendarIcon = glyphIcon("calendar");
export const CaseSensitiveIcon = glyphIcon("text_case_title");
export const CheckIcon = glyphIcon("checkmark");
export const ChevronDownIcon = glyphIcon("chevron_down");
export const ChevronLeftIcon = glyphIcon("chevron_left");
export const ChevronRightIcon = glyphIcon("chevron_right");
export const CircleFilledIcon = glyphIcon("circle_filled");
export const CircleIcon = glyphIcon("circle");
export const ClockIcon = glyphIcon("clock");
export const CloseIcon = glyphIcon("dismiss");
export const CloudIcon = glyphIcon("cloud");
export const CloudOffIcon = glyphIcon("cloud_off");
export const CodeIcon = glyphIcon("code");
export const CommandIcon = glyphIcon("apps_list");
export const CopyIcon = glyphIcon("copy");
export const DatabaseIcon = glyphIcon("database");
export const DiagonalLineIcon = glyphIcon("line");
export const DownloadIcon = glyphIcon("arrow_download");
export const EnterFullscreenIcon = glyphIcon("full_screen_maximize");
export const EraserIcon = glyphIcon("eraser");
export const ExitFullscreenIcon = glyphIcon("full_screen_minimize");
export const ExternalLinkIcon = glyphIcon("open");
export const FileTextIcon = glyphIcon("document_text");
export const FilePlusIcon = glyphIcon("document_add");
export const FolderIcon = glyphIcon("folder");
export const FolderInputIcon = glyphIcon("folder_arrow_right");
export const FolderOpenIcon = glyphIcon("folder_open");
export const FolderPlusIcon = glyphIcon("folder_add");
export const FoldVerticalIcon = glyphIcon("arrow_minimize_vertical");
export const GripIcon = glyphIcon("re_order_dots_vertical");
export const HashIcon = glyphIcon("number_symbol");
export const Heading1Icon = glyphIcon("text_header_1");
export const Heading2Icon = glyphIcon("text_header_2");
export const Heading3Icon = glyphIcon("text_header_3");
export const Heading4Icon = glyphIcon("text_header_4");
export const Heading5Icon = glyphIcon("text_header_5");
export const Heading6Icon = glyphIcon("text_header_6");
export const HighlighterIcon = glyphIcon("highlight");
export const HistoryIcon = glyphIcon("history");
export const ImageIcon = glyphIcon("image");
export const InfoIcon = glyphIcon("info");
export const ItalicIcon = glyphIcon("text_italic");
export const KeyboardIcon = glyphIcon("keyboard");
export const LayoutDashboardIcon = glyphIcon("board");
export const LinkIcon = glyphIcon("link");
export const ListIcon = glyphIcon("text_bullet_list_ltr");
export const ListOrderedIcon = glyphIcon("text_number_list_ltr");
export const ListTodoIcon = glyphIcon("task_list_ltr");
export const LockIcon = glyphIcon("lock_closed");
export const LockOpenIcon = glyphIcon("lock_open");
export const LogOutIcon = glyphIcon("sign_out");
export const MailIcon = glyphIcon("mail");
export const MapPinIcon = glyphIcon("location");
export const MaximizeIcon = glyphIcon("maximize");
export const MessageSquareIcon = glyphIcon("comment");
export const MinusIcon = glyphIcon("subtract");
export const MoreHorizontalIcon = glyphIcon("more_horizontal");
export const MusicIcon = glyphIcon("music_note_2");
export const NewNoteIcon = glyphIcon("note_edit");
export const PaintBucketIcon = glyphIcon("paint_bucket");
export const PaletteIcon = glyphIcon("color");
export const PanelLeftIcon = glyphIcon("panel_left");
export const PanelRightIcon = glyphIcon("panel_right");
export const PaperclipIcon = glyphIcon("attach");
export const PauseIcon = glyphIcon("pause");
export const PencilIcon = glyphIcon("edit");
export const PhoneIcon = glyphIcon("call");
export const PictureInPictureEnterIcon = glyphIcon("picture_in_picture_enter");
export const PictureInPictureExitIcon = glyphIcon("picture_in_picture_exit");
export const PilcrowIcon = glyphIcon("text_paragraph");
export const PinFilledIcon = glyphIcon("pin_filled");
export const PinIcon = glyphIcon("pin");
export const PinOffIcon = glyphIcon("pin_off");
export const PlayIcon = glyphIcon("play");
export const PlusIcon = glyphIcon("add");
export const PointerIcon = glyphIcon("cursor");
export const RefreshIcon = glyphIcon("arrow_sync");
export const RegexIcon = glyphIcon("braces_variable");
export const RepeatIcon = glyphIcon("arrow_repeat_all");
export const ReplaceAllIcon = glyphIcon("arrow_repeat_all");
export const ReplaceIcon = glyphIcon("arrow_swap");
export const RestoreIcon = glyphIcon("square_multiple");
export const RotateCcwIcon = glyphIcon("arrow_counterclockwise");
export const SearchIcon = glyphIcon("search");
export const SettingsIcon = glyphIcon("settings");
export const ShareIcon = glyphIcon("share");
export const SmileIcon = glyphIcon("emoji");
export const SparklesIcon = glyphIcon("sparkle");
export const SplitViewCloseIcon = glyphIcon("dismiss_square");
export const SplitViewIcon = glyphIcon("split_vertical");
export const SplitViewStackedIcon = glyphIcon("split_horizontal");
export const SquareCheckIcon = glyphIcon("checkbox_checked");
export const SquareCodeIcon = glyphIcon("code_block");
export const SquareIcon = glyphIcon("square");
export const StarIcon = glyphIcon("star");
export const StrikethroughIcon = glyphIcon("text_strikethrough");
export const TableIcon = glyphIcon("table");
export const TagsIcon = glyphIcon("tag");
export const TextQuoteIcon = glyphIcon("text_quote");
export const Trash2Icon = glyphIcon("delete");
export const TypeIcon = glyphIcon("text_font");
export const Undo2Icon = glyphIcon("arrow_undo");
export const UnfoldVerticalIcon = glyphIcon("arrow_maximize_vertical");
export const UnlinkIcon = glyphIcon("link_dismiss");
export const UploadIcon = glyphIcon("arrow_upload");
export const UserIcon = glyphIcon("person");
export const UsersIcon = glyphIcon("people");
export const VideoIcon = glyphIcon("video");
export const VolumeIcon = glyphIcon("speaker_2");
export const VolumeOffIcon = glyphIcon("speaker_mute");
export const WarningIcon = glyphIcon("warning");
export const WaypointsIcon = glyphIcon("flowchart");
export const WholeWordIcon = glyphIcon("text_whole_word");
export const ZoomInIcon = glyphIcon("zoom_in");
export const ZoomOutIcon = glyphIcon("zoom_out");

/** The brand mark: three bars on a 40-unit grid. Not a Fluent glyph. */
export function SkriuwLogo({ size = 26, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      {...props}
    >
      <rect x="4" y="8" width="8" height="24" rx="1" />
      <rect x="16" y="4" width="8" height="32" rx="1" />
      <rect x="28" y="12" width="8" height="16" rx="1" />
    </svg>
  );
}
