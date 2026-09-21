export function setupDOMStub(): void {
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = {
      innerWidth: 1000,
      innerHeight: 800,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  if (typeof globalThis.document !== "undefined") return;

  function createElement(tagName: string): any {
    const children: any[] = [];
    const attributes: Record<string, string> = {};
    const classListSet = new Set<string>();

    const element: any = {
      tagName: tagName.toUpperCase(),
      className: "",
      style: {},
      dataset: {},
      children,
      parentElement: null,
      ownerDocument: null,
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      getAttribute: (k: string) => attributes[k] ?? null,
      removeAttribute: (k: string) => {
        delete attributes[k];
      },
      classList: {
        add: (c: string) => classListSet.add(c),
        remove: (c: string) => classListSet.delete(c),
        toggle: (c: string, flag?: boolean) => {
          if (flag === undefined) {
            classListSet.has(c) ? classListSet.delete(c) : classListSet.add(c);
          } else if (flag) {
            classListSet.add(c);
          } else {
            classListSet.delete(c);
          }
        },
      },
      appendChild: (child: any) => {
        child.parentElement = element;
        children.push(child);
        return child;
      },
      append: (...nodes: any[]) => {
        for (const n of nodes) {
          if (typeof n === "string") {
            children.push({ textContent: n });
          } else {
            if (n) n.parentElement = element;
            children.push(n);
          }
        }
      },
      replaceChildren: (...nodes: any[]) => {
        children.length = 0;
        if (nodes.length > 0) element.append(...nodes);
      },
      remove: () => {
        if (element.parentElement) {
          const idx = element.parentElement.children.indexOf(element);
          if (idx !== -1) element.parentElement.children.splice(idx, 1);
        }
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 10, top: 10, right: 50, bottom: 30, width: 40, height: 20 }),
    };
    element.ownerDocument = (globalThis as any).document;
    return element;
  }

  const docStub: any = {
    createElement,
    body: null,
    createTextNode: (text: string) => ({ textContent: text }),
    querySelector: () => null,
  };
  (globalThis as any).document = docStub;
  docStub.body = createElement("body");
}
