import { useState, useEffect } from "react";
import { CheckCircle, Loader2, XCircle, Lock } from "lucide-react";

export type TxStatus = "idle" | "encrypting" | "submitting" | "success" | "error";

export function FheCountdown({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running && elapsed === 0) return null;

  const pct = Math.min((elapsed / 45) * 100, 100);

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-mono tabular-nums">
        FHE computation in progress: {elapsed}s / ~45s expected
      </p>
      <div className="h-1 w-full rounded-full bg-amber-500/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface TransactionToastProps {
  status: TxStatus;
  encryptingMessage?: string;
  submittingMessage?: string;
  successMessage?: string;
  errorMessage?: string | null;
  showFheTimer?: boolean;
}

export function TransactionToast({
  status,
  encryptingMessage = "Encrypting your data locally…",
  submittingMessage = "Submitting to Sepolia…",
  successMessage = "Transaction confirmed.",
  errorMessage,
  showFheTimer = false,
}: TransactionToastProps) {
  if (status === "idle") return null;

  const variants = {
    encrypting: {
      Icon: Lock,
      color: "text-primary",
      bg: "bg-primary/10 border-primary/30",
      label: encryptingMessage,
      spin: false,
    },
    submitting: {
      Icon: Loader2,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/30",
      label: submittingMessage,
      spin: true,
    },
    success: {
      Icon: CheckCircle,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/30",
      label: successMessage,
      spin: false,
    },
    error: {
      Icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10 border-destructive/30",
      label: errorMessage ?? "Transaction failed",
      spin: false,
    },
  } as const;

  const { Icon, color, bg, label, spin } = variants[status];

  return (
    <div className={`p-4 rounded-lg border ${bg}`}>
      <div className="flex items-start gap-3">
        <Icon
          className={`h-4 w-4 mt-0.5 shrink-0 ${color} ${spin ? "animate-spin" : ""}`}
        />
        <div className={`${color} flex-1 text-sm`}>
          <p>{label}</p>
          {showFheTimer && <FheCountdown running={status === "submitting"} />}
        </div>
      </div>
    </div>
  );
}
