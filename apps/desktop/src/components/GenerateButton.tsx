import { Button } from "@/ui/primitives";

type GenerateButtonProps = {
  disabled?: boolean;
  running?: boolean;
  onClick: () => void;
};

export function GenerateButton({ disabled = false, running = false, onClick }: GenerateButtonProps) {
  return (
    <Button variant="primary" className="w-full gap-2" disabled={disabled || running} onClick={onClick}>
      <span aria-hidden="true">{running ? "..." : ">"}</span>
      {running ? "Generando..." : "Generar modelo"}
    </Button>
  );
}
