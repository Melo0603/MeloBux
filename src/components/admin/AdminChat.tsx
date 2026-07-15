import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ChatPanel } from "../ChatPanel";
import type { ChatConversation } from "../../types";

export function AdminChat({ conversations }: { conversations: ChatConversation[] }) {
  const [selected, setSelected] = useState(conversations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      conversations.filter((item) =>
        [item.userName, item.userId, item.lastMessage].join(" ").toLowerCase().includes(search.toLowerCase())
      ),
    [conversations, search]
  );
  const current = conversations.find((item) => item.id === selected) || filtered[0] || null;

  return (
    <section className="admin-chat-layout">
      <aside className="chat-conversation-list">
        <label className="field search-field">
          Buscar usuário
          <span>
            <Search size={18} aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        {filtered.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={current?.id === conversation.id ? "active" : ""}
            onClick={() => setSelected(conversation.id)}
          >
            <img src={conversation.userPhotoUrl || "/icon.svg"} alt="" />
            <span>
              <strong>{conversation.userName}</strong>
              <small>{conversation.userOnline ? "Online" : "Offline"} · {conversation.lastMessage}</small>
            </span>
            {conversation.unreadAdminCount ? <i>{conversation.unreadAdminCount}</i> : null}
          </button>
        ))}
      </aside>
      {current ? (
        <ChatPanel adminMode conversationId={current.id} conversation={current} />
      ) : (
        <div className="empty-state">Nenhuma conversa aberta.</div>
      )}
    </section>
  );
}
