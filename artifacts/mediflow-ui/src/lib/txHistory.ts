export interface TxEntry {
  id: string;
  timestamp: number;
  action: string;
  status: "success" | "error";
  txHash?: string;
}

const KEY = "mediflow_tx_history";
const MAX = 50;

export function loadHistory(): TxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TxEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: TxEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {}
}
