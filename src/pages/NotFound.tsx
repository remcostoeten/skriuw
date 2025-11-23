import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState } from "@/shared/ui/empty-state";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center bg-background">
        <EmptyState
          message="404 - Page Not Found"
          submessage={`The route "${location.pathname}" does not exist.`}
          actions={[
            {
              label: "Return to Home",
              onClick: () => navigate("/"),
            },
          ]}
        />
      </div>
    </AppLayout>
  );
};

export default NotFound;
