import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="content-shell">
      <div className="empty-state">
        <h1>Página não encontrada</h1>
        <Link to="/" className="primary-button">
          Voltar para início
        </Link>
      </div>
    </main>
  );
}
