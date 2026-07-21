"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, DocumentRegular } from "@fluentui/react-icons";
import { useState } from "react";

import type { PollAttachment } from "@/lib/client/types";
import styles from "./PollAttachmentLinks.module.css";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PollAttachmentLinks({
  pollId,
  attachments,
  emptyLabel = "—",
}: {
  pollId: string;
  attachments: PollAttachment[];
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<PollAttachment | null>(null);

  if (attachments.length === 0) return <span className={styles.empty}>{emptyLabel}</span>;

  const fileUrl = selected
    ? `/api/polls/${encodeURIComponent(pollId)}/attachments/${encodeURIComponent(selected.id)}`
    : "";

  return (
    <>
      <div className={styles.links} aria-label="投票附件">
        {attachments.map((attachment) => (
          <button
            className={styles.link}
            key={attachment.id}
            type="button"
            title={`${attachment.name}（${formatFileSize(attachment.sizeBytes)}）`}
            onClick={() => setSelected(attachment)}
          >
            <DocumentRegular aria-hidden="true" />
            <span>{attachment.name}</span>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(_, data) => { if (!data.open) setSelected(null); }}>
        <DialogSurface className={styles.dialog}>
          <DialogBody>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogContent className={styles.content}>
              {selected && (
                <iframe
                  className={styles.preview}
                  key={selected.id}
                  src={`${fileUrl}?preview=1`}
                  title={`${selected.name} 预览`}
                />
              )}
            </DialogContent>
            <DialogActions className={styles.actions}>
              {selected && (
                <Button
                  as="a"
                  href={fileUrl}
                  icon={<ArrowDownloadRegular />}
                  appearance="secondary"
                >
                  下载原文件
                </Button>
              )}
              <Button appearance="primary" onClick={() => setSelected(null)}>关闭</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
