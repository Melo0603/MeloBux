import {
  Database,
  LayoutDashboard,
  MessageSquare,
  FileQuestion,
  ImageUp,
  ScrollText,
  LogOut,
  Package,
  Percent,
  Save,
  ShieldCheck,
  Tags,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/LoadingState";
import { AdminChat } from "../components/admin/AdminChat";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { AdminLogs } from "../components/admin/AdminLogs";
import { AdminOrders } from "../components/admin/AdminOrders";
import { useAuthUser } from "../hooks/useAuthUser";
import {
  useAuditLogs,
  useBanners,
  useCategories,
  useConversations,
  useFaqs,
  usePopups,
  useProducts,
  useSettings,
  useUsers
} from "../hooks/useStoreContent";
import { arrayToLines, linesToArray, toSlug } from "../lib/format";
import { auth } from "../lib/firebase";
import { ADMIN_EMAIL, isAllowedAdminEmail } from "../lib/admin";
import {
  deleteAdminDocument,
  duplicateAdminDocument,
  grantInitialAdmin,
  saveAdminDocument,
  seedDefaultCatalog,
  subscribeCoupons,
  subscribeOrders,
  uploadAdminImage
} from "../services/catalog";
import type { Banner, Category, ContentStatus, Coupon, Faq, Order, Product, StorePopup, StoreSettings } from "../types";

type AdminTab =
  | "dashboard"
  | "categories"
  | "products"
  | "settings"
  | "coupons"
  | "faqs"
  | "banners"
  | "popups"
  | "orders"
  | "chat"
  | "logs";

const tabs: Array<{ id: AdminTab; label: string; icon: typeof Tags }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "categories", label: "Categorias", icon: Tags },
  { id: "products", label: "Produtos", icon: Package },
  { id: "settings", label: "Loja", icon: ImageUp },
  { id: "coupons", label: "Cupons", icon: Percent },
  { id: "faqs", label: "FAQs", icon: FileQuestion },
  { id: "banners", label: "Banners", icon: ImageUp },
  { id: "popups", label: "Popups", icon: Database },
  { id: "orders", label: "Pedidos", icon: Database },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "logs", label: "Logs", icon: ScrollText }
];

const emptyCategory: Category = {
  id: "",
  slug: "",
  name: "",
  imageUrl: "",
  bannerUrl: "",
  description: "",
  deliveryTime: "",
  importantInfo: "",
  deliveryNotice: "",
  ratingAverage: 5,
  ratingCount: 0,
  status: "active",
  sortOrder: 10,
  chatUrl: ""
};

const emptyProduct: Product = {
  id: "",
  categorySlug: "gamepass",
  name: "",
  quantity: 0,
  price: 0,
  stock: 0,
  status: "active",
  sortOrder: 10,
  description: "",
  deliveryTime: "",
  guarantees: [],
  paymentMethods: [],
  faqIds: []
};

const emptyCoupon: Coupon = {
  id: "",
  code: "",
  type: "percent",
  value: 0,
  status: "active"
};

const emptyFaq: Faq = {
  id: "",
  question: "",
  answer: "",
  status: "published",
  sortOrder: 10
};

