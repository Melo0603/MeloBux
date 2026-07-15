import { MessageCircle, Send, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { useAuthUser } from "../hooks/useAuthUser";
import { useConversation } from "../hooks/useStoreContent";
import { isFirebaseConfigured } from "../lib/firebase";
import { ensureAnonymousSession } from "../services/catalog";

interface CustomerChatModalProps {
  open: boolean;
  onClose: () => void;
  initialText?: string;
}

interface LocalMessage {
  id: string;
  sender: "user" | "melo";
  text: string;
  createdAt: string;
}

const localChatKey = "melobux-local-chat";

function readLocalMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(localChatKey) || "[]");
    return Array.isArray(parsed) ? (parsed as LocalMessage[]) : [];
  } catch {
    return [];
  }
}

function playChatSound() {
  const AudioContextClass =
    window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 760;
  gain.gain.value = 0.045;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
}

function LocalChat({ initialText = "" }: { initialText?: string }) {
  const [messages, setMessages] = useState<LocalMessage[]>(readLocalMessages);
  const [text, setText] = useState(initialText);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(localChatKey, JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const clean = text.trim();
    if (!clean) return;

    const userMessage: LocalMessage = {
      id: `local-${Date.now()}`,
      sender: "user",
      text: clean,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, userMessage]);
    setText("");
    playChatSound();
  }

  return (
    <section className="chat-panel local-chat-panel" aria-label="Chat com Melo">
      <header>
        <div>
          <strong>MeloBux</strong>
          <span>Online</span>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((message) => (
          <article key={message.id} className={message.sender === "user" ? "chat-message mine" : "chat-message"}>
            <p>{message.text}</p>
            <span>{message.sender === "user" ? "Recebida" : "Lida"}</span>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Digite sua mensagem"
        />
        <button type="submit" className="primary-button" disabled={!text.trim()}>
          <Send size={18} aria-hidden />
          Enviar
        </button>
      </form>
    </section>
  );
}

export function CustomerChatModal({ open, onClose, initialText = "" }: CustomerChatModalProps) {
  const { user } = useAuthUser();
  const conversation = useConversation(user?.uid);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !isFirebaseConfigured) return;

    let active = true;
    setAuthReady(false);
    setError("");
    ensureAnonymousSession()
      .then(() => {
        if (active) setAuthReady(true);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Nao foi possivel abrir o chat.");
        setAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop chat-modal-backdrop" role="dialog" aria-modal="true" aria-label="Chat com Melo">
      <section className="customer-chat-modal">
        <header className="modal-title-row">
          <span>
            <MessageCircle size={18} aria-hidden />
            Conversar com Melo
          </span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar chat">
            <X size={18} aria-hidden />
          </button>
        </header>

        {error ? <p className="form-message">{error}</p> : null}
        {isFirebaseConfigured ? (
          authReady ? (
            <ChatPanel conversation={conversation} initialText={initialText} />
          ) : (
            <div className="empty-state">Abrindo chat...</div>
          )
        ) : (
          <LocalChat initialText={initialText} />
        )}
      </section>
    </div>
  );
}
