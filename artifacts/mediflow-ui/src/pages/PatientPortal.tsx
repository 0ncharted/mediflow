import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toHex } from "viem";
import { useFhevm } from "@/hooks/useFhevm";
import {
  PATIENT_REGISTRY_ADDRESS,
  PATIENT_REGISTRY_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Lock,
  User,
  Activity,
  Pill,
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const MOCK = {
  name: "Alice Chen",
  age: 42n,
  riskScore: 37n,
  conditionFlags: 2n,
  medCount: 2n,
};

const NULL_ADDR = "0x0000000000000000000000000000000000000000" as const;

export default function PatientPortal() {
  const { address, isConnected } = useAccount();
  const { instance, loading: fheLoading, error: fheError } = useFhevm();
  const [providerAddr, setProviderAddr] = useState("");
  const [encStage, setEncStage] = useState<"idle" | "encrypting" | "done">("idle");
  const [handles, setHandles] = useState<string[]>([]);

  const queryAddr = address ?? NULL_ADDR;

  const { data: isEnrolled, refetch: refetchEnrolled } = useReadContract({
    address: PATIENT_REGISTRY_ADDRESS,
    abi: PATIENT_REGISTRY_ABI,
    functionName: "isEnrolled",
    args: [queryAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED },
  });

  const { data: record } = useReadContract({
    address: PATIENT_REGISTRY_ADDRESS,
    abi: PATIENT_REGISTRY_ABI,
    functionName: "getPatientRecord",
    args: [queryAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED && !!isEnrolled },
  });

  const {
    writeContract: register,
    data: registerHash,
    isPending: registering,
    error: registerError,
  } = useWriteContract();
  const { isLoading: registerConfirming, isSuccess: registerSuccess } =
    useWaitForTransactionReceipt({ hash: registerHash });

  const {
    writeContract: grantAccess,
    data: grantHash,
    isPending: granting,
  } = useWriteContract();
  const { isSuccess: grantSuccess } = useWaitForTransactionReceipt({ hash: grantHash });

  const handleEncryptAndRegister = async () => {
    if (!instance || !address) return;
    setEncStage("encrypting");
    try {
      const inputRisk = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputRisk.add64(MOCK.riskScore);
      const encRisk = await inputRisk.encrypt();

      const inputFlags = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputFlags.add64(MOCK.conditionFlags);
      const encFlags = await inputFlags.encrypt();

      const inputAge = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputAge.add64(MOCK.age);
      const encAge = await inputAge.encrypt();

      const inputMed = instance.createEncryptedInput(PATIENT_REGISTRY_ADDRESS, address);
      inputMed.add64(MOCK.medCount);
      const encMed = await inputMed.encrypt();

      setHandles([
        toHex(encRisk.handles[0]),
        toHex(encFlags.handles[0]),
        toHex(encAge.handles[0]),
        toHex(encMed.handles[0]),
      ]);
      setEncStage("done");

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
      console.error("Encryption error:", e);
      setEncStage("idle");
    }
  };

  const handleGrantAccess = () => {
    if (!providerAddr.startsWith("0x")) return;
    grantAccess({
      address: PATIENT_REGISTRY_ADDRESS,
      abi: PATIENT_REGISTRY_ABI,
      functionName: "authorizeProvider",
      args: [providerAddr as `0x${string}`],
    });
  };

  const canRegister =
    isConnected && !!instance && !registering && !registerConfirming && encStage !== "encrypting";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Zama FHEVM v0.11 · Sepolia
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Your Health Record, Encrypted and Private
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Health data is encrypted client-side using fully homomorphic encryption before being
            stored on-chain. Your raw values never appear on the blockchain — providers query
            only with your authorization.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-500/8 border border-amber-500/25 text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Mock patient data:</span> Alice Chen · Age 42 ·
            Risk Score 37/100 · Conditions: borderline hypertension · Medications: 2
          </div>
        </div>

        {!CONTRACTS_DEPLOYED && (
          <div className="p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <p>
              Contracts not yet deployed. Run{" "}
              <code className="font-mono text-xs bg-blue-500/15 px-1 rounded">
                npx hardhat run scripts/deploy.ts --network sepolia
              </code>{" "}
              then set the{" "}
              <code className="font-mono text-xs bg-blue-500/15 px-1 rounded">
                VITE_*_ADDRESS
              </code>{" "}
              env vars.
            </p>
          </div>
        )}

        {isConnected && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-card border border-card-border text-sm">
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
            <span className="text-muted-foreground">
              {fheLoading
                ? "Initializing Zama FHE SDK…"
                : fheError
                  ? `FHE: ${fheError}`
                  : instance
                    ? "FHE SDK ready — client-side encryption available"
                    : "Wallet disconnected"}
            </span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <User className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">On-Chain Status</h2>
            </div>
            {!isConnected ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your wallet to view your enrollment status.
                </p>
                <ConnectButton />
              </div>
            ) : (
              <div className="space-y-0">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs text-muted-foreground">Wallet</span>
                  <span className="text-xs font-mono text-foreground">
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-xs text-muted-foreground">Enrollment</span>
                  {!CONTRACTS_DEPLOYED ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : isEnrolled === undefined ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : isEnrolled ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="h-3 w-3" /> Enrolled
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="h-3 w-3" /> Not enrolled
                    </span>
                  )}
                </div>
                {record && (
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground mb-2">On-chain handles</p>
                    {(["riskScore", "conditionFlags", "age", "medCount"] as const).map((k) => (
                      <div key={k} className="flex items-center gap-2 py-1">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{k}</span>
                        <Lock className="h-3 w-3 text-primary/50 shrink-0" />
                        <span className="text-xs font-mono text-primary/70 truncate">
                          {String((record as Record<string, unknown>)[k]).slice(0, 14)}…
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">
                Health Snapshot{" "}
                <span className="font-normal text-muted-foreground">(mock)</span>
              </h2>
            </div>
            <div className="space-y-0">
              {[
                { label: "Name", value: MOCK.name, icon: User },
                { label: "Age", value: "42 yrs", icon: User },
                {
                  label: "Risk Score",
                  value: "37 / 100",
                  icon: Activity,
                  highlight: "text-green-400",
                },
                { label: "Conditions", value: "Borderline HTN (flag 0x02)", icon: Shield },
                { label: "Medications", value: "2 active", icon: Pill },
              ].map(({ label, value, icon: Icon, highlight }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  <span className={`text-xs font-medium ${highlight ?? "text-foreground"}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Lock className="h-3 w-3" /> All values FHE-encrypted before on-chain storage
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Encrypt & Register On-Chain</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Calls{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">
              PatientRegistry.registerPatient()
            </code>{" "}
            with four separate FHE ciphertexts, each with its own ZK proof.
          </p>

          {handles.length > 0 && (
            <div className="mb-5 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-2">Generated ciphertext handles</p>
              {(["riskScore", "conditionFlags", "age", "medCount"] as const).map((k, i) => (
                <div key={k} className="flex items-center gap-2 py-0.5">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">{k}</span>
                  <span className="text-xs font-mono text-primary truncate">
                    {handles[i]?.slice(0, 24)}…
                  </span>
                </div>
              ))}
            </div>
          )}

          {registerSuccess && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="h-4 w-4" /> Registered on-chain!
              <button
                className="ml-auto text-xs text-primary underline"
                onClick={() => { void refetchEnrolled(); }}
              >
                Refresh status
              </button>
            </div>
          )}
          {registerError && (
            <p className="mb-4 text-xs text-destructive">{registerError.message.slice(0, 120)}</p>
          )}

          <Button
            onClick={() => { void handleEncryptAndRegister(); }}
            disabled={!canRegister || !CONTRACTS_DEPLOYED}
            className="gap-2"
          >
            {encStage === "encrypting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Encrypting with FHE…
              </>
            ) : registering || registerConfirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting tx…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Encrypt & Register
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          {!isConnected && (
            <p className="text-xs text-muted-foreground mt-2">Connect wallet first</p>
          )}
          {isConnected && !instance && !fheLoading && (
            <p className="text-xs text-muted-foreground mt-2">
              Switch to Sepolia testnet to enable FHE
            </p>
          )}
        </div>

        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Authorize a Provider</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Grant a hospital or doctor ACL access to query your encrypted record via{" "}
            <code className="font-mono bg-muted/50 px-1 rounded">authorizeProvider()</code>.
          </p>
          <div className="flex gap-3">
            <Input
              placeholder="0x… provider wallet address"
              value={providerAddr}
              onChange={(e) => setProviderAddr(e.target.value)}
              className="font-mono text-xs flex-1"
            />
            <Button
              onClick={handleGrantAccess}
              disabled={!isConnected || !providerAddr.startsWith("0x") || granting || !CONTRACTS_DEPLOYED}
              variant="outline"
              className="gap-2 shrink-0"
            >
              {granting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : grantSuccess ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : null}
              {grantSuccess ? "Authorized!" : "Authorize"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