function asPlainRecord<T extends object>(value: T) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function parseNumber(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function StatusSelect({
  value,
  onChange
}: {
  value: ContentStatus;
  onChange: (value: ContentStatus) => void;
}) {
  return (
    <label className="field">
      Status
      <select value={value} onChange={(event) => onChange(event.target.value as ContentStatus)}>
        <option value="active">Ativo</option>
        <option value="published">Publicado</option>
        <option value="draft">Rascunho</option>
        <option value="archived">Arquivado</option>
      </select>
    </label>
  );
}

function NeedsAdminClaim() {
  const [message, setMessage] = useState("");

  async function bootstrap() {
    setMessage("");
    try {
      await grantInitialAdmin();
      await auth?.currentUser?.getIdToken(true);
      setMessage("Admin ativado. Recarregue o painel se a aba não aparecer automaticamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar admin.");
    }
  }

  return (
    <div className="content-shell">
      <EmptyState>
        <h1>Acesso administrativo pendente</h1>
        <p>Use o e-mail {ADMIN_EMAIL} para ativar o painel.</p>
        <button type="button" className="primary-button" onClick={bootstrap}>
          <ShieldCheck size={18} aria-hidden />
          Ativar admin inicial
        </button>
        {message ? <p className="form-message">{message}</p> : null}
      </EmptyState>
    </div>
  );
}

export function AdminPage() {
  const { isAdmin, loading, logout, user } = useAuthUser();

  if (loading) return <main className="content-shell"><EmptyState>Carregando painel.</EmptyState></main>;
  if (!user) return <main className="content-shell"><EmptyState>Redirecionando para login.</EmptyState></main>;
  if (!isAllowedAdminEmail(user.email)) {
    return (
      <main className="content-shell">
        <EmptyState>Este painel e exclusivo para {ADMIN_EMAIL}.</EmptyState>
      </main>
    );
  }
  if (!isAdmin) return <NeedsAdminClaim />;

  return <AdminWorkspace logout={logout} />;
}

function AdminWorkspace({ logout }: { logout: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const categories = useCategories(true);
  const products = useProducts(null, true);
  const faqs = useFaqs(true);
  const settings = useSettings();
  const banners = useBanners(true);
  const popups = usePopups(true);
  const users = useUsers();
  const conversations = useConversations();
  const logs = useAuditLogs();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeCoupons(setCoupons), []);
  useEffect(() => subscribeOrders(setOrders), []);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ação não concluída.");
    }
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <strong>Painel</strong>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} aria-hidden />
              {tab.label}
            </button>
          );
        })}
        <button type="button" onClick={() => runAction(seedDefaultCatalog, "Conteúdo padrão publicado.")}>
          <Upload size={18} aria-hidden />
          Seed inicial
        </button>
        <button type="button" onClick={() => void logout()}>
          <LogOut size={18} aria-hidden />
          Sair
        </button>
      </aside>

      <section className="admin-workspace">
        {message ? <p className="form-message">{message}</p> : null}
        {activeTab === "dashboard" ? (
          <AdminDashboard orders={orders} products={products} users={users} conversations={conversations} />
        ) : null}
        {activeTab === "categories" ? (
          <CategoryAdmin categories={categories} onAction={runAction} />
        ) : null}
        {activeTab === "products" ? (
          <ProductAdmin products={products} categories={categories} onAction={runAction} />
        ) : null}
        {activeTab === "settings" ? <SettingsAdmin settings={settings} onAction={runAction} /> : null}
        {activeTab === "coupons" ? <CouponAdmin coupons={coupons} onAction={runAction} /> : null}
        {activeTab === "faqs" ? <FaqAdmin faqs={faqs} onAction={runAction} /> : null}
        {activeTab === "banners" ? <BannerAdmin banners={banners} onAction={runAction} /> : null}
        {activeTab === "popups" ? <PopupAdmin popups={popups} onAction={runAction} /> : null}
        {activeTab === "orders" ? <AdminOrders orders={orders} /> : null}
        {activeTab === "chat" ? <AdminChat conversations={conversations} /> : null}
        {activeTab === "logs" ? <AdminLogs logs={logs} /> : null}
      </section>
    </main>
  );
}

