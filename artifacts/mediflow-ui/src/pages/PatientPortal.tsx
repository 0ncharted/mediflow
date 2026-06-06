import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toHex, formatEther } from "viem";
import { useFhevm } from "@/hooks/useFhevm";
import {
  PATIENT_REGISTRY_ADDRESS,
  PATIENT_REGISTRY_ABI,
  INSURANCE_MODULE_ADDRESS,
  INSURANCE_MODULE_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { TransactionToast, type TxStatus } from "@/components/TransactionToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Lock,
  User,
  Activity,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  FileText,
  UserPlus,
  Ban,
} from "lucide-react";

const NULL_ADDR = "0x0000000000000000000000000000000000000000" as const;

const CONDITIONS = [
  { label: "Diabetes", bit: 1 },
  { label: "Hypertension", bit: 2 },
  { label: "Cardiac History", bit: 4 },
];

interface ProviderEntry {
  address: string;
  grantedAt: string;
}

export default function PatientPortal() {
  const { address, isConnected } = useAccount();
  const { instance, loading: fheLoading, error: fheError } = useFhevm();

  const [riskScore, setRiskScore] = useState(37);
  const [conditionFlags, setConditionFlags] = useState(2);
  const [age, setAge] = useState(42);
  const [medCount, setMedCount] = useState(2);

  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const [providerInput, setProviderInput] = useState("");
  const [providers, setProviders] = useState<ProviderEntry[]>([]);

  const queryAddr = (address ?? NULL_ADDR) as `0x${string}`;

  const { data: isEnrolled, refetch: refetchEnrolled } = useReadContract({
    address: PATIENT_REGISTRY_ADDRESS,
    abi: PATIENT_REGISTRY_ABI,
    functionName: "isEnrolled",
    args: [queryAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED },
  });

  const {
    writeContract: register,
    data: registerHash,
    isPending: registering,
    error: registerError,
    reset: resetRegister,
  } = useWriteContract();
  const { isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerHash });

  const {
    writeContract: grantAccess,
    data: grantHash,
    isPending: granting,
    error: grantError,
  } = useWriteContract();
  const { isSuccess: grantSuccess } = useWaitForTransactionReceipt({ hash: grantHash });

  const { data: policy } = useReadContract({
    address: INSURANCE_MODULE_ADDRESS,
    abi: INSURANCE_MODULE_ABI,
    functionName: "getPolicy",
    args: [queryAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED },
  });

  useEffect(() => {
    if (registerSuccess) {
      setTxStatus("success");
      void refetchEnrolled();
    }
  }, [registerSuccess, refetchEnrolled]);

  useEffect(() => {
    if (registerError && txStatus !== "idle") {
      setTxStatus("error");
      setTxError(registerError.message.slice(0, 200));
    }
  }, [registerError, txStatus]);

  const [lastGrantAddr, setLastGrantAddr] = useState("");
  useEffect(() => {
    if (grantSuccess && lastGrantAddr) {
      setProviders((p) => [
        ...p,
        { address: lastGrantAddr, grantedAt: new Date().toLocaleDateString() },
      ]);
      setLastGrantAddr("");
      setProviderInput("");
    }
  }, [grantSuccess, lastGrantAddr]);

  const handleEncryptAndStore = async () => {
    if (!instance || !address) return;
    setTxStatus("encrypting");
    setTxError(null);
    resetRegister();
    try {
      const inputRisk = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputRisk.add64(BigInt(riskScore));
      const encRisk = await inputRisk.encrypt();

      const inputFlags = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputFlags.add64(BigInt(conditionFlags));
      const encFlags = await inputFlags.encrypt();

      const inputAge = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputAge.add64(BigInt(age));
      const encAge = await inputAge.encrypt();

      const inputMed = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputMed.add64(BigInt(medCount));
      const encMed = await inputMed.encrypt();

      setTxStatus("submitting");
      register({
        address: PATIENT_REGISTRY_ADDRESS,
        abi: PATIENT_REGISTRY_ABI,
        functionName: "registerPatient",
        args: [
          toHex(encRisk.handles[0]),
          toHex(encRisk.inputProof),
          toHex(encFlags.handles[0]),
          toHex(encFlags.inputProof),
          toHex(encAge.handles[0]),
          toHex(encAge.inputProof),
          toHex(encMed.handles[0]),
          toHex(encMed.inputProof),
        ],
      });
    } catch (e) {
      setTxStatus("error");
      setTxError(e instanceof Error ? e.message : "Encryption failed");
    }
  };

  const handleGrantAccess = () => {
    if (!providerInput.startsWith("0x")) return;
    setLastGrantAddr(providerInput);
    grantAccess({
      address: PATIENT_REGISTRY_ADDRESS,
      abi: PATIENT_REGISTRY_ABI,
      functionName: "authorizeProvider",
      args: [providerInput as `0x${string}`],
    });
  };

  const toggleCondition = (bit: number) => {
    setConditionFlags((f) => f ^ bit);
  };

  const policyData = policy as
    | { monthlyPremium: bigint; coverageAmount: bigint; riskThreshold: bigint; active: boolean }
    | undefined;

  const activeConditionLabels = CONDITIONS.filter((c) => conditionFlags & c.bit).map(
    (c) => c.label,
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Zama FHEVM v0.11 · Sepolia Testnet
            </span>
            {isConnected && (
              <span className="text-xs font-mono text-muted-foreground">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Patient Health Portal
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Your health attributes are encrypted with FHE before being stored on-chain.
            Raw values never leave your browser. Providers see only the computed result.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-500/8 border border-amber-500/25 text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>All data is mock/synthetic — no real patient records.</strong> This is a
            demo of Zama FHEVM on Sepolia testnet.
          </span>
        </div>

        {!isConnected && (
          <div className="flex items-center justify-between p-5 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to manage your encrypted health record
            </p>
            <ConnectButton />
          </div>
        )}

        {isConnected && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-card border border-card-border text-sm">
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                fheLoading
                  ? "bg-yellow-400 animate-pulse"
                  : fheError
                    ? "bg-red-500"
                    : instance
                      ? "bg-green-400"
                      : "bg-muted-foreground"
              }`}
            />
            <span className="text-muted-foreground text-xs">
              {fheLoading
                ? "Initializing Zama FHE SDK…"
                : fheError
                  ? `FHE: ${fheError}`
                  : instance
                    ? "FHE SDK ready — encryption runs entirely in your browser"
                    : "FHE SDK not initialized"}
            </span>
            {isEnrolled !== undefined && (
              <span
                className={`ml-auto text-xs font-medium ${isEnrolled ? "text-green-400" : "text-muted-foreground"}`}
              >
                {isEnrolled ? "✓ Enrolled on-chain" : "Not yet enrolled"}
              </span>
            )}
          </div>
        )}

        {/* ──────────────────────────── SECTION A ──────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
              A
            </div>
            <h2 className="text-base font-semibold text-foreground">Register / Update Record</h2>
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6 space-y-6">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                General Health Risk Score
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                0 = healthy, 100 = high risk
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={riskScore}
                  onChange={(e) => setRiskScore(Number(e.target.value))}
                  className="flex-1 accent-primary h-2"
                />
                <div className="flex items-center gap-1 w-20">
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      riskScore < 40
                        ? "text-green-400"
                        : riskScore < 70
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {riskScore}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Healthy</span>
                <span>Moderate</span>
                <span>High Risk</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-3 block">
                Medical Conditions
              </label>
              <div className="flex flex-wrap gap-3">
                {CONDITIONS.map(({ label, bit }) => (
                  <label
                    key={label}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                      conditionFlags & bit
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!(conditionFlags & bit)}
                      onChange={() => toggleCondition(bit)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    {label}
                  </label>
                ))}
                <label
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                    conditionFlags === 0
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={conditionFlags === 0}
                    onChange={() => setConditionFlags(0)}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  None
                </label>
              </div>
              {activeConditionLabels.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Bitmask:{" "}
                  <code className="font-mono bg-muted/50 px-1 rounded">{conditionFlags}</code>
                  {" — "}
                  {activeConditionLabels.join(", ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Age</label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Medication Count
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={medCount}
                    onChange={(e) => setMedCount(Number(e.target.value))}
                    className="flex-1 accent-primary h-2"
                  />
                  <span className="text-sm font-bold text-foreground w-6 text-right tabular-nums">
                    {medCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <TransactionToast
                status={txStatus}
                encryptingMessage="Encrypting your data locally… (4 separate FHE ciphertexts)"
                submittingMessage="Submitting to Sepolia…"
                successMessage="✅ Encrypted record stored on-chain. Your raw data never left your device."
                errorMessage={txError}
              />

              <Button
                onClick={() => { void handleEncryptAndStore(); }}
                disabled={
                  !isConnected ||
                  !instance ||
                  registering ||
                  txStatus === "encrypting" ||
                  txStatus === "submitting" ||
                  !CONTRACTS_DEPLOYED
                }
                className="w-full gap-2 h-11 text-sm font-semibold"
                size="lg"
              >
                <Lock className="h-4 w-4" />
                Encrypt & Store on Chain
                <ChevronRight className="h-4 w-4 ml-auto" />
              </Button>
              {!isConnected && (
                <p className="text-xs text-center text-muted-foreground">
                  Connect wallet to encrypt and register
                </p>
              )}
              {isConnected && !instance && !fheLoading && (
                <p className="text-xs text-center text-muted-foreground">
                  Switch to Sepolia to enable FHE encryption
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ──────────────────────────── SECTION B ──────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
              B
            </div>
            <h2 className="text-base font-semibold text-foreground">Authorized Providers</h2>
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6 space-y-4">
            <p className="text-xs text-muted-foreground">
              Grant hospitals or doctors ACL access to query your encrypted record via{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">authorizeProvider()</code>.
            </p>

            <div className="flex gap-3">
              <Input
                placeholder="0x… provider wallet address"
                value={providerInput}
                onChange={(e) => setProviderInput(e.target.value)}
                className="font-mono text-xs flex-1"
              />
              <Button
                onClick={handleGrantAccess}
                disabled={
                  !isConnected ||
                  !providerInput.startsWith("0x") ||
                  granting ||
                  !CONTRACTS_DEPLOYED
                }
                variant="outline"
                className="gap-2 shrink-0"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {granting ? "Granting…" : "Grant Access"}
              </Button>
            </div>
            {grantError && (
              <p className="text-xs text-destructive">{grantError.message.slice(0, 120)}</p>
            )}

            {providers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                No providers authorized yet
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => (
                  <div
                    key={p.address}
                    className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/20 border border-border"
                  >
                    <div>
                      <p className="text-xs font-mono text-foreground">{p.address}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Authorized on {p.grantedAt}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground gap-1.5"
                      title="Revocation coming in v2 — requires ACL update"
                      disabled
                    >
                      <Ban className="h-3 w-3" /> Revoke
                      <span className="text-xs text-muted-foreground">(post-MVP)</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ──────────────────────────── SECTION C ──────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
              C
            </div>
            <h2 className="text-base font-semibold text-foreground">Your Policies</h2>
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6">
            {!isConnected ? (
              <p className="text-sm text-muted-foreground">Connect wallet to view your policies.</p>
            ) : !CONTRACTS_DEPLOYED ? (
              <p className="text-sm text-muted-foreground">
                Deploy contracts to see active insurance policies.
              </p>
            ) : !policyData || !policyData.active ? (
              <div className="py-6 text-center space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-sm text-muted-foreground">No active policies found.</p>
                <p className="text-xs text-muted-foreground">
                  An insurer can create a policy for you via the Insurance page.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">Active Policy</span>
                </div>
                {[
                  {
                    label: "Monthly Premium",
                    value: `${formatEther(policyData.monthlyPremium)} ETH`,
                  },
                  {
                    label: "Coverage Amount",
                    value: `${formatEther(policyData.coverageAmount)} ETH`,
                  },
                  {
                    label: "Risk Threshold",
                    value: String(policyData.riskThreshold),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-medium text-foreground">{value}</span>
                  </div>
                ))}
                <div className="mt-3">
                  <Button variant="ghost" size="sm" className="text-xs text-primary gap-1.5">
                    <Activity className="h-3 w-3" /> View Claim History
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
