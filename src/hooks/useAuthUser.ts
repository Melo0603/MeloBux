import { useContext } from "react";
import { AuthContext } from "../context/AuthContextCore";

export function useAuthUser() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthUser deve ser usado dentro de AuthProvider.");
  }
  return context;
}