function CategoryAdmin({
  categories,
  onAction
}: {
  categories: Category[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Category>(emptyCategory);

  async function upload(file: File, field: "imageUrl" | "bannerUrl") {
    const slug = draft.slug || toSlug(draft.name) || "categoria";
    const url = await uploadAdminImage(file, `public/categories/${slug}-${Date.now()}-${file.name}`);
    setDraft((current) => ({ ...current, [field]: url }));
  }

  const id = draft.id || draft.slug || toSlug(draft.name);

  return (
    <div className="admin-grid">
      <DocumentList
        title="Categorias"
        items={categories}
        getLabel={(category) => category.name}
        onSelect={(category) => setDraft(category)}
      />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(
          () =>
            saveAdminDocument({
              collection: "categories",
              id,
              data: asPlainRecord({ ...draft, id, slug: draft.slug || toSlug(draft.name) })
            }),
          "Categoria salva."
        );
      }}>
        <h2>Categoria</h2>
        <div className="form-row">
          <label className="field">
            Nome
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: draft.slug || toSlug(event.target.value) })} />
          </label>
          <label className="field">
            Slug
            <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: toSlug(event.target.value) })} />
          </label>
        </div>
        <div className="form-row">
          <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
          <label className="field">
            Ordem
            <input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: parseNumber(event.target.value) })} />
          </label>
        </div>
        <label className="field">
          Imagem do card
          <input value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} />
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "imageUrl")} />
        </label>
        <label className="field">
          Banner da categoria
          <input value={draft.bannerUrl} onChange={(event) => setDraft({ ...draft, bannerUrl: event.target.value })} />
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "bannerUrl")} />
        </label>
        <label className="field">
          Descrição completa
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label className="field">
          Prazo de entrega
          <input value={draft.deliveryTime} onChange={(event) => setDraft({ ...draft, deliveryTime: event.target.value })} />
        </label>
        <label className="field">
          Informações importantes
          <textarea value={draft.importantInfo} onChange={(event) => setDraft({ ...draft, importantInfo: event.target.value })} />
        </label>
        <label className="field">
          Aviso de entrega
          <textarea value={draft.deliveryNotice} onChange={(event) => setDraft({ ...draft, deliveryNotice: event.target.value })} />
        </label>
        <div className="form-row">
          <label className="field">
            Avaliação
            <input type="number" step="0.1" value={draft.ratingAverage} onChange={(event) => setDraft({ ...draft, ratingAverage: parseNumber(event.target.value, 5) })} />
          </label>
          <label className="field">
            Total avaliações
            <input type="number" value={draft.ratingCount} onChange={(event) => setDraft({ ...draft, ratingCount: parseNumber(event.target.value) })} />
          </label>
        </div>
        <label className="field">
          Link do chat
          <input value={draft.chatUrl || ""} onChange={(event) => setDraft({ ...draft, chatUrl: event.target.value })} />
        </label>
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyCategory)}>Nova</button>
          {draft.id ? (
            <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "categories", id: draft.id }), "Categoria apagada.")}>
              <Trash2 size={18} aria-hidden />Apagar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function ProductAdmin({
  products,
  categories,
  onAction
}: {
  products: Product[];
  categories: Category[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Product>(emptyProduct);

  const id = draft.id || toSlug(draft.name);

  async function upload(file: File) {
    const productId = id || "produto";
    const url = await uploadAdminImage(file, `public/products/${productId}-${Date.now()}-${file.name}`);
    setDraft((current) => ({
      ...current,
      imageUrl: url,
      gallery: [...(current.gallery || []), url]
    }));
  }

  return (
    <div className="admin-grid">
      <DocumentList title="Produtos" items={products} getLabel={(product) => product.name} onSelect={setDraft} />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(
          () => saveAdminDocument({ collection: "products", id, data: asPlainRecord({ ...draft, id }) }),
          "Produto salvo."
        );
      }}>
        <h2>Produto</h2>
        <div className="form-row">
          <label className="field">
            Nome
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            ID
            <input value={draft.id} onChange={(event) => setDraft({ ...draft, id: toSlug(event.target.value) })} />
          </label>
        </div>
        <label className="field">
          Imagem principal
          <input value={draft.imageUrl || ""} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} />
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
        </label>
        <div className="form-row">
          <label className="field">
            Categoria
            <select value={draft.categorySlug} onChange={(event) => setDraft({ ...draft, categorySlug: event.target.value })}>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>{category.name}</option>
              ))}
            </select>
          </label>
          <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
        </div>
        <div className="form-row">
          <label className="field">
            Quantidade de Robux
            <input type="number" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: parseNumber(event.target.value) })} />
          </label>
          <label className="field">
            Preço
            <input type="number" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: parseNumber(event.target.value) })} />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            Estoque
            <input type="number" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: parseNumber(event.target.value) })} />
          </label>
          <label className="field">
            Ordem
            <input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: parseNumber(event.target.value) })} />
          </label>
        </div>
        <label className="field">
          Descrição completa
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label className="field">
          Prazo de entrega
          <input value={draft.deliveryTime} onChange={(event) => setDraft({ ...draft, deliveryTime: event.target.value })} />
        </label>
        <label className="field">
          Garantias
          <textarea value={arrayToLines(draft.guarantees)} onChange={(event) => setDraft({ ...draft, guarantees: linesToArray(event.target.value) })} />
        </label>
        <label className="field">
          Formas de pagamento
          <textarea value={arrayToLines(draft.paymentMethods)} onChange={(event) => setDraft({ ...draft, paymentMethods: linesToArray(event.target.value) })} />
        </label>
        <label className="field">
          IDs de FAQ
          <input value={draft.faqIds.join(", ")} onChange={(event) => setDraft({ ...draft, faqIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        </label>
        <label className="field">
          Galeria
          <textarea value={arrayToLines(draft.gallery || [])} onChange={(event) => setDraft({ ...draft, gallery: linesToArray(event.target.value) })} />
        </label>
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyProduct)}>Novo</button>
          {draft.id ? (
            <button className="secondary-button" type="button" onClick={() => onAction(() => duplicateAdminDocument({ collection: "products", id: draft.id, newId: `${draft.id}-copia-${Date.now()}` }), "Produto duplicado como rascunho.")}>
              Duplicar
            </button>
          ) : null}
          {draft.id ? (
            <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "products", id: draft.id }), "Produto apagado.")}>
              <Trash2 size={18} aria-hidden />Apagar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function SettingsAdmin({
  settings,
  onAction
}: {
  settings: StoreSettings;
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<StoreSettings>(settings);

  useEffect(() => setDraft(settings), [settings]);

  async function upload(file: File) {
    const url = await uploadAdminImage(file, `public/home/banner-${Date.now()}-${file.name}`);
    setDraft((current) => ({ ...current, homeBannerImageUrl: url }));
  }

  return (
    <form className="admin-form wide-form" onSubmit={(event) => {
      event.preventDefault();
      onAction(
        () => saveAdminDocument({ collection: "settings", id: "public", data: asPlainRecord(draft) }),
        "Configurações salvas."
      );
    }}>
      <h2>Conteúdo da loja</h2>
      <div className="form-row">
        <label className="field">
          Nome da loja
          <input value={draft.storeName} onChange={(event) => setDraft({ ...draft, storeName: event.target.value })} />
        </label>
        <label className="field">
          Nome do dono
          <input value={draft.ownerName || ""} onChange={(event) => setDraft({ ...draft, ownerName: event.target.value })} />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          Roblox
          <input value={draft.ownerRobloxUsername || ""} onChange={(event) => setDraft({ ...draft, ownerRobloxUsername: event.target.value })} />
        </label>
        <label className="field">
          Roblox User ID
          <input value={draft.ownerRobloxUserId || ""} onChange={(event) => setDraft({ ...draft, ownerRobloxUserId: event.target.value })} />
        </label>
      </div>
      <label className="field">
        Avatar do dono
        <input value={draft.ownerAvatarUrl || ""} onChange={(event) => setDraft({ ...draft, ownerAvatarUrl: event.target.value })} />
      </label>
      <label className="field">
        Botão do TikTok
        <input value={draft.tiktokUrl} onChange={(event) => setDraft({ ...draft, tiktokUrl: event.target.value })} />
      </label>
      <label className="field">
        Banner da Home
        <input value={draft.homeBannerImageUrl} onChange={(event) => setDraft({ ...draft, homeBannerImageUrl: event.target.value })} />
        <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
      </label>
      <div className="form-row">
        <label className="field">
          WhatsApp
          <input value={draft.whatsappUrl} onChange={(event) => setDraft({ ...draft, whatsappUrl: event.target.value })} />
        </label>
        <label className="field">
          Instagram
          <input value={draft.instagramUrl} onChange={(event) => setDraft({ ...draft, instagramUrl: event.target.value })} />
        </label>
      </div>
      <label className="field">
        Avisos
        <textarea value={draft.notice} onChange={(event) => setDraft({ ...draft, notice: event.target.value })} />
      </label>
      <label className="field">
        Política da loja
        <textarea value={draft.policy} onChange={(event) => setDraft({ ...draft, policy: event.target.value })} />
      </label>
      <label className="field">
        Garantias padrão
        <textarea value={arrayToLines(draft.guarantees)} onChange={(event) => setDraft({ ...draft, guarantees: linesToArray(event.target.value) })} />
      </label>
      <label className="field">
        Formas de pagamento padrão
        <textarea value={arrayToLines(draft.paymentMethods)} onChange={(event) => setDraft({ ...draft, paymentMethods: linesToArray(event.target.value) })} />
      </label>
      <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
    </form>
  );
}

function CouponAdmin({
  coupons,
  onAction
}: {
  coupons: Coupon[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Coupon>(emptyCoupon);
  const id = draft.id || toSlug(draft.code);

  return (
    <div className="admin-grid">
      <DocumentList title="Cupons" items={coupons} getLabel={(coupon) => coupon.code} onSelect={setDraft} />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(
          () => saveAdminDocument({ collection: "coupons", id, data: asPlainRecord({ ...draft, id }) }),
          "Cupom salvo."
        );
      }}>
        <h2>Cupom</h2>
        <label className="field">Código<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></label>
        <div className="form-row">
          <label className="field">Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Coupon["type"] })}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select></label>
          <label className="field">Valor<input type="number" step="0.01" value={draft.value} onChange={(event) => setDraft({ ...draft, value: parseNumber(event.target.value) })} /></label>
        </div>
        <div className="form-row">
          <label className="field">Quantidade máxima<input type="number" value={draft.maxUses || 0} onChange={(event) => setDraft({ ...draft, maxUses: parseNumber(event.target.value) })} /></label>
          <label className="field">Valor mínimo<input type="number" step="0.01" value={draft.minOrderValue || 0} onChange={(event) => setDraft({ ...draft, minOrderValue: parseNumber(event.target.value) })} /></label>
        </div>
        <div className="form-row">
          <label className="toggle-row"><input type="checkbox" checked={draft.oncePerUser === true} onChange={(event) => setDraft({ ...draft, oncePerUser: event.target.checked })} />Uso único por usuário</label>
          <label className="field">Uso por usuário<input type="number" value={draft.maxUsesPerUser || 1} onChange={(event) => setDraft({ ...draft, maxUsesPerUser: parseNumber(event.target.value, 1) })} /></label>
        </div>
        <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
        <label className="field">Expira em<input value={draft.expiresAt || ""} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} placeholder="2026-12-31" /></label>
        <label className="field">Descrição<textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyCoupon)}>Novo</button>
          {draft.id ? <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "coupons", id: draft.id }), "Cupom apagado.")}><Trash2 size={18} aria-hidden />Apagar</button> : null}
        </div>
      </form>
    </div>
  );
}

