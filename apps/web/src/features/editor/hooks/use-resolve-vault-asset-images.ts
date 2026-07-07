import { useEffect } from "react";
import { VAULT_ASSET_PREFIX, resolveVaultAssetUrl } from "@/features/notes/lib/note-cover-image";

/**
 * Swaps `<img src="vault-asset:...">` elements inside the editor for a
 * resolved `blob:` URL. Desktop-only: uploaded editor images are stored on
 * disk and referenced by a `vault-asset:` scheme the browser can't fetch
 * directly (unlike the web backend's plain Blob URLs), so every such `<img>`
 * needs its `src` patched after BlockNote renders it from document content.
 */
export function useResolveVaultAssetImages(editorDom: HTMLElement | null) {
	useEffect(() => {
		if (!editorDom) return;

		function resolveWithin(root: ParentNode) {
			const images =
				root instanceof Element && root.matches(`img[src^="${VAULT_ASSET_PREFIX}"]`)
					? [root as HTMLImageElement]
					: Array.from(
							root.querySelectorAll<HTMLImageElement>(
								`img[src^="${VAULT_ASSET_PREFIX}"]`,
							),
						);

			for (const img of images) {
				const cover = img.getAttribute("src");
				if (!cover) continue;
				const result = resolveVaultAssetUrl(cover);
				if (typeof result === "string") {
					if (result) img.src = result;
					continue;
				}
				result.then((url) => {
					if (url) img.src = url;
				});
			}
		}

		resolveWithin(editorDom);

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node instanceof Element) resolveWithin(node);
				}
			}
		});
		observer.observe(editorDom, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [editorDom]);
}
