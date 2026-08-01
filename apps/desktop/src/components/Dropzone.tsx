import { useRef, useState, type DragEvent } from "react";

type DropzoneProps = {
  files: File[];
  disabled?: boolean;
  onFiles: (files: File[]) => void;
};

export function Dropzone({ files, disabled = false, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFiles = (nextFiles: FileList | File[]) => {
    const images = Array.from(nextFiles).filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) {
      onFiles(images);
    }
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <div>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => event.target.files && acceptFiles(event.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[152px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:shadow-[var(--shadow-sm)]"
        }`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-[var(--accent)] text-lg text-[var(--accent)]" aria-hidden="true">
          +
        </span>
        <span className="mt-3 text-sm font-medium text-[var(--text)]">Subir imágenes</span>
        <span className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)]">
          Arrastrá imágenes o seleccioná archivos. Demo acepta cualquier imagen; Quick usa la primera.
        </span>
      </button>
      {files.length > 0 ? (
        <div className="mt-3 space-y-2">
          {files.map((file) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs"
            >
              <span className="truncate text-[var(--text)]">{file.name}</span>
              <span className="ml-3 shrink-0 text-[var(--text-muted)]">{Math.ceil(file.size / 1024)} KB</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
