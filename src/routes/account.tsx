import { createFileRoute } from "@tanstack/react-router";
import { MobileLayout } from "@/components/MobileLayout";
import { User } from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account — Sellier Knightsbridge" },
      { name: "description", content: "Your Sellier account." },
    ],
  }),
  component: Account,
});

function Account() {
  return (
    <MobileLayout>
      <div className="px-6 py-16 text-center">
        <div className="h-14 w-14 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-2xl mb-2">Account</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Sign-in, saved pieces and order history are coming next. Tell us when you're
          ready to add them.
        </p>
      </div>
    </MobileLayout>
  );
}
