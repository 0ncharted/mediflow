import { useState, useEffect, useCallback } from "react";
import { loadHistory, saveHistory, type TxEntry } from "@/lib/txHistory";

export function useTxHistory() {
  const [entries, setEntries] = useState<TxEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const addEntry = useCallback(
    (action: string, status: "success" | "error", txHash?: string) => {
      const entry: TxEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        action,
        status,
        txHash,
      };
      setEntries((prev) => {
        const updated = [entry, ...prev].slice(0, 50);
        saveHistory(updated);
        return updated;
      });
    },
    [],
  );

  const clearHistory = useCallback(() => {
    setEntries([]);
    saveHistory([]);
  }, []);

  return { entries, addEntry, clearHistory };
}
