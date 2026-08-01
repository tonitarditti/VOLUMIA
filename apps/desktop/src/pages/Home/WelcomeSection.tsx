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
    <section className="space-y-6 px-8 py-12">
      <div className="max-w-2xl space-y-3">
        <h1 className="text-5xl font-light tracking-tight text-[var(--text)]">
          Bienvenido a VOLUMIA
        </h1>
        <p className="text-lg leading-relaxed text-[var(--text-muted)]">
          Convertí imágenes de referencia en modelos 3D editables para tus
          proyectos de arquitectura e interiorismo.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          className="px-8 h-12 text-base"
          disabled={loading}
          onClick={onNewProject}
        >
          {loading ? "Creando..." : "+ Nuevo proyecto"}
        </Button>
        <Button
          variant="secondary"
          className="px-8 h-12 text-base"
          disabled={loading}
          onClick={onImportImages}
        >
          Importar imágenes
        </Button>
      </div>

      <div className="mt-8 pt-6 border-t border-[rgba(181,154,118,0.12)]">
        <svg
          className="w-48 h-32 opacity-20 text-[var(--accent)]"
          viewBox="0 0 200 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g strokeWidth="1.5" stroke="currentColor">
            <rect x="20" y="20" width="160" height="120" rx="2" />
            <line x1="30" y1="35" x2="170" y2="35" />
            <line x1="35" y1="50" x2="165" y2="50" />
            <line x1="30" y1="65" x2="170" y2="65" />
            <circle cx="50" cy="90" r="8" />
            <circle cx="100" cy="90" r="8" />
            <circle cx="150" cy="90" r="8" />
            <line x1="30" y1="115" x2="170" y2="115" />
          </g>
        </svg>
      </div>
    </section>
  );
}
