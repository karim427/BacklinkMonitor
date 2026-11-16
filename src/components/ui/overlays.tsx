import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import * as M from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, X } from "lucide-react";
import { Button } from "./primitives";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-xl", wide ? "max-w-2xl" : "max-w-md")}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div><D.Title className="text-base font-semibold">{title}</D.Title>
              <D.Description className="mt-0.5 text-sm text-zinc-500">{description ?? " "}</D.Description></div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button></D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Drawer({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <D.Title className="text-base font-semibold">{title}</D.Title>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button></D.Close>
          </div>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Delete", onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); } }}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; hidden?: boolean }
export function RowMenu({ items }: { items: MenuItem[] }) {
  return (
    <M.Root>
      <M.Trigger asChild><Button variant="ghost" size="icon" aria-label="Row actions"><MoreHorizontal className="h-4 w-4" /></Button></M.Trigger>
      <M.Portal>
        <M.Content align="end" className="z-50 min-w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
          {items.filter((i) => !i.hidden).map((i) => (
            <M.Item key={i.label} onSelect={i.onSelect} className={cn("cursor-pointer rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-zinc-100", i.danger && "text-red-600")}>{i.label}</M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
