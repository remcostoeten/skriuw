const OPEN_SEARCH_EVENT = "skriuw:sidebar-search-open";

let pending = false;

/**
 * @name requestSidebarSearch
 * @description Asks the notes sidebar to open its search field and focus it.
 * The request is kept until a sidebar picks it up, so it also works when the
 * sidebar is still opening.
 *
 * @example
 * openSidebar();
 * requestSidebarSearch();
 */
export function requestSidebarSearch(): void {
  pending = true;
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

/**
 * @name onSidebarSearchRequest
 * @description Subscribes the sidebar to search requests and returns the
 * unsubscribe function. A request made before the sidebar mounted is delivered
 * right away.
 *
 * @example
 * useEffect(() => onSidebarSearchRequest(openSearch), []);
 */
export function onSidebarSearchRequest(listener: () => void): () => void {
  function handle(): void {
    pending = false;
    listener();
  }
  window.addEventListener(OPEN_SEARCH_EVENT, handle);
  if (pending) {
    handle();
  }
  return () => window.removeEventListener(OPEN_SEARCH_EVENT, handle);
}
