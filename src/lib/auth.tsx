import { createContext, useContext } from "react";

export interface Me { id: number; email: string; name: string | null; role: "admin" | "user" }
export const AuthContext = createContext<{ user: Me | null; logout: () => void }>({ user: null, logout: () => {} });
export const useAuth = () => { const { user, logout } = useContext(AuthContext); return { user, logout, isAdmin: !user || user.role === "admin" }; };
/** Renders children only for admins (the server enforces this too; this just hides buttons that would 403). */
export const AdminOnly = ({ children }: { children: React.ReactNode }) => (useAuth().isAdmin ? <>{children}</> : null);
