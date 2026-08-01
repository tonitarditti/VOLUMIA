import { Button } from "@/ui/primitives";

export interface WelcomeSectionProps {
  onNewProject: () => void;
  onImportImages: () => void;
  loading?: boolean;
}

export function WelcomeSection({
  onNewProject,
  onImportImages,
  loading,
}: WelcomeSectionProps) {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--volumia-cyan)]">
          Diseño 3D impulsado por IA
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">
          Bienvenido a VOLUMIA
        </h1>
        <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
          Convertí imágenes de referencia en modelos 3D editables para tus
          proyectos de arquitectura e interiorismo.
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Button
          variant="primary"
          className="h-12 px-7 text-sm sm:text-base"
          disabled={loading}
          onClick={onNewProject}
        >
          {loading ? "Creando..." : "+ Nuevo proyecto"}
        </Button>
        <Button
          variant="secondary"
          className="h-12 px-7 text-sm sm:text-base"
          disabled={loading}
          onClick={onImportImages}
        >
          Importar imágenes
        </Button>
      </div>

      <button
        type="button"
        aria-label="Importar imágenes de referencia"
        onClick={onImportImages}
        disabled={loading}
        className="group mt-9 flex min-h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-[var(--volumia-blue)] hover:bg-[var(--accent-soft)] hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-20 w-32 text-[var(--text-muted)] transition-colors duration-200 group-hover:text-[var(--volumia-blue)]"
          viewBox="0 0 200 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g strokeWidth="1.5" stroke="currentColor" opacity="0.68">
            <rect x="20" y="20" width="160" height="120" rx="12" />
            <line x1="30" y1="35" x2="170" y2="35" />
            <line x1="35" y1="50" x2="165" y2="50" />
            <line x1="30" y1="65" x2="170" y2="65" />
            <circle cx="50" cy="90" r="8" />
            <circle cx="100" cy="90" r="8" />
            <circle cx="150" cy="90" r="8" />
            <line x1="30" y1="115" x2="170" y2="115" />
          </g>
        </svg>
      </button>
    </section>
  );
}
