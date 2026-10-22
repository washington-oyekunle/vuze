import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
];
const MAX = 25 * 1024 * 1024;
export type AnalyticsProof = { id: string; url: string; contentType: string };

type Prepared = {
  id?: string;
  pathname?: string;
  signedUploadUrl?: string;
  error?: string;
};
export function AnalyticsProofUpload({
  value,
  onChange,
  disabled = false,
}: {
  value: AnalyticsProof | null;
  onChange: (proof: AnalyticsProof | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file?: File) {
    if (!file || busy || disabled) return;
    setError("");
    if (!ACCEPT.includes(file.type)) {
      setError("Use a PNG, JPEG, WEBP, MP4, or WebM file.");
      return;
    }
    if (!file.size || file.size > MAX) {
      setError("Proof must be nonempty and 25 MB or smaller.");
      return;
    }
    setBusy(true);
    onChange(null);
    try {
      const prepareResponse = await fetch("/api/analytics-proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          contentType: file.type,
          size: file.size,
        }),
      });
      const prepared = (await prepareResponse.json()) as Prepared;
      if (
        !prepareResponse.ok ||
        !prepared.id ||
        !prepared.pathname ||
        !prepared.signedUploadUrl
      )
        throw new Error(
          prepared.error ||
            (prepareResponse.status === 503
              ? "Proof storage is temporarily unavailable."
              : "Could not prepare upload."),
        );
      const uploadResponse = await fetch(prepared.signedUploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!uploadResponse.ok)
        throw new Error("The file could not be uploaded. Please try again.");
      const finalizeResponse = await fetch("/api/analytics-proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finalize", id: prepared.id }),
      });
      const result = (await finalizeResponse.json()) as AnalyticsProof & {
        error?: string;
      };
      if (!finalizeResponse.ok || !result.id || !result.url)
        throw new Error(result.error || "Could not verify the uploaded proof.");
      onChange({
        id: result.id,
        url: result.url,
        contentType: result.contentType || file.type,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-lg border border-dashed p-4 text-center text-sm ${dragging ? "border-primary bg-secondary" : "border-border"}`}
      >
        {value ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Proof uploaded and ready for automated verification.
            </p>
            <a
              href={value.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline"
            >
              Preview uploaded proof
            </a>
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || busy}
                onClick={() => input.current?.click()}
              >
                Replace file
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground">
              Drag proof here, or choose a file
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PNG, JPEG, WEBP, MP4, or WebM · max 25 MB
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Uploading…" : "Choose proof"}
            </Button>
          </>
        )}
        <input
          ref={input}
          className="hidden"
          type="file"
          disabled={disabled || busy}
          accept={ACCEPT.join(",")}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
