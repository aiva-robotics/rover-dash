import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Images, Trash2, X } from "lucide-react";
import type { GalleryPhoto } from "@/hooks/usePhotoGallery";
import { downloadBlob, photoFileName } from "@/lib/photoStore";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  photos: GalleryPhoto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

function formatStamp(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PhotoGallery({ photos, open, onOpenChange, onRemove, onClear }: Props) {
  const { t, locale } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = photos.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    if (!open) setActiveId(null);
  }, [open]);

  useEffect(() => {
    if (activeId && !photos.some((p) => p.id === activeId)) setActiveId(null);
  }, [photos, activeId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="glass-panel fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 p-4 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="flex items-center justify-between gap-2">
            <Dialog.Title className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              <Images className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t("gallery.title")}</span>
              <span className="text-foreground">({photos.length})</span>
            </Dialog.Title>
            <div className="flex items-center gap-2">
              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                >
                  {t("gallery.clear")}
                </button>
              )}
              <Dialog.Close
                aria-label={t("common.close")}
                className="grid h-8 w-8 place-items-center rounded-md border border-border/60 transition-colors hover:text-primary"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">
            {t("gallery.description")}
          </Dialog.Description>

          {photos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("gallery.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setActiveId(photo.id)}
                  className={cn(
                    "group overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-left transition-colors hover:border-primary/60",
                  )}
                >
                  <img
                    src={photo.url}
                    alt={t("gallery.thumbAlt", { stamp: formatStamp(photo.takenAt, locale) })}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <span className="block px-2 py-1 font-mono text-[0.65rem] text-muted-foreground">
                    {formatStamp(photo.takenAt, locale)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {active && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <img
                src={active.url}
                alt={t("gallery.previewAlt", { stamp: formatStamp(active.takenAt, locale) })}
                className="max-h-[40vh] w-full rounded-lg object-contain"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {formatStamp(active.takenAt, locale)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadBlob(active.blob, photoFileName(active.takenAt))}
                    className="flex items-center gap-1.5 rounded-md border border-primary/50 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("gallery.download")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(active.id)}
                    className="flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("gallery.delete")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
