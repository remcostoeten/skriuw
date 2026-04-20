import { Suspense } from "react";
import { ProfilePage } from "@/features/profile";

function ProfilePageFallback() {
  return null;
}

export default function ProfileRoute() {
  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfilePage />
    </Suspense>
  );
}
