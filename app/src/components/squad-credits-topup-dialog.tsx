import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
} from "@squad/core";
import { useSquadCreditsStore } from "../stores/squad-credits";

interface TierDef {
  amount: number;
  label: string;
  price: string;
}

const TIERS: TierDef[] = [
  { amount: 100, label: "topup.tier100label", price: "topup.tier100price" },
  { amount: 500, label: "topup.tier500label", price: "topup.tier500price" },
  { amount: 2000, label: "topup.tier2000label", price: "topup.tier2000price" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "pick" | "pay" | "success";

export function SquadCreditsTopUpDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("providers");
  const topUp = useSquadCreditsStore((s) => s.topUp);

  const [selectedIdx, setSelectedIdx] = useState(1);
  const [step, setStep] = useState<Step>("pick");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [paying, setPaying] = useState(false);

  const selected = TIERS[selectedIdx];

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("pick");
      setCardNumber("");
      setExpiry("");
      setCvc("");
    }, 300);
  };

  const handlePay = async () => {
    setPaying(true);
    await new Promise<void>((r) => setTimeout(r, 1400));
    await topUp(selected.amount);
    setPaying(false);
    setStep("success");
  };

  const formatCard = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
  };

  const canPay =
    cardNumber.replace(/\s/g, "").length === 16 &&
    expiry.replace(/\s/g, "").replace("/", "").length === 4 &&
    cvc.length >= 3;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {step === "success" ? t("topup.success") : t("topup.title")}
          </DialogTitle>
        </DialogHeader>

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#00a240]/10">
              <Check className="size-6 text-[#00a240]" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t("topup.successBody", { count: selected.amount })}
            </p>
            <Button className="rounded-full" onClick={handleClose}>
              {t("topup.close")}
            </Button>
          </div>
        )}

        {step === "pick" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("topup.subtitle")}</p>
            <div className="flex flex-col gap-2">
              {TIERS.map((tier, idx) => (
                <button
                  key={tier.amount}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={cn(
                    "flex items-center justify-between rounded-xl border bg-background p-4 text-left transition-all",
                    "border-black/5 hover:border-black/15 hover:shadow-[0_1px_0_rgba(0,0,0,0.05)]",
                    selectedIdx === idx && "border-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">
                    {t(tier.label as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {t(tier.price as Parameters<typeof t>[0])}
                  </p>
                </button>
              ))}
            </div>
            <Button
              className="rounded-full mt-1"
              onClick={() => setStep("pay")}
            >
              {t("topup.pay", { price: t(selected.price as Parameters<typeof t>[0]) })}
            </Button>
          </div>
        )}

        {step === "pay" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t(selected.label as Parameters<typeof t>[0])} {" · "} {t(selected.price as Parameters<typeof t>[0])}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {t("topup.cardNumber")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCard(e.target.value))}
                  className="h-9 rounded-lg border border-black/10 bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t("topup.expiry")}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM / YY"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    className="h-9 rounded-lg border border-black/10 bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t("topup.cvc")}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="123"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="h-9 rounded-lg border border-black/10 bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  />
                </div>
              </div>
            </div>
            <Button
              className="rounded-full"
              disabled={paying || !canPay}
              onClick={() => void handlePay()}
            >
              {paying && <Loader2 className="size-4 animate-spin" />}
              {t("topup.pay", { price: t(selected.price as Parameters<typeof t>[0]) })}
            </Button>
            <button
              type="button"
              className="self-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setStep("pick")}
            >
              {t("topup.back")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
