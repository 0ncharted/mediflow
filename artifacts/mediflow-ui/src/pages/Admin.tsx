import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { RESEARCH_REGISTRY_ADDRESS, RESEARCH_REGISTRY_ABI, CONTRACTS_DEPLOYED } from "@/lib/contracts";
import { TransactionToast, type TxStatus } from "@/components/TransactionToast";
import { TxHistoryPanel } from "@/components/TxHistoryPanel";
import { useTxHistory } from "@/hooks/useTxHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings,
  CheckCircle,
  Shield,
  AlertTriangle,
  Loader2,
  Building2,
  Clock,
} from "lucide-react";

interface Institution {
  address: string;
  name: string;
  purpose: string;
  approved: boolean;
  queryCount: number;
  addedAt: string;
}

const SEEDED_INSTITUTION: Institution = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  name: "Mayo Clinic Research Division",
  purpose: "Aggregate diabetes prevalence and risk score studies",
  approved: true,
  queryCount: 2,
  addedAt: "Seeded via scripts/seed.ts",
};

interface TxLogEntry {
  label: string;
  hash: string;
  timestamp: string;
  status: "success" | "pending";
}

export default function Admin() {
  const { address, isConnected } = useAccount();
  const { entries, addEntry, clearHistory } = useTxHistory();

  const [instAddress, setInstAddress] = useState("");
  const [instName, setInstName] = useState("");
  const [instPurpose, setInstPurpose] = useState("");
  const [approveTxStatus, setApproveTxStatus] = useState<TxStatus>("idle");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([SEEDED_INSTITUTION]);
  const [txLog, setTxLog] = useState<TxLogEntry[]>([]);

  const {
    writeContract: approveInstitution,
    data: approveHash,
    isPending: approvePending,
    error: approveWriteError,
  } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    if (approveSuccess && approveHash) {
      setApproveTxStatus("success");
      setInstitutions((prev) => [
        ...prev,
        {
          address: instAddress,
          name: instName,
          purpose: instPurpose,
          approved: true,
          queryCount: 0,
          addedAt: new Date().toLocaleDateString(),
        },
      ]);
      setTxLog((prev) => [
        {
          label: `Approved institution: ${instName || instAddress.slice(0, 10)}…`,
          hash: approveHash,
          timestamp: new Date().toLocaleTimeString(),
          status: "success",
        },
        ...prev,
      ]);
      addEntry("Approve Institution", "success", approveHash);
      setInstAddress("");
      setInstName("");
      setInstPurpose("");
    }
    if (approveWriteError) {
      setApproveTxStatus("error");
      setApproveError(approveWriteError.message.slice(0, 200));
      addEntry("Approve Institution", "error");
    }
  }, [approveSuccess, approveHash, approveWriteError, instAddress, instName, instPurpose, addEntry]);

  const handleApprove = () => {
    if (!instAddress.startsWith("0x") || !instName.trim()) return;
    setApproveTxStatus("submitting");
    setApproveError(null);
    approveInstitution({
      address: RESEARCH_REGISTRY_ADDRESS,
      abi: RESEARCH_REGISTRY_ABI,
      functionName: "approveInstitution",
      args: [instAddress as `0x${string}`, instName, instPurpose],
    });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Registry Owner Only
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Approve or revoke research institutions, view registered protocols, and inspect the
            transaction log. All write actions require the registry owner wallet.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {!isConnected && (
          <div className="flex items-center justify-between p-5 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">Connect wallet to manage the registry</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Contracts not yet deployed. Seeded institution shown for reference.
            </span>
          </div>
        )}

        {isConnected && address && (
          <div className="px-4 py-2.5 rounded-lg bg-card border border-card-border text-xs">
            <span className="text-muted-foreground">Connected as </span>
            <span className="font-mono text-foreground">{address}</span>
            <span className="ml-2 text-amber-400/80">
              (Write actions will fail if not registry owner)
            </span>
          </div>
        )}

        {/* Approve Institution */}
        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Approve Research Institution</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">
              approveInstitution(address, name, purpose)
            </code>
            . Only the registry owner can call this. Once approved, the institution can
            register cohorts and run aggregate queries.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Institution Wallet Address
              </label>
              <Input
                placeholder="0x…"
                value={instAddress}
                onChange={(e) => setInstAddress(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Institution Name
                </label>
                <Input
                  placeholder="e.g. Mayo Clinic Research Division"
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Research Purpose
                </label>
                <Input
                  placeholder="e.g. Aggregate diabetes prevalence studies"
                  value={instPurpose}
                  onChange={(e) => setInstPurpose(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <TransactionToast
              status={approveTxStatus}
              submittingMessage="Approving institution on-chain…"
              successMessage="✅ Institution approved. They can now register cohorts."
              errorMessage={approveError}
            />
            <Button
              onClick={handleApprove}
              disabled={
                !isConnected ||
                !instAddress.startsWith("0x") ||
                !instName.trim() ||
                approvePending ||
                !CONTRACTS_DEPLOYED
              }
              className="gap-2"
            >
              {approvePending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</>
              ) : (
                <><Shield className="h-4 w-4" /> Approve Institution</>
              )}
            </Button>
          </div>
        </div>

        {/* Institutions List */}
        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">
              Registered Institutions ({institutions.length})
            </h2>
          </div>

          <div className="space-y-3">
            {institutions.map((inst) => (
              <div
                key={inst.address}
                className="rounded-lg border border-border bg-muted/10 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{inst.name}</span>
                      {inst.approved && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle className="h-3 w-3" /> Approved
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground">{inst.address}</p>
                    <p className="text-xs text-muted-foreground mt-1">{inst.purpose}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      {inst.queryCount} queries
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{inst.addedAt}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground mt-1"
                      disabled
                      title="Revocation coming in v2"
                    >
                      Revoke (post-MVP)
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction Log */}
        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Transaction Log</h2>
          </div>

          {txLog.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              No transactions yet in this session. Approve an institution to see entries here.
            </div>
          ) : (
            <div className="space-y-2">
              {txLog.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/10 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    <div>
                      <p className="text-xs text-foreground">{entry.label}</p>
                      <p className="text-xs font-mono text-muted-foreground/60">
                        {entry.hash.slice(0, 18)}…
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {entry.timestamp}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fix 3 — Transaction History */}
        <TxHistoryPanel entries={entries} onClear={clearHistory} />
      </div>
    </div>
  );
}
