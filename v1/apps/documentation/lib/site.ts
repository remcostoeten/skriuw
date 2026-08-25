export const site = {
	description:
		"Official documentation for the current Skriuw local-first app and the frozen Skriuw v1 release.",
	name: "Skriuw Documentation",
	url: "https://docs.skriuw.com",
};

export function absoluteUrl(path = "/") {
	return new URL(path, site.url).toString();
}
