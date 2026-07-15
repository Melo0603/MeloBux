import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePopups } from "../hooks/useStoreContent";

export function StorePopupHost() {
  const popups = usePopups(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("melobux-popup-dismissed"));
  const popup = popups.find((item) => item.status === "active" && item.id !== dismissed);

  useEffect(() => {
    if (popup?.type === "update") {
      localStorage.removeItem("melobux-popup-dismissed");
      setDismissed(null);
    }
  }, [popup?.type]);

  if (!popup) return null;
  const activePopup = popup;

  function close() {
    localStorage.setItem("melobux-popup-dismissed", activePopup.id);
    setDismissed(activePopup.id);
  }

  return (
    <div className="popup-backdrop" role="dialog" aria-modal="true" aria-label={activePopup.title}>
      <article className="store-popup">
        <button type="button" className="icon-button popup-close" aria-label="Fechar" onClick={close}>
          <X size={18} aria-hidden />
        </button>
        {activePopup.imageUrl ? <img src={activePopup.imageUrl} alt="" /> : null}
        <h2>{activePopup.title}</h2>
        <p>{activePopup.body}</p>
        {activePopup.url.startsWith("http") ? (
          <a className="primary-button" href={activePopup.url} target="_blank" rel="noreferrer" onClick={close}>
            {activePopup.buttonLabel}
          </a>
        ) : (
          <Link className="primary-button" to={activePopup.url} onClick={close}>
            {activePopup.buttonLabel}
          </Link>
        )}
      </article>
    </div>
  );
}
