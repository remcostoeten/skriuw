import Sidebar from "@/components/Sidebar";
import LeftToolbar from "@/components/LeftToolbar";
import TopToolbar from "@/components/TopToolbar";
import MainContent from "@/components/MainContent";
import Footer from "@/components/Footer";
import { useState } from "react";

export default function Index() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-haptic-dark overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Toolbar - hidden on mobile */}
        <div className="hidden lg:block">
          <LeftToolbar />
        </div>

        {/* Sidebar - slides in on mobile */}
        <div className={`
          fixed lg:static inset-y-0 left-0 z-30 lg:z-0
          transform transition-transform duration-200 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <Sidebar />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopToolbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
          <MainContent />
          <Footer />
        </div>
      </div>
    </div>
  );
}
