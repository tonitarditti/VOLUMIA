import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";

export type TabOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type TabsProps<T extends string> = {
  value: T;
  options: Array<TabOption<T>>;
  onChange: (next: T) => void;
  className?: string;
  ariaLabel?: string;
};

export function Tabs<T extends string>({ value, options, onChange, className, ariaLabel }: TabsProps<T>) {
  return (
    <div className={cx("uiTabs", className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <Toggle
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          active={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Toggle>
      ))}
    </div>
  );
}
