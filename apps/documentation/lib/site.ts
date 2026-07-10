export const site = {
	description:
		"Official Skriuw documentation for notes, journaling, self-hosting, desktop, and development.",
	name: "Skriuw Documentation",
	url: "https://docs.skriuw.com",
};

export function absoluteUrl(path = "/") {
	return new URL(path, site.url).toString();
}
