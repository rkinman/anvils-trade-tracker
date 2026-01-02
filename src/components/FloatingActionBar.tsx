import { createPortal } from "react-dom";
import React from "react";

interface FloatingActionBarProps {
  children: React.ReactNode;
  isOpen: boolean;
}

export function FloatingActionBar({ children, isOpen }: FloatingActionBarProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-3 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
        {children}
      </div>
    </div>,
    document.body
  );
} 
