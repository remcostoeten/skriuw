declare module "react-dom/server" {
  export function renderToStaticMarkup(element: import("react").ReactElement): string;
}
