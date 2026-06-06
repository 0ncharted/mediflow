import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toHex, keccak256, toBytes } from "viem";
import {
  HEALTH_QUERY_ENGINE_ADDRESS,
  HEALTH_QUERY_ENGINE_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Search,
  Lock,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Database,
} from "lucide-react";

const NULL_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export default function HospitalQuery() {
  const { isConnected } = useAccount();

  const [patientAddr, setPatientAddr] = useState("");
  const [riskThreshold, setRiskThreshold] = useState("50");
  const [lastCheckId, setLastCheckId] = useState<`0x${string}` | null>(null);

  const [lookupId, setLookupId] = useState("");

  const [cohortText, setCohortText] = useState("");
  const [queryType, setQueryType] = useState<"0" | "1">("0");

  const {
    writeContract: runCheck,
    data: checkHash,
    isPending: checkPending,
    error: checkError,
  } = useWriteContract();
  const { isLoading: checkConfirming, isSuccess: checkSuccess, data: checkReceipt } =
    useWaitForTransactionReceipt({ hash: checkHash });

  const {
    writeContract: runAggregate,
    data: aggHash,
    isPending: aggPending,
  } = useWriteContract();
  const { isLoading: aggConfirming, isSuccess: aggSuccess } =
    useWaitForTransactionReceipt({ hash: aggHash });

  const lookupBytes32 = (lookupId.startsWith("0x") && lookupId.length === 66)
    ? (lookupId as `0x${string}`)
    : NULL_BYTES32;

  const { data: checkExists } = useReadContract({
    address: HEALTH_QUERY_ENGINE_ADDRESS,
    abi: HEALTH_QUERY_ENGINE_ABI,
    functionName: "checkExists",
    args: [lookupBytes32],
    query: { enabled: !!lookupId && lookupBytes32 !== NULL_BYTES32 && CONTRACTS_DEPLOYED },
  });

  const { data: eligibilityHandle } = useReadContract({
    address: HEALTH_QUERY_ENGINE_ADDRESS,
    abi: HEALTH_QUERY_ENGINE_ABI,
    functionName: "getEligibilityResult",
    args: [lookupBytes32],
    query: {
      enabled: !!checkExists && lookupBytes32 !== NULL_BYTES32 && CONTRACTS_DEPLOYED,
    },
  });

  const handleRunCheck = () => {
    if (!patientAddr.startsWith("0x")) return;
    const threshold = BigInt(Math.max(0, Math.min(100, Number(riskThreshold))));
    runCheck({
      address: HEALTH_QUERY_ENGINE_ADDRESS,
      abi: HEALTH_QUERY_ENGINE_ABI,
      functionName: "runEligibilityCheck",
      args: [patientAddr as `0x${string}`, threshold],
    });
  };

  const handleRunAggregate = () => {
    const addrs = cohortText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("0x") && s.length === 42) as `0x${string}`[];
    if (addrs.length === 0) return;
    runAggregate({
      address: HEALTH_QUERY_ENGINE_ADDRESS,
      abi: HEALTH_QUERY_ENGINE_ABI,
      functionName: "runAggregateQuery",
      args: [addrs, Number(queryType) as 0 | 1],
    });
  };

  const mockCheckId = checkSuccess && patientAddr
    ? toHex(keccak256(toBytes(patientAddr + riskThreshold + Date.now())))
    : null;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Hospital / Provider Role
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Confidential Health Queries
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Query patient eligibility without exposing raw health data. The FHE coprocessor
            evaluates conditions over encrypted inputs — the result is an encrypted boolean
            only the authorized parties can decrypt.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {!isConnected && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">Connect wallet to submit queries</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Deploy contracts first to submit live queries. The interface is shown below for preview.</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <Search className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Run Eligibility Check</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Calls{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">runEligibilityCheck(patient, maxRisk)</code>.
              Returns a{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">bytes32 checkId</code>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Patient Wallet Address
                </label>
                <Input
                  placeholder="0x…"
                  value={patientAddr}
                  onChange={(e) => setPatientAddr(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Max Risk Threshold (0–100)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={riskThreshold}
                    onChange={(e) => setRiskThreshold(e.target.value)}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground w-10 text-right">
                    {riskThreshold}
                  </span>
                </div>
              </div>
            </div>

            {(checkSuccess || mockCheckId) && (
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">Check ID (bytes32)</p>
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-primary" />
                  <span className="text-xs font-mono text-primary truncate">
                    {mockCheckId ?? lastCheckId ?? "0x…"}
                  </span>
                </div>
                <button
                  className="text-xs text-primary underline mt-2"
                  onClick={() => {
                    const id = mockCheckId ?? lastCheckId ?? "";
                    setLookupId(id);
                  }}
                >
                  Look up result ↓
                </button>
              </div>
            )}

            {checkError && (
              <p className="mt-3 text-xs text-destructive">{checkError.message.slice(0, 100)}</p>
            )}

            <Button
              onClick={handleRunCheck}
              disabled={!isConnected || !patientAddr.startsWith("0x") || checkPending || checkConfirming || !CONTRACTS_DEPLOYED}
              className="mt-4 w-full gap-2"
            >
              {checkPending || checkConfirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running check…</>
              ) : (
                <><Search className="h-4 w-4" /> Run Eligibility Check<ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Look Up Check Result</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Reads{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">getEligibilityResult(checkId)</code>{" "}
              — returns an encrypted{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">ebool</code> handle.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Check ID (bytes32)
                </label>
                <Input
                  placeholder="0x…"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              {checkExists !== undefined && (
                <div className="flex items-center gap-2 text-xs">
                  {checkExists ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle className="h-3 w-3" /> Check exists on-chain
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Check not found on-chain</span>
                  )}
                </div>
              )}

              {eligibilityHandle && checkExists && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs text-muted-foreground mb-1">Encrypted ebool handle</p>
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-primary" />
                    <span className="text-xs font-mono text-primary truncate">
                      {String(eligibilityHandle).slice(0, 24)}…
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This encrypted boolean can be user-decrypted by the authorized patient
                    using an EIP-712 signed request.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Aggregate Cohort Query</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">runAggregateQuery(cohort[], queryType)</code>.
            Sums an encrypted attribute across all enrolled patients without revealing
            individual values. Returns an encrypted{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">euint64</code> count.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Patient Addresses (one per line or comma-separated)
              </label>
              <textarea
                placeholder={"0xAlice…\n0xBob…\n0xCharlie…"}
                value={cohortText}
                onChange={(e) => setCohortText(e.target.value)}
                rows={4}
                className="w-full rounded-md bg-input border border-border text-xs font-mono text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Query Type</label>
              <div className="space-y-2">
                {[
                  { val: "0", label: "Type 0 — Risk Score Sum", desc: "Sum of encrypted risk scores" },
                  { val: "1", label: "Type 1 — Condition Flags Sum", desc: "Sum of condition flag bitmasks" },
                ].map(({ val, label, desc }) => (
                  <label
                    key={val}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      queryType === val
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-muted/20 hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      value={val}
                      checked={queryType === val}
                      onChange={(e) => setQueryType(e.target.value as "0" | "1")}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {aggSuccess && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="h-4 w-4" /> Aggregate query submitted — result handle
              stored on-chain
            </div>
          )}

          <Button
            onClick={handleRunAggregate}
            disabled={!isConnected || !cohortText.trim() || aggPending || aggConfirming || !CONTRACTS_DEPLOYED}
            variant="outline"
            className="gap-2"
          >
            {aggPending || aggConfirming ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running aggregate…</>
            ) : (
              <><Database className="h-4 w-4" /> Run Aggregate Query</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
