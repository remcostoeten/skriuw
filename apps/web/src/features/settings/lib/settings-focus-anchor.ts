/**
 * Shared contract between the settings command index (which deep-links to a
 * specific control) and the settings page (which scrolls + flashes it). A
 * `focusId` like `"theme"` becomes the DOM id `"settings-focus-theme"`.
 */

const SETTINGS_FOCUS_PARAM = "focus";

const FLASH_CLASS = "settings-focus-flash";
const FLASH_DURATION_MS = 1600;

export function settingsFocusDomId(focusId: string): string {
	return `settings-focus-${focusId}`;
}

type SettingsAnchorProps = {
	id: string;
	className: string;
	"data-settings-focus": string;
};

/**
 * Spread onto any settings container to make it a deep-link target. Adds scroll
 * margin so the flashed control isn't glued to the top edge on arrival.
 */
export function settingsAnchorProps(focusId: string): SettingsAnchorProps {
	return {
		id: settingsFocusDomId(focusId),
		className: "scroll-mt-24",
		"data-settings-focus": focusId,
	};
}

/**
 * Scrolls the anchored control into view and pulses a highlight ring. Returns
 * `false` when the target isn't mounted yet so the caller can retry after the
 * section renders.
 */
export function flashSettingsFocus(focusId: string): boolean {
	if (typeof document === "undefined") return false;
	const element = document.getElementById(settingsFocusDomId(focusId));
	if (!element) return false;

	element.scrollIntoView({ behavior: "smooth", block: "center" });
	element.classList.remove(FLASH_CLASS);
	// Force reflow so re-adding the class restarts the animation on repeat visits.
	void element.offsetWidth;
	element.classList.add(FLASH_CLASS);

	const focusable = element.matches("button, input, select, textarea, [tabindex]")
		? element
		: element.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]");
	focusable?.focus({ preventScroll: true });

	window.setTimeout(() => element.classList.remove(FLASH_CLASS), FLASH_DURATION_MS);
	return true;
}
