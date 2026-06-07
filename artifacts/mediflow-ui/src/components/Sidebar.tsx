import { Link, useLocation } from "wouter";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Shield } from "lucide-react";
import { RelayerDot } from "@/components/RelayerDot";

const LINKS = [
  { href: "/", label: "Patient Portal", emoji: "🏥" },
  { href: "/hospital", label: "Provider Dashboard", emoji: "👨‍⚕️" },
  { href: "/insurance", label: "Insurance", emoji: "🛡️" },
  { href: "/research", label: "Research", emoji: "🔬" },
  { href: "/admin", label: "Admin", emoji: "⚙️" },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-60 min-h-screen bg-[#111827] flex flex-col shrink-0 sticky top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#0b7a45]">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight">MediFlow</span>
        </Link>
        <p className="text-gray-500 text-xs mt-2 leading-snug">
          Confidential Health Records
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {LINKS.map(({ href, label, emoji }) => {
          const isActive = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-[#0b7a45] text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-white/8"
              }`}
            >
              <span className="text-base leading-none select-none">{emoji}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* FHE Status + Wallet */}
      <div className="px-4 pb-5 pt-3 border-t border-white/10 space-y-3">
        <RelayerDot />
        <ConnectButton chainStatus="icon" showBalance={false} />
        <p className="text-xs text-gray-600">FHEVM v0.11 · Sepolia Testnet</p>
      </div>
    </aside>
  );
}
