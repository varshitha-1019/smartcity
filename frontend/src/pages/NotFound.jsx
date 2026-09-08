import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./NotFound.css";

function NotFound() {
  const { user } = useAuth();

  const homeLink =
    user?.role === "authority"
      ? "/authority"
      : user?.role === "administrator"
        ? "/admin"
        : "/";

  return (
    <main className="not-found-page">
      <h1>404</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to={homeLink}>Go back home</Link>
    </main>
  );
}

export default NotFound;
