import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, User, Sparkles } from "lucide-react";
import { CartDrawer, CartButton } from "./CartDrawer";
import { useCartSync } from "@/hooks/useCartSync";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shop", label: "Shop", icon: Search },
  { to: "/edits", label: "Edits", icon: Sparkles },
  { to: "/account", label: "Account", icon: User },
] as const;

export function MobileLayout({ children }: { children: ReactNode }) {
  const [cartOpen, setCartOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useCartSync();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="w-10" />
          <Link to="/" className="font-serif text-2xl tracking-[0.3em] leading-none">
            SELLIER
          </Link>
          <div className="w-10 flex justify-end">
            <CartButton onClick={() => setCartOpen(true)} />
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-1 py-3 text-[10px] uppercase tracking-widest transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}
