import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { SplitView } from "@/layout/SplitView";
import { createChatMessage } from "@/projects/factory";
import { useProjects } from "@/projects/context";
import { selectProjectById } from "@/projects/selectors";
import { buildMockAssistantReply, summarizeReply } from "@/projects/mockAssistant";
import { Card } from "@/ui/Card";
import { TextField } from "@/ui/Input";
import { TextArea } from "@/ui/Textarea";
import { Button } from "@/ui/Button";
import { ProjectViewport } from "@/three/ProjectViewport";
import { useT } from "@/volumia/i18n/useT";

function formatMessageTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ProjectPage() {
  const { t, language } = useT();
  const { projectId = "" } = useParams();
  const { state, hydrated, renameProject, updateNotes, appendChatMessage, updateModelMetadata } = useProjects();

  const project = useMemo(() => selectProjectById(state, projectId), [projectId, state]);
  const [chatInput, setChatInput] = useState("");
  const historyBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (historyBottomRef.current) {
      historyBottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [project?.chatHistory.length]);

  if (!hydrated) {
    return null;
  }

  if (!project) {
    return <Navigate to="/" replace />;
  }

  const submitChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const userMessage = createChatMessage("user", trimmed);
    appendChatMessage(project.id, userMessage);

    const assistantReplyText = buildMockAssistantReply(project.name, trimmed);
    const assistantMessage = createChatMessage("assistant", assistantReplyText);
    appendChatMessage(project.id, assistantMessage);

    updateModelMetadata(project.id, {
      ...project.modelMetadata,
      lastPrompt: trimmed,
      lastAssistantSummary: summarizeReply(assistantReplyText),
    });

    setChatInput("");
  };

  return (
    <SplitView
      left={
        <>
          <Card className="p-5">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-volume-muted">{t("project.projectName")}</label>
            <TextField
              value={project.name}
              onChange={(event) => renameProject(project.id, event.target.value)}
              aria-label={t("dashboard.projectNameLabel")}
            />
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col p-5">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-volume-muted">{t("project.viewport")}</h2>
            <div className="min-h-0 flex-1">
              <ProjectViewport />
            </div>
          </Card>

          <Card className="p-5">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-volume-muted">{t("project.notes")}</label>
            <TextArea
              value={project.notes}
              onChange={(event) => updateNotes(project.id, event.target.value)}
              rows={7}
              className="min-h-36 leading-relaxed"
              placeholder={t("project.notesPlaceholder")}
            />
          </Card>
        </>
      }
      right={
        <Card className="flex h-full min-h-0 flex-1 flex-col p-5">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-volume-muted">{t("project.assistant")}</h2>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-volume-stroke bg-volume-panelAlt/35 p-3.5">
            {project.chatHistory.length === 0 ? (
              <p className="text-sm leading-relaxed text-volume-muted">
                {t("project.noMessages")}
              </p>
            ) : null}

            {project.chatHistory.map((message) => {
              const isAssistant = message.role === "assistant";

              return (
                <article
                  key={message.id}
                  className={`rounded-xl border p-3 ${
                    isAssistant
                      ? "border-volume-stroke bg-volume-panel text-volume-text"
                      : "border-volume-accent/40 bg-volume-accent/12 text-volume-text"
                  }`}
                >
                  <header className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-volume-muted">
                    <span>{isAssistant ? t("project.assistantRole") : t("project.userRole")}</span>
                    <time>{formatMessageTime(message.createdAt, language)}</time>
                  </header>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                </article>
              );
            })}
            <div ref={historyBottomRef} />
          </div>

          <div className="mt-3 flex gap-2">
            <TextField
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitChat();
                }
              }}
              placeholder={t("project.promptPlaceholder")}
              aria-label={t("project.assistant")}
            />
            <Button variant="primary" className="min-w-24" onClick={submitChat}>
              {t("project.send")}
            </Button>
          </div>
        </Card>
      }
    />
  );
}
