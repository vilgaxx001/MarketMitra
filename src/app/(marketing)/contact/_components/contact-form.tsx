"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { track } from "@/lib/analytics/track";

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "billing", label: "Billing" },
  { value: "bug-report", label: "Report a bug" },
  { value: "agency-plan", label: "Agency plan / sales" },
  { value: "press", label: "Press" },
] as const;

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm({ initialTopic }: { initialTopic?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(
    TOPICS.some((t) => t.value === initialTopic) ? initialTopic! : "general"
  );
  const [message, setMessage] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      if (!res.ok) {
        const body = await res.json();
        setErrorMessage(body.error?.message ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      track("contact_submit", { topic });
      setState("success");
    } catch {
      setErrorMessage("Couldn't reach the server. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <Alert variant="success">
        <AlertTitle>Message sent</AlertTitle>
        <AlertDescription>
          Thanks for reaching out — we&apos;ll get back to you at {email}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="topic">Topic</Label>
        <select
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t send that</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" disabled={state === "submitting"} className="w-full">
        {state === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending…
          </>
        ) : (
          "Send message"
        )}
      </Button>
    </form>
  );
}
