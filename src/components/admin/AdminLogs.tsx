import { formatDate } from "../../lib/time";
import type { AuditLog } from "../../types";

export function AdminLogs({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="admin-form wide-form">
      <h2>Logs de ações</h2>
      <div className="log-list">
        {logs.map((log) => (
          <article key={log.id} className="log-row">
            <strong>{log.action}</strong>
            <span>{formatDate(log.createdAt)}</span>
            <span>Usuário: {log.email || log.uid}</span>
            <span>IP: {log.ip || "não disponível"}</span>
            <span>{log.entity ? `${log.entity}/${log.entityId}` : "Sistema"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
