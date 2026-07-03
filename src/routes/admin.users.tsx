import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileLayout } from "@/components/MobileLayout";
import { useAuth } from "@/hooks/useAuth";
import { listAllUsers } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Crown, Shield } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Sellier Admin" },
      { name: "description", content: "Directory of all Sellier app users." },
    ],
  }),
  component: UsersPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button className="mt-4" onClick={() => { router.invalidate(); reset(); }}>
          Try again
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function UsersPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const fetchUsers = useServerFn(listAllUsers);
  const [filter, setFilter] = useState<"all" | "sellier">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { next: "/admin/users" } });
  }, [loading, user, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users", filter],
    queryFn: () => fetchUsers({ data: { filter } }),
    enabled: !!user && isAdmin,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading || (user && isAdmin && isLoading)) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </MobileLayout>
    );
  }

  if (user && !isAdmin) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center">
          <h1 className="font-serif text-2xl mb-2">Admins only</h1>
          <Link to="/account"><Button className="mt-4">Back</Button></Link>
        </div>
      </MobileLayout>
    );
  }

  if (error) {
    return (
      <MobileLayout>
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          {error.message}
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-6 pt-8 pb-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">Admin</p>
        <h1 className="font-serif text-3xl">Users</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {data?.users.length ?? 0} {filter === "sellier" ? "Sellier team member" : "user"}
          {(data?.users.length ?? 0) === 1 ? "" : "s"}
        </p>
      </div>

      <div className="px-6 py-4 flex gap-2 border-b border-border/60">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
          className="flex-1 text-[10px] uppercase tracking-[0.2em]"
        >
          All users
        </Button>
        <Button
          size="sm"
          variant={filter === "sellier" ? "default" : "outline"}
          onClick={() => setFilter("sellier")}
          className="flex-1 text-[10px] uppercase tracking-[0.2em]"
        >
          Sellier team
        </Button>
      </div>

      <div className="px-6 py-3 border-b border-border/60">
        <Input
          placeholder="Search email or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          No users found.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {filtered.map((u) => (
            <div key={u.id} className="px-6 py-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm truncate">{u.email}</span>
                {u.roles.includes("admin") && (
                  <span title="Admin" className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground border border-border/60 px-1.5 py-0.5">
                    <Shield className="h-2.5 w-2.5" /> Admin
                  </span>
                )}
                {u.roles.includes("shopper") && (
                  <span title="Shopper" className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground border border-border/60 px-1.5 py-0.5">
                    <Crown className="h-2.5 w-2.5" /> Shopper
                  </span>
                )}
              </div>
              {u.fullName && (
                <p className="text-xs text-muted-foreground mt-0.5">{u.fullName}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Joined {new Date(u.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </MobileLayout>
  );
}
