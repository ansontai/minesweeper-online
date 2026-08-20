import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, Users, X } from "lucide-react";
import type { ChatMessage, PlayerIdentity, RoomMember } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  members: RoomMember[];
  hostUid: string;
  player: PlayerIdentity;
  open: boolean;
  onClose: () => void;
  onSend: (text: string) => Promise<void> | void;
}

function avatarColor(uid: string) {
  const colors = ["orange", "teal", "purple", "blue", "pink"];
  return colors[[...uid].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length];
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
}

export function ChatPanel({ messages, members, hostUid, player, open, onClose, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastSentAt = useRef(0);
  const messageEnd = useRef<HTMLDivElement>(null);
  const onlineMembers = members.filter((member) => member.online);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = text.trim();
    if (!cleaned || sending || Date.now() - lastSentAt.current < 800) return;
    setSending(true);
    try {
      await onSend(cleaned);
      lastSentAt.current = Date.now();
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={`chat-panel ${open ? "mobile-open" : ""}`} aria-label="小隊聊天室">
      <div className="panel-heading">
        <div><MessageCircle size={18} /><strong>小隊通訊</strong></div>
        <span><Users size={14} /> {onlineMembers.length}</span>
        <button className="chat-close" type="button" aria-label="關閉聊天室" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="squad-list">
        <div className="avatar-stack">
          {onlineMembers.slice(0, 5).map((member) => (
            <span className={`avatar ${avatarColor(member.uid)}`} key={member.uid}>{member.nickname.slice(0, 1).toUpperCase()}</span>
          ))}
        </div>
        <div>
          <strong>{onlineMembers.length > 0 ? "小隊在線" : "等待隊友"}</strong>
          <small>隊長：{members.find((member) => member.uid === hostUid)?.nickname ?? "交接中"}</small>
        </div>
      </div>
      <div className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty-chat"><MessageCircle size={24} /><p>還沒有訊息</p><small>和隊友討論下一格要開哪裡。</small></div>
        )}
        {messages.map((message) => {
          const self = message.uid === player.uid;
          return (
            <div className={`message ${self ? "self" : ""}`} key={message.id}>
              {!self && <span className={`avatar ${avatarColor(message.uid)}`}>{message.nickname.slice(0, 1).toUpperCase()}</span>}
              <div><small>{self ? "你" : message.nickname} · {formatTime(message.createdAt)}</small><p>{message.text}</p></div>
            </div>
          );
        })}
        <div ref={messageEnd} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="message" className="sr-only">輸入訊息</label>
        <input id="message" value={text} onChange={(event) => setText(event.target.value)} placeholder="傳送訊息給小隊…" maxLength={300} />
        <span className="char-count">{text.length}/300</span>
        <button type="submit" disabled={sending || !text.trim()} aria-label="傳送訊息"><Send size={17} /></button>
      </form>
    </aside>
  );
}
