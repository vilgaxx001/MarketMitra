"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "accepting" | "success" | "error";

export function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("accepting");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const res = await fetch("/api/v1/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (cancelled) return;

      if (res.ok) {
        setState("success");
        setTimeout(() => router.push(`/${json.data.workspaceSlug}/dashboard`), 1200);
      } else {
        setState("error");
        setMessage(json.error?.message ?? "This invitation link isn't valid.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state === "accepting") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="size-8 animate-spin text-secondary" />
        <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm text-foreground">You&apos;re in! Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <XCircle className="size-8 text-destructive" />
      <p className="text-sm text-foreground">{message}</p>
      <Button variant="outline" onClick={() => router.push("/")}>
        Back to home
      </Button>
    </div>
  );
}
