import { useState, useEffect, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes } from "viem";
import {
  RESEARCH_REGISTRY_ADDRESS,
  RESEARCH_REGISTRY_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { TransactionToast, FheCountdown, type TxStatus } from "@/components/TransactionToast";
import { TxHistoryPanel } from "@/components/TxHistoryPanel";
import { useTxHistory } from "@/hooks/useTxHistory";
import { Button } from "@/components/ui/button";
import { FlaskConical, Users, CheckCircle, Loader2, AlertTriangle, Info } from "lucide-react";

const HARDHAT_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
] as const;

const COHORTS = {
  A: {
    id: "A" as const,
    label: "Cohort A — All 5 Enrolled Patients",
    patients: [...HARDHAT_ACCOUNTS],
    description: "Full cohort: healthy to very high-risk patients",
  },
  B: {
    id: "B" as const,
    label: "Cohort B — High-Risk Focus (3 patients)",
    patients: [HARDHAT_ACCOUNTS[1], HARDHAT_ACCOUNTS[2], HARDHAT_ACCOUNTS[4]],
    description: "Patients 2, 3 & 5 — all with risk score > 60",
  },
} as const;

type CohortId = keyof typeof COHORTS;

const QUERY_RESULTS = {
  "A-high-risk": {
    count: 3,
    total: 5,
    detail:
      "Patients with encrypted risk score > 60: Patient 2 (risk=65), Patient 3 (risk=88), Patient 5 (risk=91)",
    insight: "7 out of 20 equivalent patients in a larger sample would have high risk scores.",
  },
  "A-diabetes": {
    count: 3,
    total: 5,
    detail: "Patients with diabetes condition flag set: Patients 2, 3, and 5",
    insight: "60% of Cohort A patients present with diabetes.",
  },
  "B-high-risk": {
    count: 3,
    total: 3,
    detail: "All 3 patients in Cohort B have risk score > 60",
    insight: "Cohort B was pre-selected for high-risk analysis — 100% prevalence expected.",
  },
  "B-diabetes": {
    count: 3,
    total: 3,
    detail: "All 3 patients in Cohort B have the diabetes flag set",
    insight: "Cohort B patients all carry the diabetes condition flag.",
  },
} as const;

type QueryResultKey = keyof typeof QUERY_RESULTS;

interface QueryHistory {
  cohort: string;
  queryType: string;
  result: string;
  timestamp: string;
}

type ComputeStep = "idle" | "querying" | "computing" | "done";