function FaqAdmin({
  faqs,
  onAction
}: {
  faqs: Faq[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Faq>(emptyFaq);
  const id = draft.id || toSlug(draft.question);

  return (
    <div className="admin-grid">
      <DocumentList title="FAQs" items={faqs} getLabel={(faq) => faq.question} onSelect={setDraft} />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(
          () => saveAdminDocument({ collection: "faqs", id, data: asPlainRecord({ ...draft, id }) }),
          "FAQ salva."
        );
      }}>
        <h2>Pergunta frequente</h2>
        <label className="field">Pergunta<input value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} /></label>
        <label className="field">Resposta<textarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} /></label>
        <div className="form-row">
          <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
          <label className="field">Ordem<input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: parseNumber(event.target.value) })} /></label>
        </div>
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyFaq)}>Nova</button>
          {draft.id ? <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "faqs", id: draft.id }), "FAQ apagada.")}><Trash2 size={18} aria-hidden />Apagar</button> : null}
        </div>
      </form>
    </div>
  );
}

const emptyBanner: Banner = {
  id: "",
  title: "",
  imageUrl: "",
  buttonLabel: "",
  url: "/",
  status: "active",
  sortOrder: 10
};

function BannerAdmin({
  banners,
  onAction
}: {
  banners: Banner[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<Banner>(emptyBanner);
  const id = draft.id || toSlug(draft.title);

  async function upload(file: File) {
    const url = await uploadAdminImage(file, `public/banners/${id || "banner"}-${Date.now()}-${file.name}`);
    setDraft((current) => ({ ...current, imageUrl: url }));
  }

  return (
    <div className="admin-grid">
      <DocumentList title="Banners" items={banners} getLabel={(banner) => banner.title} onSelect={setDraft} />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(() => saveAdminDocument({ collection: "banners", id, data: asPlainRecord({ ...draft, id }) }), "Banner salvo.");
      }}>
        <h2>Banner</h2>
        <label className="field">Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field">Imagem<input value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></label>
        <div className="form-row">
          <label className="field">Botão<input value={draft.buttonLabel} onChange={(event) => setDraft({ ...draft, buttonLabel: event.target.value })} /></label>
          <label className="field">URL<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
        </div>
        <div className="form-row">
          <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
          <label className="field">Ordem<input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: parseNumber(event.target.value) })} /></label>
        </div>
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyBanner)}>Novo</button>
          {draft.id ? <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "banners", id: draft.id }), "Banner apagado.")}><Trash2 size={18} aria-hidden />Apagar</button> : null}
        </div>
      </form>
    </div>
  );
}

