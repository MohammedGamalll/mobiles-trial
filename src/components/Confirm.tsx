import { useState, type ReactNode } from "react";
import { useApp } from "../context";
import { Btn, Modal } from "./ui";

export function ConfirmDialog({
  open,
  title,
  message,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { tr } = useApp();
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-slate-600">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Btn kind="ghost" disabled={busy} onClick={onClose}>{tr("cancel")}</Btn>
        <Btn kind="danger" disabled={busy} onClick={onConfirm}>{tr("confirm")}</Btn>
      </div>
    </Modal>
  );
}

export function useConfirm() {
  const { tr } = useApp();
  const [job, setJob] = useState<{ title: string; message: string; run: () => Promise<void> | void } | null>(null);
  const [busy, setBusy] = useState(false);

  function confirm(title: string, message: string, run: () => Promise<void> | void) {
    setJob({ title, message, run });
  }

  function confirmDelete(name: string, run: () => Promise<void> | void) {
    confirm(tr("delete"), `${tr("deleteConfirm")}${name ? `\n${name}` : ""}`, run);
  }

  const dialog: ReactNode = (
    <ConfirmDialog
      open={!!job}
      title={job?.title || ""}
      message={job?.message || ""}
      busy={busy}
      onClose={() => { if (!busy) setJob(null); }}
      onConfirm={async () => {
        if (!job) return;
        setBusy(true);
        try {
          await job.run();
        } finally {
          setBusy(false);
          setJob(null);
        }
      }}
    />
  );

  return { confirm, confirmDelete, dialog };
}

export function ActionBtns({
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { tr } = useApp();
  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && onEdit ? <button type="button" className="text-sm font-bold text-cyan-700" onClick={onEdit}>{tr("edit")}</button> : null}
      {canDelete && onDelete ? <button type="button" className="text-sm font-bold text-rose-600" onClick={onDelete}>{tr("delete")}</button> : null}
    </div>
  );
}
