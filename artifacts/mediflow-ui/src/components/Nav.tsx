import { Link, useLocation } from "wouter";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Shield } from "lucide-react";

const LINKS = [
  { href: "/", label: "Patient Portal" },
  { href: "/hospital", label: "Hospital Query" },
  { href: "/insurance", label: "Insurance" },
  { href: "/research", label: "Research" },
];

export default function Nav() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold text-foreground text-sm">MediFlow</span>
        </Link>

        <nav className="flex items-center gap-0.5 flex-1">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                location === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </header>
  );
}
