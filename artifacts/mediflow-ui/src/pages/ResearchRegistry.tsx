import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes, toHex } from "viem";
import {
  RESEARCH_REGISTRY_ADDRESS,
  RESEARCH_REGISTRY_ABI,
  CONTRACTS_DEPLOYED,
} from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FlaskConical,
  Users,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Info,
  Lock,
} from "lucide-react";

const NULL_ADDR = "0x0000000000000000000000000000000000000000" as const;

export default function ResearchRegistry() {
  const { address, isConnected } = useAccount();

  const [lookupAddr, setLookupAddr] = useState("");
  const [cohortName, setCohortName] = useState("");
  const [cohortPatients, setCohortPatients] = useState("");

  const queryLookup = (lookupAddr.startsWith("0x") && lookupAddr.length === 42
    ? lookupAddr
    : NULL_ADDR) as `0x${string}`;

  const { data: institutionData } = useReadContract({
    address: RESEARCH_REGISTRY_ADDRESS,
    abi: RESEARCH_REGISTRY_ABI,
    functionName: "institutions",
    args: [queryLookup],
    query: {
      enabled: !!lookupAddr && lookupAddr.startsWith("0x") && CONTRACTS_DEPLOYED,
    },
  });

  const { data: cohortCount } = useReadContract({
    address: RESEARCH_REGISTRY_ADDRESS,
    abi: RESEARCH_REGISTRY_ABI,
    functionName: "getCohortCount",
    args: [queryLookup],
    query: {
      enabled: !!lookupAddr && lookupAddr.startsWith("0x") && CONTRACTS_DEPLOYED,
    },
  });

  const myAddr = (address ?? NULL_ADDR) as `0x${string}`;
  const { data: myIsApproved } = useReadContract({
    address: RESEARCH_REGISTRY_ADDRESS,
    abi: RESEARCH_REGISTRY_ABI,
    functionName: "isApproved",
    args: [myAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED },
  });

  const { data: myCohortCount } = useReadContract({
    address: RESEARCH_REGISTRY_ADDRESS,
    abi: RESEARCH_REGISTRY_ABI,
    functionName: "getCohortCount",
    args: [myAddr],
    query: { enabled: isConnected && CONTRACTS_DEPLOYED },
  });

  const {
    writeContract: registerCohort,
    data: cohortHash,
    isPending: cohortPending,
    error: cohortError,
  } = useWriteContract();
  const { isLoading: cohortConfirming, isSuccess: cohortSuccess } =
    useWaitForTransactionReceipt({ hash: cohortHash });

  const handleRegisterCohort = () => {
    if (!address || !cohortName.trim()) return;
    const patients = cohortPatients
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("0x") && s.length === 42) as `0x${string}`[];
    if (patients.length === 0) return;

    const cohortId = keccak256(toBytes(cohortName + address + Date.now()));

    registerCohort({
      address: RESEARCH_REGISTRY_ADDRESS,
      abi: RESEARCH_REGISTRY_ABI,
      functionName: "registerCohort",
      args: [address as `0x${string}`, cohortId, patients],
    });
  };

  const inst = institutionData as
    | [string, string, boolean, bigint]
    | undefined;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground border border-muted-foreground/25 rounded-full px-2.5 py-0.5">
              Research Institution Role
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Privacy-Preserving Research
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
            Approved institutions register patient cohorts and run aggregate FHE queries.
            Individual values remain encrypted — only statistical summaries are computed.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {!isConnected && (
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-card-border">
            <p className="text-sm text-muted-foreground">Connect wallet to manage research</p>
            <ConnectButton />
          </div>
        )}

        {!CONTRACTS_DEPLOYED && (
          <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-500/8 border border-blue-500/25 text-blue-300 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Deploy contracts first. Interface shown for preview.</span>
          </div>
        )}

        {isConnected && CONTRACTS_DEPLOYED && (
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                label: "Institution Status",
                value: myIsApproved === undefined
                  ? "—"
                  : myIsApproved
                    ? "Approved"
                    : "Not approved",
                highlight: myIsApproved ? "text-green-400" : "text-muted-foreground",
                icon: myIsApproved ? CheckCircle : XCircle,
              },
              {
                label: "Your Cohorts",
                value: myCohortCount !== undefined ? String(myCohortCount) : "—",
                highlight: "text-foreground",
                icon: Users,
              },
              {
                label: "Protocol",
                value: "Zama FHEVM v0.11",
                highlight: "text-primary",
                icon: Lock,
              },
            ].map(({ label, value, highlight, icon: Icon }) => (
              <div key={label} className="rounded-xl bg-card border border-card-border p-5">
                <Icon className="h-4 w-4 text-muted-foreground mb-3" />
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-lg font-semibold ${highlight}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Institution Lookup</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Reads{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">institutions(address)</code>{" "}
              to check approval status, purpose, and query count.
            </p>
            <Input
              placeholder="0x… institution address"
              value={lookupAddr}
              onChange={(e) => setLookupAddr(e.target.value)}
              className="font-mono text-xs mb-4"
            />

            {inst ? (
              inst[2] || inst[0] ? (
                <div className="rounded-lg bg-muted/20 border border-border divide-y divide-border">
                  {[
                    { label: "Name", value: inst[0] || "(not set)" },
                    { label: "Purpose", value: inst[1] || "(not set)" },
                    {
                      label: "Approved",
                      value: inst[2] ? "Yes" : "No",
                      highlight: inst[2] ? "text-green-400" : "text-muted-foreground",
                    },
                    { label: "Query Count", value: String(inst[3]) },
                    {
                      label: "Cohorts",
                      value: cohortCount !== undefined ? String(cohortCount) : "—",
                    },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className={`text-xs font-medium ${highlight ?? "text-foreground"}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No institution found for this address.
                </p>
              )
            ) : lookupAddr && CONTRACTS_DEPLOYED ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="rounded-xl bg-card border border-card-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Register a Cohort</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Calls{" "}
              <code className="font-mono bg-muted/50 px-1 rounded">registerCohort(institution, cohortId, patients[])</code>.
              Requires your institution to be approved first (owner action).
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Cohort Name / Label
                </label>
                <Input
                  placeholder="e.g. Diabetes-Cohort-2026"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  className="text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used to derive cohortId via keccak256
                </p>
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

            {cohortSuccess && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" /> Cohort registered on-chain
              </div>
            )}
            {cohortError && (
              <p className="mt-3 text-xs text-destructive">
                {cohortError.message.slice(0, 100)}
              </p>
            )}

            <Button
              onClick={handleRegisterCohort}
              disabled={
                !isConnected ||
                !cohortName.trim() ||
                !cohortPatients.trim() ||
                cohortPending ||
                cohortConfirming ||
                !CONTRACTS_DEPLOYED
              }
              className="mt-4 w-full gap-2"
            >
              {cohortPending || cohortConfirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Registering cohort…</>
              ) : (
                <><Users className="h-4 w-4" /> Register Cohort</>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-card-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">How It Works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                step: "1",
                title: "Institution Approval",
                body: "The registry owner approves a research institution on-chain, binding its name and stated research purpose.",
              },
              {
                step: "2",
                title: "Cohort Registration",
                body: "The approved institution registers a cohort — a list of consenting patient wallets — identified by a deterministic bytes32 cohortId.",
              },
              {
                step: "3",
                title: "Encrypted Aggregate Queries",
                body: "HealthQueryEngine.runAggregateQuery() sums encrypted attributes across the cohort using FHE addition. No individual values are revealed.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                    {step}
                  </span>
                  <h3 className="text-sm font-medium text-foreground">{title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
