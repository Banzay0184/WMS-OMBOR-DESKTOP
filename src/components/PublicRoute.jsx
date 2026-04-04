import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Для публичных маршрутов (например / — логин).
 * Если уже залогинен — редирект по активному контексту (как при восстановлении после refresh).
 * Иначе показываем children (страницу входа).
 */
const PublicRoute = ({ children }) => {
  const { isAuthenticated, activeContext, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  if (isAuthenticated) {
    if (activeContext?.type === "platform") return <Navigate to="/panel" replace />;
    if (activeContext?.type === "organization") return <Navigate to="/app" replace />;
    return <Navigate to="/select-context" replace />;
  }

  return children;
};

export default PublicRoute;
