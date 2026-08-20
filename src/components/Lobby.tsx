import { useMemo, useState, type FormEvent } from "react";
import { Bomb, ChevronRight, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import { DIFFICULTIES } from "../gameEngine";
import { isFirebaseConfigured } from "../firebase";
import type { Difficulty } from "../types";

interface LobbyProps {
  loading: boolean;
  error: string | null;
  onEnter: (action: "create" | "join", nickname: string, difficulty: Difficulty, roomCode?: string) => void;
  onDemo: (nickname: string, difficulty: Difficulty) => void;
}

export function Lobby({ loading, error, onEnter, onDemo }: LobbyProps) {
  const invitedRoom = useMemo(() => new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "", []);
  const [mode, setMode] = useState<"create" | "join">(invitedRoom ? "join" : "create");
  const [nickname, setNickname] = useState(() => localStorage.getItem("minesweeper-nickname") ?? "");
  const [roomCode, setRoomCode] = useState(invitedRoom);
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onEnter(mode, nickname, difficulty, roomCode);
  };

  return (
    <main className="lobby-page">
      <header className="lobby-nav">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark"><Bomb size={20} /></span><span>拆雷小隊</span>
        </a>
        <span className="nav-note"><Radio size={13} /> REALTIME CO-OP</span>
      </header>

      <div className="lobby-grid">
        <section className="lobby-intro">
          <p className="eyebrow"><span /> CO-OP MINESWEEPER</p>
          <h1>別一個人猜。<br /><em>組隊，然後開第一格。</em></h1>
          <p className="intro-copy">建立房間、分享六碼房號，和朋友同步判斷每一顆地雷。你們共用棋盤，也共用 255 條生命。</p>
          <div className="feature-row">
            <div><Users size={20} /><span><strong>多人同步</strong><small>所有操作即時出現</small></span></div>
            <div><ShieldCheck size={20} /><span><strong>首擊安全</strong><small>第一格永遠不是雷</small></span></div>
            <div><Sparkles size={20} /><span><strong>免註冊</strong><small>輸入暱稱立即加入</small></span></div>
          </div>
        </section>

        <section className="lobby-card" aria-labelledby="lobby-title">
          <div className="card-tabs">
            <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} type="button">建立房間</button>
            <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} type="button">加入房間</button>
          </div>
          <form onSubmit={submit}>
            <div className="form-heading">
              <p className="step-label">MISSION SETUP</p>
              <h2 id="lobby-title">{mode === "create" ? "建立你的拆雷小隊" : "加入小隊任務"}</h2>
              <p>{mode === "create" ? "選擇難度後，把房號傳給你的隊友。" : "輸入隊長分享的六碼房號。"}</p>
            </div>

            <label className="field-label" htmlFor="nickname">你的暱稱</label>
            <input id="nickname" className="text-field" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="例如：拆雷高手" autoComplete="nickname" required />

            {mode === "join" ? (
              <>
                <label className="field-label" htmlFor="room-code">六碼房號</label>
                <input id="room-code" className="text-field room-code-field" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} maxLength={6} placeholder="ABC123" required />
              </>
            ) : (
              <fieldset className="difficulty-field">
                <legend>任務難度</legend>
                <div className="difficulty-options">
                  {(Object.entries(DIFFICULTIES) as [Difficulty, (typeof DIFFICULTIES)[Difficulty]][]).map(([key, config]) => (
                    <button className={difficulty === key ? "selected" : ""} key={key} type="button" onClick={() => setDifficulty(key)}>
                      <strong>{config.label}</strong><small>{config.rows}×{config.cols} · {config.mines} 雷</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            {!isFirebaseConfigured && <p className="setup-notice">尚未填入 Firebase 設定；你仍可先進入單機試玩模式。</p>}

            <button className="primary-action" disabled={loading} type="submit">
              {loading ? "正在連線…" : mode === "create" ? "建立任務房間" : "加入任務"}<ChevronRight size={18} />
            </button>
            {!isFirebaseConfigured && (
              <button className="secondary-action" type="button" onClick={() => onDemo(nickname, difficulty)}>先玩本機示範</button>
            )}
          </form>
          <p className="privacy-note">房間將在建立 24 小時後自動失效。</p>
        </section>
      </div>
    </main>
  );
}
