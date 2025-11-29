import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import {
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import {
  ComponentRef,
  FC,
  Fragment,
  ReactNode,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
} from "react";

export type FetchCommandDataSubItems = (_props: {
  search: string;
}) => Promise<CommandDataItem[]>;

export interface CommandDataItem {
  label: ReactNode;
  value: string;
  loadItems?: FetchCommandDataSubItems;
  loadOneItem?: (_key: string) => Promise<CommandDataItem>;
  onSelect?: () => void;
  icon?: ReactNode;
  searchPlaceholder?: string;
}

export interface CommandHistoryItem {
  list?: string[];
  isLoading?: boolean;
  fetch_type: "list" | "one";
}

const MemoizedCommandItem = memo(CommandItem);

export const DataCommand: FC<{ items: CommandDataItem[]; onClose?: () => void; defaultPath?: string[] }> = memo(({ items, onClose, defaultPath = [] }) => {
  const listRef = useRef<ComponentRef<typeof CommandList> | null>(null);
  const [commandChainKeys, setCommandChainKeys] =
    useState<string[]>(defaultPath);
  const [search, setSearch] = useState("");

  const fetching = useRef(new Map<string, boolean | undefined>());
  const [commandHistory, setCommandHistory] = useState<
    Record<string, CommandHistoryItem | undefined>
  >({});

  const appendCommandHistory = ({
    key,
    value,
  }: {
    key: string;
    value: CommandHistoryItem;
  }) => {
    fetching.current.set(key, !!value.isLoading);
    setCommandHistory((prev) => ({ ...prev, [key]: value }));
  };

  const commandKeyToItemMap = useRef(
    new Map<string, CommandDataItem | undefined>()
  );

  const addCommandItemToMap = (itemKey: string, item: CommandDataItem) => {
    commandKeyToItemMap.current.set(itemKey, item);
    return itemKey;
  };

  const addComandItemsToMap = (
    chainKey: string,
    commandItems: CommandDataItem[]
  ) =>
    commandItems.map((item) =>
      addCommandItemToMap([chainKey, item.value].join("."), item)
    );

  const refinedChain = useMemo(
    () =>
      commandChainKeys.reduce(
        (acc, curr, idx, arr) => {
          const prevKey = acc.chain.map((i) => i?.value).join(".");
          const chainKey = [prevKey, curr].filter(Boolean).join(".");

          const currentItem =
            acc.list.find((i) => i?.value === curr) ||
            commandKeyToItemMap.current.get(chainKey);

          const lastItem = acc.chain.at(-1);

          if (!currentItem) {
            if (
              lastItem?.loadOneItem &&
              !commandHistory[prevKey] &&
              !fetching.current.get(prevKey)
            ) {
              appendCommandHistory({
                key: prevKey,
                value: { isLoading: true, fetch_type: "one" },
              });

              lastItem
                .loadOneItem(curr)
                .then((item) => {
                  const address = addCommandItemToMap(chainKey, item);
                  appendCommandHistory({
                    key: prevKey,
                    value: {
                      list: [address],
                      isLoading: false,
                      fetch_type: "one",
                    },
                  });
                })
                .catch(() => {
                  appendCommandHistory({
                    key: prevKey,
                    value: { isLoading: false, fetch_type: "one" },
                  });
                });
            }

            return {
              ...acc,
              chain: [
                ...acc.chain,
                {
                  label: <Loader2 className="animate-spin" />,
                  value: curr,
                } as CommandDataItem,
              ],
              list: [],
            };
          }

          addCommandItemToMap(chainKey, currentItem);

          const isLastItem = idx === arr.length - 1;
          const key = isLastItem
            ? [chainKey, search].filter(Boolean).join(":")
            : chainKey;

          if (
            currentItem.loadItems &&
            !(commandHistory[key]?.fetch_type === "list") &&
            !fetching.current.get(key) &&
            (isLastItem || !currentItem.loadOneItem)
          ) {
            appendCommandHistory({
              key,
              value: { isLoading: true, fetch_type: "list" },
            });

            currentItem
              .loadItems({ search })
              .then((children) => {
                const childAddresses = addComandItemsToMap(chainKey, children);
                appendCommandHistory({
                  key,
                  value: {
                    list: childAddresses,
                    isLoading: false,
                    fetch_type: "list",
                  },
                });
              })
              .catch(() => {
                appendCommandHistory({
                  key,
                  value: { isLoading: false, fetch_type: "list" },
                });
              });
          }

          return {
            chain: [...acc.chain, currentItem],
            list:
              commandHistory[key]?.list?.map((childKey) =>
                commandKeyToItemMap.current.get(childKey)
              ) ?? [],
            isLoading: !!commandHistory[key]?.isLoading,
          };
        },
        {
          chain: [] as CommandDataItem[],
          list: items as (CommandDataItem | undefined)[],
          isLoading: false,
        }
      ),
    [commandChainKeys, commandHistory, search, items]
  );

  const handleTab = useCallback((item: CommandDataItem) => {
    setCommandChainKeys((prev) => [...prev, item.value]);
    setSearch("");
  }, []);

  const currentContext = refinedChain.chain.at(-1);
  const showBreadcrumb = refinedChain.chain.length > 0;

  return (
    <Command
      shouldFilter={refinedChain.chain.length === 0}
      onKeyDown={(e) => {
        const currentFocusName = listRef.current?.querySelector(
          '[aria-selected="true"]'
        )?.getAttribute("data-value");
        const currentFocus = refinedChain.list.find(
          (i) => i?.value === currentFocusName
        );

        if (e.key === "Tab" && currentFocus?.loadItems) {
          e.preventDefault();
          handleTab(currentFocus);
        }

        if (e.key === "Backspace" && !search) {
          e.preventDefault();
          setCommandChainKeys((p) => p.slice(0, p.length - 1));
        }

        if (e.key === "Enter" && !search && !currentFocus) {
          e.preventDefault();
          const lastItem = refinedChain.chain.at(-1);
          if (lastItem?.onSelect) {
            lastItem.onSelect();
            onClose?.();
          }
        }
      }}
    >
      {showBreadcrumb && (
        <div className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground border-b">
          {refinedChain.chain.map((i, idx) => (
            <Fragment key={i.value}>
              <button
                onClick={() =>
                  setCommandChainKeys((prev) => prev.slice(0, idx + 1))
                }
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {i.icon}
                <span>{i.label}</span>
              </button>
              {idx < refinedChain.chain.length - 1 && (
                <ChevronRight className="size-3" />
              )}
            </Fragment>
          ))}
        </div>
      )}
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={
          currentContext?.searchPlaceholder ?? "Search..."
        }
      />
      <CommandList ref={listRef}>
        {refinedChain.list.map(
          (item) =>
            item && (
              <MemoizedCommandItem
                key={item.value}
                onSelect={() => {
                  if (item.loadItems) {
                    handleTab(item);
                  } else if (item.onSelect) {
                    item.onSelect();
                    onClose?.();
                  }
                }}
                value={item.value}
                className="cursor-pointer"
              >
                {item.icon && (
                  <span className="mr-2 flex-shrink-0">{item.icon}</span>
                )}
                <span className="flex-1">
                  {typeof item.label === 'string'
                    ? item.label
                    : typeof item.label === 'object' && item.label !== null
                      ? Object.prototype.toString.call(item.label) === '[object Object]'
                        ? JSON.stringify(item.label)
                        : item.label
                      : String(item.label || '')
                  }
                </span>
                {item.loadItems && (
                  <ChevronRight className="ml-2 size-4 text-muted-foreground" />
                )}
              </MemoizedCommandItem>
            )
        )}
      </CommandList>
      {refinedChain.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="animate-spin size-5 text-muted-foreground" />
        </div>
      ) : (
        <CommandEmpty>No results found.</CommandEmpty>
      )}
    </Command>
  );
});

