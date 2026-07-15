import { ImagePlus, Send, Smile } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "../hooks/useAuthUser";
import { useChatMessages, useUserProfile } from "../hooks/useStoreContent";
import { formatDate } from "../lib/time";
import {
  markChatRead,
  sendChatMessage,
  setChatTyping,
  uploadUserImage
} from "../services/catalog";
import type { ChatConversation } from "../types";

const emojis = ["🙂", "🔥", "✅", "💬", "🎮"];

interface ChatPanelProps {
  conversationId?: string;
  conversation?: ChatConversation | null;
  adminMode?: boolean;
  initialText?: string;
}

function playMessageSound() {
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 740;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
}

export function ChatPanel({ conversationId, conversation, adminMode = false, initialText = "" }: ChatPanelProps) {
  const { user } = useAuthUser();
  const activeConversationId = conversationId || user?.uid;
  const messages = useChatMessages(activeConversationId);
  const profile = useUserProfile(user?.uid);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCount = useRef(0);
  const appliedInitialText = useRef("");
  const canSend = Boolean(user?.uid && activeConversationId);

  useEffect(() => {
    if (initialText && appliedInitialText.current !== initialText) {
      setText(initialText);
      appliedInitialText.current = initialText;
    }
  }, [initialText]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (activeConversationId) markChatRead(activeConversationId).catch(() => undefined);
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      messages.length > previousMessageCount.current &&
      lastMessage &&
      lastMessage.senderId !== user?.uid
    ) {
      playMessageSound();
    }
    previousMessageCount.current = messages.length;
  }, [messages, user?.uid]);

  const typingText = useMemo(() => {
    if (!conversation?.typingBy) return "";
    if (adminMode && conversation.typingBy === "user") return "Cliente digitando...";
    if (!adminMode && conversation.typingBy === "admin") return "Atendimento digitando...";
    return "";
  }, [adminMode, conversation?.typingBy]);

  async function submit() {
    if (!canSend || busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await sendChatMessage({
        conversationId: adminMode ? activeConversationId : undefined,
        text: text.trim()
      });
      setText("");
      await setChatTyping({ conversationId: activeConversationId, typing: false }).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel enviar a mensagem.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (!user?.uid || !activeConversationId) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadUserImage(file, user.uid, "chat");
      await sendChatMessage({
        conversationId: adminMode ? activeConversationId : undefined,
        text: "",
        imageUrl: url
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel enviar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="Chat">
      <header>
        <div>
          <strong>{adminMode ? conversation?.userName || "Cliente" : "Atendimento MeloBux"}</strong>
          <span>{conversation?.userOnline || !adminMode ? "Online" : "Offline"}</span>
        </div>
        {typingText ? <span className="typing">{typingText}</span> : null}
      </header>

      <div className="chat-messages">
        {messages.map((message) => {
          const mine = message.senderId === user?.uid;
          return (
            <article key={message.id} className={mine ? "chat-message mine" : "chat-message"}>
              {message.imageUrl ? <img src={message.imageUrl} alt="Imagem enviada no chat" /> : null}
              {message.text ? <p>{message.text}</p> : null}
              <span>
                {formatDate(message.createdAt)} · {message.status === "read" ? "Lida" : "Recebida"}
              </span>
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-composer">
        <button
          type="button"
          className="icon-button"
          title="Emoji"
          onClick={() => setText((current) => `${current}${emojis[0]}`)}
        >
          <Smile size={18} aria-hidden />
        </button>
        <select
          aria-label="Escolher emoji"
          value=""
          onChange={(event) => setText((current) => `${current}${event.target.value}`)}
        >
          <option value="">Emoji</option>
          {emojis.map((emoji) => (
            <option key={emoji} value={emoji}>
              {emoji}
            </option>
          ))}
        </select>
        <label className="icon-button file-button" title="Enviar imagem">
          <ImagePlus size={18} aria-hidden />
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
        </label>
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (activeConversationId) {
              setChatTyping({ conversationId: activeConversationId, typing: true }).catch(() => undefined);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder={profile?.displayName ? `Mensagem como ${profile.displayName}` : "Digite sua mensagem"}
          disabled={!canSend || busy}
        />
        <button type="button" className="primary-button" disabled={!text.trim() || busy} onClick={submit}>
          <Send size={18} aria-hidden />
          Enviar
        </button>
        {error ? <p className="form-message chat-error">{error}</p> : null}
      </footer>
    </section>
  );
}