const emptyPopup: StorePopup = {
  id: "",
  title: "",
  body: "",
  imageUrl: "",
  buttonLabel: "",
  url: "/",
  type: "welcome",
  status: "active",
  sortOrder: 10
};

function PopupAdmin({
  popups,
  onAction
}: {
  popups: StorePopup[];
  onAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [draft, setDraft] = useState<StorePopup>(emptyPopup);
  const id = draft.id || toSlug(draft.title);

  async function upload(file: File) {
    const url = await uploadAdminImage(file, `public/popups/${id || "popup"}-${Date.now()}-${file.name}`);
    setDraft((current) => ({ ...current, imageUrl: url }));
  }

  return (
    <div className="admin-grid">
      <DocumentList title="Popups" items={popups} getLabel={(popup) => popup.title} onSelect={setDraft} />
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        onAction(() => saveAdminDocument({ collection: "popups", id, data: asPlainRecord({ ...draft, id }) }), "Popup salvo.");
      }}>
        <h2>Popup</h2>
        <label className="field">Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field">Texto<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
        <label className="field">Imagem<input value={draft.imageUrl || ""} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></label>
        <div className="form-row">
          <label className="field">Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as StorePopup["type"] })}><option value="welcome">Boas-vindas</option><option value="promotion">Promoção</option><option value="coupon">Cupom</option><option value="update">Atualização</option></select></label>
          <label className="field">Ordem<input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: parseNumber(event.target.value) })} /></label>
        </div>
        <div className="form-row">
          <label className="field">Botão<input value={draft.buttonLabel} onChange={(event) => setDraft({ ...draft, buttonLabel: event.target.value })} /></label>
          <label className="field">URL<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
        </div>
        <StatusSelect value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
        <div className="action-row">
          <button className="primary-button" type="submit"><Save size={18} aria-hidden />Salvar</button>
          <button className="secondary-button" type="button" onClick={() => setDraft(emptyPopup)}>Novo</button>
          {draft.id ? <button className="danger-button" type="button" onClick={() => onAction(() => deleteAdminDocument({ collection: "popups", id: draft.id }), "Popup apagado.")}><Trash2 size={18} aria-hidden />Apagar</button> : null}
        </div>
      </form>
    </div>
  );
}

function DocumentList<T extends { id: string }>({
  title,
  items,
  getLabel,
  onSelect
}: {
  title: string;
  items: T[];
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
}) {
  return (
    <aside className="document-list">
      <h2>{title}</h2>
      {items.map((item) => (
        <button type="button" key={item.id} onClick={() => onSelect(item)}>
          {getLabel(item)}
        </button>
      ))}
    </aside>
  );
}
