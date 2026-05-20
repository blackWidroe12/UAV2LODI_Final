'use client';

import { motion } from 'framer-motion';
import { Topbar } from './topbar';
import { PipelineSidebar } from './pipeline-sidebar';
import { CommandConsole } from './command-console';
import { CoordinateBar } from './coordinate-bar';

interface CockpitLayoutProps {
  children: React.ReactNode;
}

export function CockpitLayout({ children }: CockpitLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-screen w-screen flex flex-col overflow-hidden bg-background"
    >
      {/* Top Bar */}
      <Topbar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Pipeline Sidebar */}
        <PipelineSidebar />

        {/* Main Viewport Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Content */}
          <main className="flex-1 overflow-hidden relative">
            {children}
          </main>

          {/* Command Console */}
          <CommandConsole />
        </div>
      </div>

      {/* Coordinate Status Bar */}
      <CoordinateBar />
    </motion.div>
  );
}
