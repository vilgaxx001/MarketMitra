"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Loader2, MoreVertical, Mail, X, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { inviteMemberSchema, type InviteMemberInput } from "@/modules/team/validators";
import type { WorkspaceMemberDTO, TeamInviteDTO } from "@/modules/team/types";
import type { WorkspaceRole } from "@prisma/client";

export function TeamPageClient({
  workspaceSlug,
  currentUserId,
  initialMembers,
  initialInvites,
  canManage,
}: {
  workspaceSlug: string;
  currentUserId: string;
  initialMembers: WorkspaceMemberDTO[];
  initialInvites: TeamInviteDTO[];
  canManage: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function changeRole(userId: string, role: WorkspaceRole) {
    setBusy(userId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/team/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
        toast.success("Role updated");
      } else {
        const json = await res.json();
        toast.error(json.error?.message ?? "Couldn't update role");
      }
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string) {
    setBusy(userId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/team/members/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        toast.success("Member removed");
      } else {
        const json = await res.json();
        toast.error(json.error?.message ?? "Couldn't remove member");
      }
    } finally {
      setBusy(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setBusy(inviteId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/team/invites/${inviteId}/resend`, { method: "POST" });
      if (res.ok) toast.success("Invitation resent");
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusy(inviteId);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/team/invites/${inviteId}/revoke`, { method: "POST" });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        toast.success("Invitation revoked");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" /> Invite member
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.userId}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarImage src={m.avatarUrl ?? undefined} />
                    <AvatarFallback>{m.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}{m.userId === currentUserId && " (you)"}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canManage ? (
                  <Select value={m.role} onValueChange={(v) => changeRole(m.userId, v as WorkspaceRole)} disabled={busy === m.userId}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                      <SelectItem value="CLIENT">Client</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="default">{m.role.replace("_", " ")}</Badge>
                )}
              </TableCell>
              <TableCell>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={busy === m.userId}>
                        {busy === m.userId ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => removeMember(m.userId)} className="text-destructive">
                        Remove from workspace
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {canManage && invites.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Pending invitations</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="glass flex items-center justify-between rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {inv.role.replace("_", " ")} by {inv.invitedByName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => resendInvite(inv.id)} disabled={busy === inv.id}>
                    <RotateCw className="size-3.5" /> Resend
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => revokeInvite(inv.id)} disabled={busy === inv.id}>
                    <X className="size-3.5" /> Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceSlug={workspaceSlug}
        onInvited={(invite) => setInvites((prev) => [invite, ...prev])}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  workspaceSlug,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  onInvited: (invite: TeamInviteDTO) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<InviteMemberInput>({ resolver: zodResolver(inviteMemberSchema), defaultValues: { role: "TEAM_MEMBER" } });

  async function onSubmit(data: InviteMemberInput) {
    const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/team/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (res.ok) {
      onInvited(json.data);
      toast.success("Invitation sent");
      reset();
      onOpenChange(false);
    } else {
      toast.error(json.error?.message ?? "Couldn't send invitation");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div>
            <Label>Role</Label>
            <Select value={watch("role")} onValueChange={(v) => setValue("role", v as WorkspaceRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                <SelectItem value="CLIENT">Client</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
