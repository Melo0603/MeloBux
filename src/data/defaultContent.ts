import type {
  Banner,
  Category,
  Coupon,
  Faq,
  Product,
  Review,
  StorePopup,
  StoreSettings,
  UserProfile
} from "../types";

const ownerUserId = "3962515182";
const ownerAvatar = "/assets/melo-hero-cutout.png";
const ownerHeadshot = "/assets/melo-headshot.png";
const gamepassImage = "/assets/category-gamepass-drawing.png";
const robuxImage = "/assets/category-robux-drawing.png";
const clrImage = "/assets/category-robux-drawing.png";

const robuxPackages = [
  { quantity: 100, price: 8.99 },
  { quantity: 250, price: 11.99 },
  { quantity: 400, price: 17.99 },
  { quantity: 500, price: 19.99 },
  { quantity: 800, price: 31.99 },
  { quantity: 1000, price: 37.99 }
];

export const fallbackCategories: Category[] = [
  {
    id: "gamepass",
    slug: "gamepass",
    name: "Gamepass",
    status: "active",
    sortOrder: 10,
    imageUrl: gamepassImage,
    bannerUrl: gamepassImage,
    description:
      "Gamepasses para comprar de forma simples. Informe seu usuario Roblox, use cupom se tiver e finalize pelo checkout seguro.",
    deliveryTime: "10 minutos a 24 horas apos confirmacao do pagamento.",
    importantInfo: "Confira o usuario Roblox antes de pagar.",
    deliveryNotice: "Depois da entrega finalizada, voce podera avaliar seu pedido.",
    ratingAverage: 0,
    ratingCount: 0
  },
  {
    id: "robux-na-conta",
    slug: "robux-na-conta",
    name: "Robux na Conta",
    status: "active",
    sortOrder: 20,
    imageUrl: robuxImage,
    bannerUrl: robuxImage,
    description: "Robux na conta com compra direta e acompanhamento pelo numero do pedido.",
    deliveryTime: "Ate 24 horas apos confirmacao do pagamento.",
    importantInfo: "Nunca compartilhe senha. A loja so precisa do usuario Roblox.",
    deliveryNotice: "A avaliacao aparece apenas apos o pedido ser marcado como entregue.",
    ratingAverage: 0,
    ratingCount: 0
  },
  {
    id: "clr",
    slug: "clr",
    name: "CLR",
    status: "active",
    sortOrder: 30,
    imageUrl: clrImage,
    bannerUrl: clrImage,
    description: "CLR com compra simples, entrega acompanhada e suporte direto pelo chat.",
    deliveryTime: "Ate 24 horas apos confirmacao do pagamento.",
    importantInfo: "Confira o usuario Roblox antes de pagar.",
    deliveryNotice: "A avaliacao aparece apenas apos o pedido ser marcado como entregue.",
    ratingAverage: 0,
    ratingCount: 0
  }
];

export const fallbackProducts: Product[] = [
  ...robuxPackages.map((item, index) => ({
    id: `gamepass-${item.quantity}`,
    categorySlug: "gamepass",
    name: `${item.quantity} Robux via Gamepass`,
    quantity: item.quantity,
    price: item.price,
    stock: 999,
    status: "active" as const,
    sortOrder: (index + 1) * 10,
    description: `Pacote de ${item.quantity} Robux entregue via Gamepass.`,
    deliveryTime: "10 minutos a 24 horas",
    guarantees: [],
    paymentMethods: ["Pix", "Cartao de credito", "Saldo Mercado Pago"],
    faqIds: [],
    imageUrl: gamepassImage,
    gallery: [gamepassImage],
    soldCount: 0,
    visitCount: 0
  })),
  ...robuxPackages.map((item, index) => ({
    id: `conta-${item.quantity}`,
    categorySlug: "robux-na-conta",
    name: `${item.quantity} Robux na Conta`,
    quantity: item.quantity,
    price: item.price,
    stock: 999,
    status: "active" as const,
    sortOrder: (index + 1) * 10,
    description: `Pacote de ${item.quantity} Robux na conta.`,
    deliveryTime: "Ate 24 horas",
    guarantees: [],
    paymentMethods: ["Pix", "Cartao de credito", "Saldo Mercado Pago"],
    faqIds: [],
    imageUrl: robuxImage,
    gallery: [robuxImage],
    soldCount: 0,
    visitCount: 0
  })),
  ...robuxPackages.map((item, index) => ({
    id: `clr-${item.quantity}`,
    categorySlug: "clr",
    name: `${item.quantity} Robux CLR`,
    quantity: item.quantity,
    price: item.price,
    stock: 999,
    status: "active" as const,
    sortOrder: (index + 1) * 10,
    description: `Pacote de ${item.quantity} Robux na categoria CLR.`,
    deliveryTime: "Ate 24 horas",
    guarantees: [],
    paymentMethods: ["Pix", "Cartao de credito", "Saldo Mercado Pago"],
    faqIds: [],
    imageUrl: clrImage,
    gallery: [clrImage],
    soldCount: 0,
    visitCount: 0
  }))
];

export const fallbackReviews: Review[] = [];

export const fallbackFaqs: Faq[] = [];

export const fallbackSettings: StoreSettings = {
  id: "public",
  storeName: "MeloBux",
  homeBannerImageUrl: ownerAvatar,
  ownerName: "Melo",
  ownerRobloxUsername: "carloss0603",
  ownerRobloxUserId: ownerUserId,
  ownerAvatarUrl: ownerHeadshot,
  tiktokUrl: "https://www.tiktok.com/@carloss0603",
  instagramUrl: "",
  whatsappUrl: "",
  notice: "Compra simples, cupom no checkout e avaliacao liberada apos entrega.",
  policy:
    "A MeloBux processa pedidos apos confirmacao do pagamento. Nunca pedimos senha da conta Roblox.",
  guarantees: ["Compra segura", "Entrega rapida", "Cupom no checkout"],
  paymentMethods: ["Pix", "Cartao de credito", "Saldo Mercado Pago"]
};

export const fallbackCoupons: Coupon[] = [
  {
    id: "MELO10",
    code: "MELO10",
    type: "percent",
    value: 10,
    status: "active",
    maxUses: 250,
    usedCount: 0,
    minOrderValue: 25,
    oncePerUser: true,
    maxUsesPerUser: 1,
    description: "10% de desconto em compras a partir de R$ 25,00."
  }
];

export const fallbackBanners: Banner[] = [
  {
    id: "principal-melobux",
    title: "Comprar Robux mais barato",
    imageUrl: ownerAvatar,
    buttonLabel: "Comprar agora",
    url: "/categoria/gamepass",
    status: "active",
    sortOrder: 10
  }
];

export const fallbackPopups: StorePopup[] = [];

export const fallbackProfile: UserProfile = {
  id: "local",
  displayName: "Melo",
  photoUrl: ownerHeadshot,
  robloxUsername: "carloss0603",
  robloxUserId: ownerUserId,
  role: "customer",
  soundEnabled: true
};
