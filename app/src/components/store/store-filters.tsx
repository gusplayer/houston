import { useTranslation } from "react-i18next";
import {
  Briefcase,
  Filter as FilterIcon,
  Megaphone,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@houston-ai/core";

export type StoreSourceFilter = "all" | "official" | "community";
export type StorePricingFilter = "all" | "free" | "paid";
export type StoreSort = "trending" | "newest" | "installs" | "rating";
export type StoreCategory = "all" | "business" | "marketing" | "operations" | "people";

interface Props {
  source: StoreSourceFilter;
  onSourceChange: (s: StoreSourceFilter) => void;
  pricing: StorePricingFilter;
  onPricingChange: (p: StorePricingFilter) => void;
  category: StoreCategory;
  onCategoryChange: (c: StoreCategory) => void;
  sort: StoreSort;
  onSortChange: (s: StoreSort) => void;
}

const CATEGORY_ICONS: Record<StoreCategory, React.ReactNode> = {
  all: <FilterIcon className="size-4" />,
  business: <Briefcase className="size-4" />,
  marketing: <Megaphone className="size-4" />,
  operations: <SettingsIcon className="size-4" />,
  people: <Users className="size-4" />,
};

export function StoreFilters(props: Props) {
  const { t } = useTranslation("store");

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-6 pr-2 md:flex">
      <Group label={t("filters.categories.all")}>
        {(["all", "business", "marketing", "operations", "people"] as const).map(
          (c) => (
            <FilterRow
              key={c}
              active={props.category === c}
              icon={CATEGORY_ICONS[c]}
              label={t(`filters.categories.${c}`)}
              onClick={() => props.onCategoryChange(c)}
            />
          ),
        )}
      </Group>

      <Group label={t("filters.official")}>
        {(["all", "official", "community"] as const).map((s) => (
          <FilterRow
            key={s}
            active={props.source === s}
            icon={<Sparkles className="size-4" />}
            label={t(`filters.${s}`)}
            onClick={() => props.onSourceChange(s)}
          />
        ))}
      </Group>

      <Group label={t("filters.free")}>
        {(["all", "free", "paid"] as const).map((p) => (
          <FilterRow
            key={p}
            active={props.pricing === p}
            icon={<FilterIcon className="size-4" />}
            label={t(`filters.${p}`)}
            onClick={() => props.onPricingChange(p)}
          />
        ))}
      </Group>

      <Group label={t("filters.sort.label")}>
        <Select value={props.sort} onValueChange={(v) => props.onSortChange(v as StoreSort)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">{t("filters.sort.trending")}</SelectItem>
            <SelectItem value="newest">{t("filters.sort.newest")}</SelectItem>
            <SelectItem value="installs">{t("filters.sort.installs")}</SelectItem>
            <SelectItem value="rating">{t("filters.sort.rating")}</SelectItem>
          </SelectContent>
        </Select>
      </Group>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function FilterRow({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-8 w-full justify-start gap-2 px-2 text-sm font-normal",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );
}
