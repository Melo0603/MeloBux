import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { useNotifications, useUserProfile } from "../hooks/useStoreContent";
import { playNotificationSound } from "../lib/sound";
import { formatDate } from "../lib/time";
import { markNotificationRead } from "../services/catalog";

export function NotificationCenter() {
  const { user, isAdmin } = useAuthUser();
  const profile = useUserProfile(user?.uid);
  const notifications = useNotifications(user?.uid, isAdmin);
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => notifications.filter((item) => !item.read), [notifications]);

  useEffect(() => {
    if (unread.length > 0) {
      playNotificationSound(profile?.soundEnabled !== false);
    }
  }, [profile?.soundEnabled, unread.length]);

  return (
    <div className="notification-center">
      <button
        className="icon-button"
        type="button"
        title="Notificações"
        aria-label="Abrir notificações"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} aria-hidden />
        {unread.length ? <span className="badge-count">{unread.length}</span> : null}
      </button>

      {open ? (
        <div className="notification-menu" role="dialog" aria-label="Notificações">
          <strong>Notificações</strong>
          {notifications.length ? (
            notifications.slice(0, 8).map((item) => (
              <article key={item.id} className={item.read ? "notice-card read" : "notice-card"}>
                <div>
                  {item.link ? <Link to={item.link}>{item.title}</Link> : <strong>{item.title}</strong>}
                  <p>{item.body}</p>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                {!item.read ? (
                  <button
                    type="button"
                    className="icon-button"
                    title="Marcar como lida"
                    onClick={() => markNotificationRead(item.id)}
                  >
                    <CheckCheck size={17} aria-hidden />
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p className="muted">Nenhuma notificação ainda.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
