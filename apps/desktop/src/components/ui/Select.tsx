import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "@/components/ui/cx";

type SelectChangeEvent = {
  target: {
    value: string;
    name?: string;
    id?: string;
  };
  currentTarget: {
    value: string;
    name?: string;
    id?: string;
  };
};

type SelectOption = {
  value: string;
  label: ReactNode;
  disabled: boolean;
  groupLabel?: ReactNode;
};

type SelectProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> & {
  children: ReactNode;
  value?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  disabled?: boolean;
  tabIndex?: number;
  id?: string;
  name?: string;
  "aria-label"?: string;
};

function parseOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === "option") {
      options.push({
        value: String(child.props.value ?? ""),
        label: child.props.children,
        disabled: Boolean(child.props.disabled),
      });
      return;
    }

    if (child.type !== "optgroup") return;

    const groupLabel = child.props.label as ReactNode;
    Children.forEach(child.props.children, (groupChild) => {
      if (!isValidElement(groupChild) || groupChild.type !== "option") return;
      options.push({
        value: String(groupChild.props.value ?? ""),
        label: groupChild.props.children,
        disabled: Boolean(groupChild.props.disabled),
        groupLabel,
      });
    });
  });

  return options;
}

function findFirstEnabledIndex(options: SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function findLastEnabledIndex(options: SelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

function findNextEnabledIndex(options: SelectOption[], startIndex: number, step: 1 | -1) {
  if (options.length === 0) return -1;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (startIndex + step * offset + options.length) % options.length;
    if (!options[candidate].disabled) return candidate;
  }

  return -1;
}

export function Select({
  children,
  className,
  value,
  onChange,
  disabled = false,
  tabIndex,
  id,
  name,
  "aria-label": ariaLabel,
  ...containerProps
}: SelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const selectedValue = value == null ? "" : String(value);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === selectedValue), [options, selectedValue]);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() => (selectedIndex >= 0 ? selectedIndex : findFirstEnabledIndex(options)));

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
      setHighlightedIndex(selectedIndex);
      return;
    }

    setHighlightedIndex(findFirstEnabledIndex(options));
  }, [options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const commitValue = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;

    setOpen(false);
    setHighlightedIndex(index);

    if (option.value === selectedValue) return;

    const event: SelectChangeEvent = {
      target: {
        value: option.value,
        name,
        id,
      },
      currentTarget: {
        value: option.value,
        name,
        id,
      },
    };

    onChange?.(event);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : findFirstEnabledIndex(options));
        return;
      }
      setHighlightedIndex((current) => findNextEnabledIndex(options, current >= 0 ? current : 0, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : findLastEnabledIndex(options));
        return;
      }
      setHighlightedIndex((current) => findNextEnabledIndex(options, current >= 0 ? current : 0, -1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (highlightedIndex >= 0) {
        commitValue(highlightedIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  let previousGroupLabel: ReactNode | undefined;

  return (
    <div {...containerProps} ref={rootRef} className={cx("uiSelect", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        className={cx("uiSelectTrigger", open && "is-open")}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        tabIndex={tabIndex}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        <span className="uiSelectTriggerLabel">{selectedOption?.label ?? ""}</span>
        <span className="uiSelectCaret" aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div id={listboxId} role="listbox" tabIndex={-1} className="uiSelectPanel">
          {options.map((option, index) => {
            const showGroupLabel = option.groupLabel != null && option.groupLabel !== previousGroupLabel;
            previousGroupLabel = option.groupLabel;

            return (
              <div key={`${option.value}-${index}`}>
                {showGroupLabel ? <div className="uiSelectGroupLabel">{option.groupLabel}</div> : null}
                <div
                  role="option"
                  aria-selected={option.value === selectedValue}
                  tabIndex={0}
                  className={cx(
                    "uiSelectOption",
                    option.value === selectedValue && "is-selected",
                    index === highlightedIndex && "is-highlighted",
                    option.disabled && "is-disabled"
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => commitValue(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      commitValue(index);
                    }
                  }}
                >
                  {option.label}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
