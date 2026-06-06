import { ExternalLink, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TxEntry } from "@/lib/txHistory";

interface Props {
  entries: TxEntry[];
  onClear: () => void;
}

const ETHERSCAN = "https://sepolia.etherscan.io/tx/";

export function TxHistoryPanel({ entries, onClear }: Props) {
  return (
    <div className="rounded-xl bg-card border border-card-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground text-sm">Transaction History</h2>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground">({entries.length})</span>
          )}
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="gap-1.5 text-xs text-muted-foreground h-7"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No transactions yet in this session.
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/10 border border-border text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span>{e.status === "success" ? "✅" : "❌"}</span>
                <span className="text-foreground truncate">{e.action}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                {e.txHash && (
                  <a
                    href={`${ETHERSCAN}${e.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-mono"
                  >
                    {e.txHash.slice(0, 10)}…
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