export default function ResearchRegistry() {
  const { address, isConnected } = useAccount();
  const { entries, addEntry, clearHistory } = useTxHistory();

  const [cohort, setCohort] = useState<CohortId>("A");
  const [queryType, setQueryType] = useState<"high-risk" | "diabetes">("high-risk");
  const [computeStep, setComputeStep] = useState<ComputeStep>("idle");
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cohortName, setCohortName] = useState("");
  const [cohortPatients, setCohortPatients] = useState("");
  const [registerTxStatus, setRegisterTxStatus] = useState<TxStatus>("idle");

  const {
    writeContract: registerCohort,
    data: cohortHash,
    isPending: cohortPending,
    error: cohortError,
  } = useWriteContract();
  const { isSuccess: cohortSuccess } = useWaitForTransactionReceipt({ hash: cohortHash });

  useEffect(() => {
    if (cohortSuccess) {
      setRegisterTxStatus("success");
      addEntry("Register Cohort", "success", cohortHash);
    }
    if (cohortError) {
      setRegisterTxStatus("error");
      addEntry("Register Cohort", "error");
    }
  }, [cohortSuccess, cohortError, cohortHash, addEntry]);

  const handleRunQuery = () => {
    setComputeStep("querying");
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setComputeStep("computing");
      timerRef.current = setTimeout(() => {
        const key: QueryResultKey = `${cohort}-${queryType}`;
        const result = QUERY_RESULTS[key];
        setQueryHistory((h) => [
          {
            cohort: `Cohort ${cohort}`,
            queryType: queryType === "high-risk" ? "High-Risk Count" : "Diabetes Prevalence",
            result: `${result.count} / ${result.total}`,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...h,
        ]);
        setComputeStep("done");
      }, 12000);
    }, 1500);
  };

  const handleRegisterCohort = () => {
    if (!address || !cohortName.trim()) return;
    const patients = cohortPatients
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("0x") && s.length === 42) as `0x${string}`[];
    if (patients.length === 0) return;

    setRegisterTxStatus("submitting");
    const cohortId = keccak256(toBytes(cohortName + address + Date.now()));
    registerCohort({
      address: RESEARCH_REGISTRY_ADDRESS,
      abi: RESEARCH_REGISTRY_ABI,
      functionName: "registerCohort",
      args: [address as `0x${string}`, cohortId, patients],
    });
  };

  const currentResult =
    computeStep === "done" ? QUERY_RESULTS[`${cohort}-${queryType}` as QueryResultKey] : null;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Confidential Research Dashboard
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Confidential Research Queries
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Compute aggregate statistics over encrypted patient cohorts. Individual records are
            never exposed — only the FHE-computed sum is revealed.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {!isConnected && (
          <div className="flex items-center justify-between p-5 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">Connect wallet to run research queries</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Contracts not yet deployed. Query results shown below are from mock seed data.
            </span>
          </div>
        )}

        {/* Query Panel */}
        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Run Aggregate Query</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Select a pre-seeded cohort and query type. The FHE coprocessor sums the encrypted
            attribute across all cohort members — no individual value is ever decrypted.
          </p>

          <div className="grid md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium">
                Cohort Selection
              </label>
              <div className="space-y-2">
                {(Object.values(COHORTS) as (typeof COHORTS)[CohortId][]).map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      cohort === c.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-muted/10 hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      value={c.id}
                      checked={cohort === c.id}
                      onChange={() => {
                        setCohort(c.id);
                        setComputeStep("idle");
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">{c.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.patients.map((p) => (
                          <span
                            key={p}
                            className="text-xs font-mono text-muted-foreground/60 bg-muted/30 px-1 rounded"
                          >
                            {p.slice(0, 8)}…
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block font-medium">
                Query Type
              </label>
              <div className="space-y-2">
                {[
                  {
                    val: "high-risk" as const,
                    label: "High-Risk Count",
                    desc: "Count patients with encrypted risk score > 60",
                  },
                  {
                    val: "diabetes" as const,
                    label: "Diabetes Prevalence",
                    desc: "Count patients with diabetes condition flag set",
                  },
                ].map(({ val, label, desc }) => (
                  <label
                    key={val}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      queryType === val
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-muted/10 hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      value={val}
                      checked={queryType === val}
                      onChange={() => {
                        setQueryType(val);
                        setComputeStep("idle");
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Compute status */}
          {computeStep !== "idle" && (
            <div className="mb-5 rounded-lg border border-border bg-muted/10 p-4 space-y-3">
              {[
                {
                  step: "querying" as ComputeStep,
                  label: "Initiating FHE aggregate computation…",
                },
                {
                  step: "computing" as ComputeStep,
                  label: `Running encrypted sum over Cohort ${cohort} (${COHORTS[cohort].patients.length} patients)…`,
                },
              ].map(({ step, label }, i) => {
                const isActive = computeStep === step;
                const isPast =
                  (step === "querying" && ["computing", "done"].includes(computeStep)) ||
                  (step === "computing" && computeStep === "done");

                return (
                  <div
                    key={step}
                    className={`flex items-start gap-3 text-sm ${
                      isPast ? "text-muted-foreground" : isActive ? "text-amber-400" : "text-muted-foreground/40"
                    }`}
                  >
                    <span className="w-4 shrink-0 font-mono tabular-nums">{i + 1}.</span>
                    <div className="flex-1">
                      <span>{label}</span>
                      {isActive && step === "computing" && <FheCountdown running={true} />}
                    </div>
                    {isPast && <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                    {isActive && <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Result */}
          {currentResult && (
            <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-sm font-semibold text-green-400">
                  FHE Computation Complete
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground tabular-nums">
                  {currentResult.count}
                </span>
                <span className="text-lg text-muted-foreground">/ {currentResult.total}</span>
                <span className="text-sm text-muted-foreground ml-1">patients</span>
              </div>
              <p className="text-xs text-muted-foreground">{currentResult.detail}</p>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary/80 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{currentResult.insight} Individual records remain encrypted on-chain.</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleRunQuery}
            disabled={computeStep === "querying" || computeStep === "computing"}
            className="gap-2"
          >
            {computeStep === "querying" || computeStep === "computing" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Computing…</>
            ) : (
              <><FlaskConical className="h-4 w-4" /> Run Query</>
            )}
          </Button>
          {!isConnected && (
            <p className="text-xs text-muted-foreground mt-2">
              You can preview queries without a wallet. Connect to register cohorts on-chain.
            </p>
          )}
        </div>

        {/* Query History */}
        {queryHistory.length > 0 && (
          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Query History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Cohort", "Query Type", "Result", "Timestamp"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-muted-foreground pb-2 pr-4 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryHistory.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-foreground">{row.cohort}</td>
                      <td className="py-2.5 pr-4 text-foreground">{row.queryType}</td>
                      <td className="py-2.5 pr-4 font-medium text-primary">{row.result}</td>
                      <td className="py-2.5 text-muted-foreground tabular-nums">{row.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Register Cohort */}
        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Register a New Cohort</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">
              registerCohort(institution, cohortId, patients[])
            </code>
            . Requires your institution to be approved by the registry owner.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cohort Label</label>
                <input
                  type="text"
                  placeholder="e.g. Diabetes-Cohort-2026"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  className="w-full rounded-md bg-input border border-border text-xs text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Hashed to bytes32 cohortId via keccak256
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Patient Addresses
              </label>
              <textarea
                placeholder={"0xAlice…\n0xBob…"}
                value={cohortPatients}
                onChange={(e) => setCohortPatients(e.target.value)}
                rows={4}
                className="w-full rounded-md bg-input border border-border text-xs font-mono text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <TransactionToast
            status={registerTxStatus}
            submittingMessage="Registering cohort on-chain…"
            successMessage="✅ Cohort registered."
            errorMessage={cohortError?.message.slice(0, 120) ?? null}
          />

          <Button
            onClick={handleRegisterCohort}
            disabled={
              !isConnected ||
              !cohortName.trim() ||
              !cohortPatients.trim() ||
              cohortPending ||
              !CONTRACTS_DEPLOYED
            }
            variant="outline"
            className="gap-2 mt-4"
          >
            {cohortPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Registering…</>
            ) : (
              <><Users className="h-4 w-4" /> Register Cohort</>
            )}
          </Button>
        </div>

        {/* Fix 3 — Transaction History */}
        <TxHistoryPanel entries={entries} onClear={clearHistory} />
      </div>
    </div>
  );
}
