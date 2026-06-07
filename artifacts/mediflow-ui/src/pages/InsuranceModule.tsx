import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther, formatEther } from "viem";
import {
  INSURANCE_MODULE_ADDRESS,
  INSURANCE_MODULE_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { TxHistoryPanel } from "@/components/TxHistoryPanel";
import { useTxHistory } from "@/hooks/useTxHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  CreditCard,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Shield,
  DollarSign,
  Info,
  ClipboardList,
} from "lucide-react";

const NULL_ADDR = "0x0000000000000000000000000000000000000000" as const;
const NULL_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const CHECK_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

interface LastCheck {
  checkId: string;
  patient: string;
  threshold: number;
  timestamp: number;
}

export default function InsuranceModule() {
  const { isConnected } = useAccount();
  const { entries, addEntry, clearHistory } = useTxHistory();

  const [policyPatient, setPolicyPatient] = useState("");
  const [premium, setPremium] = useState("0.01");
  const [coverage, setCoverage] = useState("1.0");
  const [riskThreshold, setRiskThreshold] = useState("50");

  const [claimPatient, setClaimPatient] = useState("");
  const [checkId, setCheckId] = useState("");

  const [viewPatient, setViewPatient] = useState("");

  const [lastCheck, setLastCheck] = useState<LastCheck | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mediflow_last_check");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LastCheck;
        if (parsed.checkId && parsed.patient) setLastCheck(parsed);
      } catch {
        /* ignore malformed JSON */
      }
    }
  }, []);

  const {
    writeContract: createPolicy,
    data: policyHash,
    isPending: policyPending,
    error: policyError,
  } = useWriteContract();
  const { isLoading: policyConfirming, isSuccess: policySuccess } =
    useWaitForTransactionReceipt({ hash: policyHash });

  const {
    writeContract: processClaim,
    data: claimHash,
    isPending: claimPending,
    error: claimError,
  } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  useEffect(() => {
    if (policySuccess && policyHash) {
      addEntry("Create Insurance Policy", "success", policyHash);
    }
    if (policyError) {
      addEntry("Create Insurance Policy", "error");
    }
  }, [policySuccess, policyHash, policyError, addEntry]);

  useEffect(() => {
    if (claimSuccess && claimHash) {
      addEntry("Process Claim Payment", "success", claimHash);
    }
    if (claimError) {
      addEntry("Process Claim Payment", "error");
    }
  }, [claimSuccess, claimHash, claimError, addEntry]);

  const queryViewAddr = (viewPatient.startsWith("0x") && viewPatient.length === 42
    ? viewPatient
    : NULL_ADDR) as `0x${string}`;

  const { data: policy } = useReadContract({
    address: INSURANCE_MODULE_ADDRESS,
    abi: INSURANCE_MODULE_ABI,
    functionName: "getPolicy",
    args: [queryViewAddr],
    query: {
      enabled: !!viewPatient && viewPatient.startsWith("0x") && CONTRACTS_DEPLOYED,
    },
  });

  const lookupBytes32 = (checkId.startsWith("0x") && checkId.length === 66
    ? checkId
    : NULL_BYTES32) as `0x${string}`;

  const { data: claimProcessed } = useReadContract({
    address: INSURANCE_MODULE_ADDRESS,
    abi: INSURANCE_MODULE_ABI,
    functionName: "isClaimProcessed",
    args: [lookupBytes32],
    query: {
      enabled: !!checkId && checkId.startsWith("0x") && CONTRACTS_DEPLOYED,
    },
  });

  const checkIdValid = CHECK_ID_REGEX.test(checkId);
  const checkIdError =
    checkId.length > 0 && !checkIdValid
      ? "Must be a 66-character hex string (0x followed by 64 hex digits)"
      : null;

  const patientMismatch =
    lastCheck &&
    claimPatient.length === 42 &&
    checkIdValid &&
    lastCheck.patient.toLowerCase() !== claimPatient.toLowerCase();

  const handleCreatePolicy = () => {
    if (!policyPatient.startsWith("0x")) return;
    createPolicy({
      address: INSURANCE_MODULE_ADDRESS,
      abi: INSURANCE_MODULE_ABI,
      functionName: "createPolicy",
      args: [
        policyPatient as `0x${string}`,
        parseEther(premium || "0"),
        parseEther(coverage || "0"),
        BigInt(Math.max(0, Math.min(100, Number(riskThreshold)))),
      ],
    });
  };

  const handleProcessClaim = () => {
    if (!claimPatient.startsWith("0x") || !checkIdValid) return;
    processClaim({
      address: INSURANCE_MODULE_ADDRESS,
      abi: INSURANCE_MODULE_ABI,
      functionName: "processClaimPayment",
      args: [claimPatient as `0x${string}`, checkId as `0x${string}`],
    });
  };

  const policyData = policy as
    | { monthlyPremium: bigint; coverageAmount: bigint; riskThreshold: bigint; active: boolean }
    | undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Insurance Issuer Role
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Encrypted Claims Processing
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Insurance contracts read eligibility results from encrypted FHE checks and
            trigger premium releases — all without seeing the underlying health data.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {!isConnected && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">Connect wallet to manage policies</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-400 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Deploy contracts first. Interface shown for preview.</span>
          </div>
        )}

        {/* Last Check Banner — FIX 4 */}
        {lastCheck && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <ClipboardList className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground mb-0.5">
                Last completed eligibility check
              </p>
              <p className="text-xs font-mono text-primary truncate">{lastCheck.checkId}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Patient:{" "}
                <span className="font-mono">{lastCheck.patient.slice(0, 10)}…{lastCheck.patient.slice(-4)}</span>
                {" · "}Threshold: {lastCheck.threshold}
                {" · "}{new Date(lastCheck.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-3 shrink-0"
              onClick={() => {
                setCheckId(lastCheck.checkId);
                setClaimPatient(lastCheck.patient);
              }}
            >
              Load
            </Button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Create Policy</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Calls{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">
                createPolicy(patient, premium, coverage, riskThreshold)
              </code>
              . Binds a patient address to an encrypted risk-gated policy.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Patient Address
                </label>
                <Input
                  placeholder="0x…"
                  value={policyPatient}
                  onChange={(e) => setPolicyPatient(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Monthly Premium (ETH)
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    value={premium}
                    onChange={(e) => setPremium(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Coverage (ETH)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={coverage}
                    onChange={(e) => setCoverage(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Risk Threshold (0–100)
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

            {policySuccess && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" /> Policy created on-chain
              </div>
            )}
            {policyError && (
              <p className="mt-3 text-xs text-destructive">
                {policyError.message.slice(0, 100)}
              </p>
            )}

            <Button
              onClick={handleCreatePolicy}
              disabled={
                !isConnected ||
                !policyPatient.startsWith("0x") ||
                policyPending ||
                policyConfirming ||
                !CONTRACTS_DEPLOYED
              }
              className="mt-4 w-full gap-2"
            >
              {policyPending || policyConfirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating policy…</>
              ) : (
                <><Shield className="h-4 w-4" /> Create Policy</>
              )}
            </Button>
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Process Claim Payment</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Calls{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">
                processClaimPayment(patient, checkId)
              </code>
              . Reads the encrypted eligibility result and triggers payment from{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">MockPaymentVault</code> if
              eligible.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Patient Address
                </label>
                <Input
                  placeholder="0x…"
                  value={claimPatient}
                  onChange={(e) => setClaimPatient(e.target.value)}
                  className={`font-mono text-xs ${patientMismatch ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                />
                {patientMismatch && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-500">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Address differs from the check origin — this claim may fail.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Eligibility Check ID (bytes32)
                </label>
                <Input
                  placeholder="0x0000…0000 (66 hex characters)"
                  value={checkId}
                  onChange={(e) => setCheckId(e.target.value)}
                  className={`font-mono text-xs ${checkIdError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {checkIdError ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {checkIdError}
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground">
                    <Info className="h-3 w-3 shrink-0 mt-0.5" />
                    Paste the bytes32 Check ID from Provider Dashboard after running an
                    eligibility check. It is automatically copied to your clipboard when a
                    check completes. Use the{" "}
                    <strong className="text-foreground">Load</strong> button above if you just
                    ran a check in this session.
                  </p>
                )}
              </div>
              {claimProcessed !== undefined && (
                <div className="flex items-center gap-2 text-xs">
                  {claimProcessed ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle className="h-3 w-3" /> Claim already processed
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Claim not yet processed</span>
                  )}
                </div>
              )}
            </div>

            {claimSuccess && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" /> Claim payment processed
              </div>
            )}
            {claimError && (
              <p className="mt-3 text-xs text-destructive">
                {claimError.message.slice(0, 100)}
              </p>
            )}

            <Button
              onClick={handleProcessClaim}
              disabled={
                !isConnected ||
                !claimPatient.startsWith("0x") ||
                !checkIdValid ||
                claimPending ||
                claimConfirming ||
                !CONTRACTS_DEPLOYED
              }
              className="mt-4 w-full gap-2"
            >
              {claimPending || claimConfirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><CreditCard className="h-4 w-4" /> Process Claim Payment</>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">View Policy</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Reads{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">getPolicy(patient)</code> —
            returns the policy struct stored on-chain.
          </p>
          <div className="flex gap-3 mb-4">
            <Input
              placeholder="0x… patient address"
              value={viewPatient}
              onChange={(e) => setViewPatient(e.target.value)}
              className="font-mono text-xs flex-1"
            />
          </div>

          {policyData ? (
            <div className="rounded-lg bg-muted/20 border border-border divide-y divide-border">
              {[
                {
                  label: "Monthly Premium",
                  value: `${formatEther(policyData.monthlyPremium)} ETH`,
                },
                {
                  label: "Coverage Amount",
                  value: `${formatEther(policyData.coverageAmount)} ETH`,
                },
                { label: "Risk Threshold", value: String(policyData.riskThreshold) },
                {
                  label: "Status",
                  value: policyData.active ? "Active" : "Inactive",
                  highlight: policyData.active ? "text-green-400" : "text-muted-foreground",
                },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className={`text-xs font-medium ${highlight ?? "text-foreground"}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : viewPatient && CONTRACTS_DEPLOYED ? (
            <p className="text-xs text-muted-foreground">No policy found for this address.</p>
          ) : null}
        </div>

        <TxHistoryPanel entries={entries} onClear={clearHistory} />
      </div>
    </div>
  );
}
