import { useEffect, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { EmptyState, PageSkeleton } from "../components/LoadingState";
import { useAuthUser } from "../hooks/useAuthUser";
import { useConversation } from "../hooks/useStoreContent";
import { openSupportConversation } from "../services/catalog";

export function SupportPage() {
  const { user } = useAuthUser();
  const conversation = useConversation(user?.uid);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) return;

    let active = true;
    setLoading(true);
    openSupportConversation()
      .then(() => {
        if (active) setError("");
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Nao foi possivel abrir o suporte.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.uid]);

  if (loading) return <PageSkeleton />;

  return (
    <main className="content-shell support-page">
      <section className="section-heading">
        <div>
          <span>Suporte</span>
          <h1>Atendimento MeloBux</h1>
        </div>
      </section>
      {error ? (
        <EmptyState>{error}</EmptyState>
      ) : (
        <ChatPanel conversationId={user?.uid} conversation={conversation} />
      )}
    </main>
  );
}
