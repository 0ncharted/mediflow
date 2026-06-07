import { useState, useEffect, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  HEALTH_QUERY_ENGINE_ADDRESS,
  HEALTH_QUERY_ENGINE_ABI,
  INSURANCE_MODULE_ADDRESS,
  INSURANCE_MODULE_ABI,
  PATIENT_REGISTRY_ADDRESS,
  PATIENT_REGISTRY_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { TransactionToast, FheCountdown, type TxStatus } from "@/components/TransactionToast";
import { TxHistoryPanel } from "@/components/TxHistoryPanel";
import { useTxHistory } from "@/hooks/useTxHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Search,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  CreditCard,
  Database,
  ExternalLink,
  Copy,
  ClipboardCheck,
} from "lucide-react";

type CheckStep = "idle" | "querying" | "computing" | "done" | "error";

const NULL_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const NULL_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const MOCK_PATIENT_RISK = 37;

export default function HospitalQuery() {
  const { isConnected } = useAccount();
  const { entries, addEntry, clearHistory } = useTxHistory();

  const [patientAddr, setPatientAddr] = useState("");
  const [riskThreshold, setRiskThreshold] = useState(70);
  const [checkStep, setCheckStep] = useState<CheckStep>("idle");
  const [checkId, setCheckId] = useState<`0x${string}` | null>(null);
  const [claimTxStatus, setClaimTxStatus] = useState<TxStatus>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const [cohortText, setCohortText] = useState("");
  const [queryType, setQueryType] = useState<"0" | "1">("0");
  const [aggTxStatus, setAggTxStatus] = useState<TxStatus>("idle");
  const [aggTimedOut, setAggTimedOut] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aggTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isValidPatientAddr = patientAddr.startsWith("0x") && patientAddr.length === 42;

  const {
    data: patientEnrolled,
    refetch: refetchEnrolled,
    isFetching: enrollmentChecking,
  } = useReadContract({
    address: PATIENT_REGISTRY_ADDRESS,
    abi: PATIENT_REGISTRY_ABI,
    functionName: "isEnrolled",
    args: [isValidPatientAddr ? (patientAddr as `0x${string}`) : NULL_ADDR],
    query: { enabled: isValidPatientAddr && CONTRACTS_DEPLOYED },
  });

  const {
    writeContract: runCheck,
    data: checkHash,
    isPending: checkPending,
    error: checkWriteError,
  } = useWriteContract();
  const { isLoading: checkConfirming, isSuccess: checkSuccess } =
    useWaitForTransactionReceipt({ hash: checkHash });

  const {
    writeContract: runAggregate,
    data: aggHash,
    isPending: aggPending,
  } = useWriteContract();
  const { isLoading: aggConfirming, isSuccess: aggSuccess } =
    useWaitForTransactionReceipt({ hash: aggHash });

  const {
    writeContract: processClaim,
    data: claimHash,
    isPending: claimPending,
    error: claimWriteError,
  } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  const lookupId = checkId ?? NULL_BYTES32;
  const { data: checkExists } = useReadContract({
    address: HEALTH_QUERY_ENGINE_ADDRESS,
    abi: HEALTH_QUERY_ENGINE_ABI,
    functionName: "checkExists",
    args: [lookupId],
    query: { enabled: !!checkId && CONTRACTS_DEPLOYED },
  });

  useEffect(() => {
    if (checkPending) {
      setCheckStep("computing");
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
      }, 120_000);
    }
  }, [checkPending]);

  useEffect(() => {
    if (checkSuccess) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setTimedOut(false);
      setCheckStep("done");
      setCheckId(checkHash ?? null);
      if (checkHash) {
        localStorage.setItem(
          "mediflow_last_check",
          JSON.stringify({
            checkId: checkHash,
            patient: patientAddr,
            threshold: riskThreshold,
            timestamp: Date.now(),
          }),
        );
        void navigator.clipboard.writeText(checkHash).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
        addEntry("Run Eligibility Check", "success", checkHash);
      }
    }
  }, [checkSuccess, checkHash, patientAddr, riskThreshold, addEntry]);

  useEffect(() => {
    if (checkWriteError && checkStep !== "idle") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCheckStep("error");
      addEntry("Run Eligibility Check", "error");
    }
  }, [checkWriteError, checkStep, addEntry]);

  useEffect(() => {
    if (aggSuccess) {
      if (aggTimeoutRef.current) clearTimeout(aggTimeoutRef.current);
      setAggTimedOut(false);
      setAggTxStatus("success");
      addEntry("Run Aggregate Query", "success", aggHash);
    } else if (aggPending || aggConfirming) {
      setAggTxStatus("submitting");
    }
  }, [aggSuccess, aggPending, aggConfirming, aggHash, addEntry]);

  useEffect(() => {
    if (claimSuccess) {
      setClaimTxStatus("success");
      addEntry("Process Claim Payment", "success", claimHash);
    }
    if (claimWriteError) {
      setClaimTxStatus("error");
      setClaimError(claimWriteError.message.slice(0, 200));
      addEntry("Process Claim Payment", "error");
    }
  }, [claimSuccess, claimWriteError, claimHash, addEntry]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (aggTimeoutRef.current) clearTimeout(aggTimeoutRef.current);
    };
  }, []);

  const handleRunCheck = () => {
    if (!patientAddr.startsWith("0x")) return;
    setCheckStep("querying");
    setCheckId(null);
    setTimedOut(false);
    const threshold = BigInt(Math.max(0, Math.min(100, riskThreshold)));
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
    setAggTimedOut(false);
    setAggTxStatus("submitting");
    if (aggTimeoutRef.current) clearTimeout(aggTimeoutRef.current);
    aggTimeoutRef.current = setTimeout(() => setAggTimedOut(true), 120_000);
    runAggregate({
      address: HEALTH_QUERY_ENGINE_ADDRESS,
      abi: HEALTH_QUERY_ENGINE_ABI,
      functionName: "runAggregateQuery",
      args: [addrs, Number(queryType) as 0 | 1],
    });
  };

  const handleProcessClaim = () => {
    if (!patientAddr.startsWith("0x") || !checkId) return;
    setClaimTxStatus("submitting");
    setClaimError(null);
    processClaim({
      address: INSURANCE_MODULE_ADDRESS,
      abi: INSURANCE_MODULE_ABI,
      functionName: "processClaimPayment",
      args: [patientAddr as `0x${string}`, checkId],
    });
  };

  const isEligible = MOCK_PATIENT_RISK <= riskThreshold;

  const stepLabels: Record<CheckStep, { label: string; color: string } | null> = {
    idle: null,
    querying: {
      label: "1/3 — Querying encrypted record from PatientRegistry…",
      color: "text-primary",
    },
    computing: {
      label: "2/3 — Running FHE comparison on Sepolia…",
      color: "text-amber-400",
    },
    done: {
      label: `3/3 — ✅ Result: Patient is ${isEligible ? "ELIGIBLE" : "NOT ELIGIBLE"} for coverage at threshold ${riskThreshold}`,
      color: isEligible ? "text-[#065f46]" : "text-[#991b1b]",
    },
    error: { label: checkWriteError?.message.slice(0, 120) ?? "Error", color: "text-destructive" },
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-white">
        <div className="max-w-[900px] mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Healthcare Provider Dashboard
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Healthcare Provider Dashboard
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Run eligibility checks against encrypted patient records. You never see raw health
            data — only the computed result from the FHE coprocessor.
          </p>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-8 space-y-6">
        {!isConnected && (
          <div className="flex items-center justify-between p-5 rounded-xl bg-card border border-card-border shadow">
            <p className="text-sm text-muted-foreground">Connect wallet to submit queries</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Deploy contracts first. Interface shown for preview.</span>
          </div>
        )}

        {/* Eligibility Check */}
        <div className="rounded-xl bg-card border border-card-border shadow p-6">
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Run Eligibility Check</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">
              runEligibilityCheck(patient, threshold)
            </code>
            . The FHE coprocessor compares the encrypted risk score against your threshold —
            the result is an encrypted boolean stored on-chain.
          </p>

          {/* Fix 1 — enrollment warning */}
          <div className="mb-5 flex items-start gap-2 p-4 rounded-lg bg-amber-500/8 border border-amber-500/25 text-amber-300 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span>
                <strong>Ensure the patient has registered their encrypted health record</strong>{" "}
                (via Patient Portal) before running a check. If they haven't enrolled, the
                eligibility check will silently fail or return incorrect results.
              </span>
              {isValidPatientAddr && CONTRACTS_DEPLOYED && (
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { void refetchEnrolled(); }}
                    disabled={enrollmentChecking}
                    className="h-7 text-xs gap-1.5 border-amber-500/40 text-amber-300 hover:text-amber-200"
                  >
                    {enrollmentChecking ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
                    ) : (
                      <><Search className="h-3 w-3" /> Check Enrollment</>
                    )}
                  </Button>
                  {patientEnrolled !== undefined && (
                    <span
                      className={`text-xs font-medium ${patientEnrolled ? "text-[#065f46]" : "text-[#991b1b]"}`}
                    >
                      {patientEnrolled
                        ? "✅ Patient is enrolled on-chain"
                        : "❌ Patient is NOT enrolled — check may fail"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-5">
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
                Risk Threshold (0–100) — currently{" "}
                <strong className="text-foreground">{riskThreshold}</strong>
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={riskThreshold}
                  onChange={(e) => setRiskThreshold(Number(e.target.value))}
                  className="flex-1 accent-primary h-2"
                />
                <span className="text-sm font-bold text-foreground w-8 text-right tabular-nums">
                  {riskThreshold}
                </span>
              </div>
            </div>
          </div>

          {/* Step-by-step status */}
          {checkStep !== "idle" && (
            <div className="mb-5 rounded-lg border border-border bg-muted/10 p-4 space-y-3">
              {(["querying", "computing", "done"] as CheckStep[]).map((step, i) => {
                const stepInfo = stepLabels[step];
                if (!stepInfo) return null;
                const isActive = checkStep === step;
                const isPast =
                  (step === "querying" && ["computing", "done"].includes(checkStep)) ||
                  (step === "computing" && checkStep === "done");
                const isFuture = !isActive && !isPast && checkStep !== "error";

                return (
                  <div
                    key={step}
                    className={`flex items-start gap-3 text-sm ${
                      isFuture
                        ? "text-muted-foreground/40"
                        : isPast
                          ? "text-muted-foreground"
                          : stepInfo.color
                    }`}
                  >
                    <span className="tabular-nums w-4 shrink-0 font-mono">{i + 1}.</span>
                    <div className="flex-1">
                      <span>
                        {step === "querying" && "Querying encrypted record from PatientRegistry…"}
                        {step === "computing" &&
                          "Running FHE comparison on Sepolia (this takes ~45 seconds)…"}
                        {step === "done" &&
                          (isEligible
                            ? `✅ Result: Patient IS ELIGIBLE for coverage at threshold ${riskThreshold}`
                            : `❌ Result: Patient is NOT ELIGIBLE for coverage at threshold ${riskThreshold}`)}
                      </span>
                      {isActive && step === "computing" && (
                        <FheCountdown running={true} />
                      )}
                    </div>
                    {isPast && <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                    {isActive && step !== "done" && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" />
                    )}
                  </div>
                );
              })}
              {checkStep === "error" && (
                <p className="text-xs text-destructive flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  {checkWriteError?.message.slice(0, 150)}
                </p>
              )}
              {checkStep === "done" && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  The on-chain state remains encrypted. This result was computed by the FHE
                  coprocessor — raw health values were never exposed. (Demo: simulated from
                  mock data.)
                </p>
              )}

              {/* Fix 2 — 120s timeout message */}
              {timedOut && checkStep === "computing" && checkHash && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/30 text-amber-300 text-xs">
                  <span className="text-base leading-none">⏱️</span>
                  <div>
                    <p className="font-medium">Check is taking longer than expected (120 s elapsed).</p>
                    <p className="text-amber-300/70 mt-0.5">
                      The transaction was submitted — you can monitor it on Etherscan while
                      waiting for the FHE coprocessor to settle.
                    </p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${checkHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-amber-200 hover:underline font-mono"
                    >
                      {checkHash.slice(0, 18)}…
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fix 4 — checkId display with copy confirmation */}
          {checkId && checkStep === "done" && (
            <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                  Check ID (bytes32 — encrypted result stored on-chain)
                </p>
                {copied ? (
                  <span className="flex items-center gap-1 text-[#065f46] font-medium">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Copied to clipboard!
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(checkId).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 4000);
                    }}
                    className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                )}
              </div>
              <p className="font-mono text-primary break-all">{checkId}</p>
              <p className="text-muted-foreground/70 italic">
                Paste this Check ID into Insurance Module → Process Claim Payment to trigger
                coverage.
              </p>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={handleRunCheck}
              disabled={
                !isConnected ||
                !patientAddr.startsWith("0x") ||
                checkStep === "querying" ||
                checkStep === "computing" ||
                !CONTRACTS_DEPLOYED
              }
              className="gap-2"
            >
              {checkStep === "querying" || checkStep === "computing" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
              ) : (
                <>
                  <Search className="h-4 w-4" /> Run Eligibility Check
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>

            {checkStep === "done" && isEligible && (
              <div className="space-y-2 w-full">
                <p className="text-xs text-[#065f46] font-medium">
                  Patient is eligible — submit claim payment:
                </p>
                <TransactionToast
                  status={claimTxStatus}
                  submittingMessage="Processing claim via InsuranceModule…"
                  successMessage="✅ Claim payment processed from MockPaymentVault."
                  errorMessage={claimError}
                />
                <Button
                  onClick={handleProcessClaim}
                  disabled={!isConnected || claimPending || claimConfirming || !CONTRACTS_DEPLOYED}
                  variant="outline"
                  className="gap-2"
                >
                  {claimPending || claimConfirming ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  ) : (
                    <><CreditCard className="h-4 w-4" /> Submit Claim Payment</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Aggregate Query */}
        <div className="rounded-xl bg-card border border-card-border shadow p-6">
          <div className="flex items-center gap-2 mb-1">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Aggregate Cohort Query</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">
              runAggregateQuery(cohort[], queryType)
            </code>
            . Sums an encrypted attribute over all patients — individual values are never
            revealed. Returns an encrypted{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">euint64</code>.
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
                  { val: "0", label: "Type 0 — Risk Score Sum" },
                  { val: "1", label: "Type 1 — Condition Flags Sum" },
                ].map(({ val, label }) => (
                  <label
                    key={val}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      queryType === val
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-muted/20"
                    }`}
                  >
                    <input
                      type="radio"
                      value={val}
                      checked={queryType === val}
                      onChange={(e) => setQueryType(e.target.value as "0" | "1")}
                      className="accent-primary"
                    />
                    <span className="text-xs text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <TransactionToast
            status={aggTxStatus}
            submittingMessage="Running aggregate FHE computation on Sepolia…"
            successMessage="✅ Aggregate query submitted — encrypted result stored on-chain."
            showFheTimer
          />

          {aggTimedOut && (aggPending || aggConfirming) && aggHash && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/30 text-amber-400 text-xs">
              <span className="text-base leading-none">⏱️</span>
              <div>
                <p className="font-medium">Aggregate query is taking longer than expected (120 s elapsed).</p>
                <p className="mt-0.5 text-amber-400/70">
                  The transaction was submitted — you can track it on Etherscan while the FHE
                  coprocessor processes the cohort.
                </p>
                <a
                  href={`https://sepolia.etherscan.io/tx/${aggHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-amber-300 hover:underline font-mono"
                >
                  {aggHash.slice(0, 18)}…
                </a>
              </div>
            </div>
          )}

          <Button
            onClick={handleRunAggregate}
            disabled={
              !isConnected || !cohortText.trim() || aggPending || aggConfirming || !CONTRACTS_DEPLOYED
            }
            variant="outline"
            className="gap-2 mt-4"
          >
            {aggPending || aggConfirming ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running aggregate…</>
            ) : (
              <><Database className="h-4 w-4" /> Run Aggregate Query</>
            )}
          </Button>
        </div>

        {/* Fix 3 — Transaction History */}
        <TxHistoryPanel entries={entries} onClear={clearHistory} />
      </div>
    </div>
  );
}
