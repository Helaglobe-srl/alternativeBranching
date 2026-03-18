"use client";

import { Info } from "lucide-react";
import { useState } from "react";

interface InfoTooltipProps {
  content: string;
}

export function InfoTooltip({ content }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 ml-1.5 text-muted-foreground hover:text-primary transition-colors"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => {
          e.preventDefault();
          setIsVisible(!isVisible);
        }}
        aria-label="informazioni aggiuntive"
      >
        <Info className="w-4 h-4" />
      </button>
      
      {isVisible && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-64 sm:w-80 p-3 text-sm bg-popover text-popover-foreground rounded-md border shadow-md block">
          <span className="relative block">
            {/* freccia del tooltip */}
            <span className="absolute -left-[11px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-border block"></span>
            <span className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[5px] border-r-popover block"></span>
            {content}
          </span>
        </span>
      )}
    </span>
  );
}

