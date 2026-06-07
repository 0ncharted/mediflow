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
      <div className="h-1 w-full rounded-full bg-[#fde68a] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#92400e] transition-all duration-1000"
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
      color: "text-[#065f46]",
      bg: "bg-[#f0fdf4] border-[#bbf7d0]",
      label: encryptingMessage,
      spin: false,
    },
    submitting: {
      Icon: Loader2,
      color: "text-[#92400e]",
      bg: "bg-[#fffbeb] border-[#fde68a]",
      label: submittingMessage,
      spin: true,
    },
    success: {
      Icon: CheckCircle,
      color: "text-[#065f46]",
      bg: "bg-[#e6f4ed] border-[#a7f3d0]",
      label: successMessage,
      spin: false,
    },
    error: {
      Icon: XCircle,
      color: "text-[#991b1b]",
      bg: "bg-[#fef2f2] border-[#fecaca]",
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
