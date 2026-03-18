"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie_consent", "accepted");
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem("cookie_consent", "rejected");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">

        {/* testo */}
        <div className="flex-1 text-sm text-gray-700 leading-relaxed">
          <p>
            <strong>Informativa sull&apos;utilizzo dei dati</strong> — Questo sito raccoglie
            esclusivamente <strong>statistiche anonime</strong> sull&apos;utilizzo del servizio
            (pagine visitate, valutazioni completate, PDF scaricati). Non vengono raccolti
            dati personali, dati sanitari o cookie di profilazione.{" "}
            <Link href="/privacy" className="underline hover:no-underline" style={{ color: '#0e88a5' }}>
              Leggi la Privacy Policy
            </Link>
          </p>
        </div>

        {/* bottoni + X */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={reject}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Rifiuta
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#0e88a5' }}
          >
            Accetta
          </button>

          {/* X chiude e rifiuta */}
          <button
            onClick={reject}
            className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Chiudi e rifiuta"
            title="Chiudi (rifiuta statistiche)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}