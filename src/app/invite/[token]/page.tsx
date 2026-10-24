import type { Metadata } from "next";
import { InviteAcceptClient } from "./_components/invite-accept-client";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="glass rounded-xl p-6">
          <InviteAcceptClient token={token} />
        </div>
      </div>
    </div>
  );
}
