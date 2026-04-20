"use client";

import { useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { SegmentedControl } from "./SegmentedControl";
import { useToast } from "./Toast";
import { uploadPlaybookLogoAction } from "@/app/actions/playbooks";

export function LogoPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPlaybookLogoAction(fd);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      onChange(res.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          Logo <span className="font-normal normal-case text-muted">(optional)</span>
        </label>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "upload", label: "Upload", icon: Upload },
            { value: "url", label: "URL", icon: Link2 },
          ]}
        />
      </div>

      {mode === "upload" ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Upload}
            onClick={() => fileRef.current?.click()}
            loading={uploading}
            disabled={disabled || uploading}
          >
            {value ? "Replace image" : "Choose image"}
          </Button>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              disabled={disabled || uploading}
            >
              Remove
            </Button>
          )}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/logo.png"
          disabled={disabled}
        />
      )}
      <p className="text-xs text-muted">
        PNG, JPG, WebP, SVG, or GIF — up to 2 MB.
      </p>
    </div>
  );
}
