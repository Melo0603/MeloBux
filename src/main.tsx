import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { PageSkeleton } from "./components/LoadingState";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { NotFoundPage } from "./pages/NotFoundPage";
import "./styles.css";

const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const CartPage = lazy(() => import("./pages/CartPage").then((module) => ({ default: module.CartPage })));
const CategoryPage = lazy(() => import("./pages/CategoryPage").then((module) => ({ default: module.CategoryPage })));
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const OrderPage = lazy(() => import("./pages/OrderPage").then((module) => ({ default: module.OrderPage })));
const ProductPage = lazy(() => import("./pages/ProductPage").then((module) => ({ default: module.ProductPage })));
const PurchasesPage = lazy(() => import("./pages/PurchasesPage").then((module) => ({ default: module.PurchasesPage })));

function lazyPage(element: ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: lazyPage(<HomePage />) },
      { path: "categoria/:slug", element: lazyPage(<CategoryPage />) },
      { path: "produto/:productId", element: lazyPage(<ProductPage />) },
      { path: "carrinho", element: lazyPage(<CartPage />) },
      { path: "cupons", element: <Navigate to="/#cupons" replace /> },
      { path: "avaliacoes", element: <Navigate to="/#avaliacoes" replace /> },
      { path: "pedido/:orderId", element: lazyPage(<OrderPage />) },
      { path: "compras", element: <ProtectedRoute>{lazyPage(<PurchasesPage />)}</ProtectedRoute> },
      { path: "login", element: lazyPage(<LoginPage />) },
      {
        path: "admin",
        element: <ProtectedRoute>{lazyPage(<AdminPage />)}</ProtectedRoute>
      },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </AuthProvider>
  </StrictMode>
);
