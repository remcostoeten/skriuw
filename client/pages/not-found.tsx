import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

export default function NotFound() {

  const navigate = useNavigate();

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background cursor-pointer" onClick={() => handleNavigate("/")}>
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
        <button className="text-foreground hover:underline" onClick={() => handleNavigate("/")}>
          Return to Home
        </button>
      </div>
    </div>
  );
}