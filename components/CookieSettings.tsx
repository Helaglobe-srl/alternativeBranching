"use client";

import { useEffect, useState } from "react";

export function CookieSettings() {
  const [open, setOpen] = useState(false);
  const [statisticsEnabled, setStatisticsEnabled] = useState(false);

  useEffect(() => {
    if (open) {
      const consent = localStorage.getItem("cookie_consent");
      setStatisticsEnabled(consent === "accepted");
    }
  }, [open]);

  const save = () => {
    const prev = localStorage.getItem("cookie_consent");
    const next = statisticsEnabled ? "accepted" : "rejected";
    localStorage.setItem("cookie_consent", next);
    setOpen(false);
    // ricarica solo se cambia da rifiutato ad accettato
    if (prev !== "accepted" && next === "accepted") {
      window.location.reload();
    }
  };

  return (
    <>
      {/* icona flotante */}
      <button
        onClick={() => setOpen(true)}
        title="Preferenze cookie"
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{ backgroundColor: "#0e88a5" }}
        aria-label="Gestisci preferenze cookie"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.8"/>
          <circle cx="8.5" cy="9" r="1.2" fill="white"/>
          <circle cx="14" cy="7.5" r="1" fill="white"/>
          <circle cx="15.5" cy="13" r="1.4" fill="white"/>
          <circle cx="9.5" cy="14.5" r="1" fill="white"/>
          <circle cx="12.5" cy="11" r="0.8" fill="white"/>
        </svg>
      </button>

      {/* pannello preferenze */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

            {/* header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Preferenze cookie</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Chiudi"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* righe cookie */}
            <div className="space-y-3 text-sm text-gray-700">

              {/* cookie tecnici — sempre attivi, non cliccabile */}
              <div className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50">
                <div className="mt-0.5 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center bg-green-100 border border-green-300">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800">Cookie tecnici</p>
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      Sempre attivi
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">Necessari al funzionamento del sito.</p>
                </div>
              </div>

              {/* statistiche anonime — cliccabile */}
              <label
                htmlFor="statistics-toggle"
                className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors select-none"
                style={{
                  borderColor: statisticsEnabled ? "#0e88a5" : "#e5e7eb",
                  backgroundColor: statisticsEnabled ? "#f0fafc" : "white",
                }}
              >
                {/* checkbox custom */}
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    id="statistics-toggle"
                    type="checkbox"
                    checked={statisticsEnabled}
                    onChange={(e) => setStatisticsEnabled(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center border-2 transition-colors"
                    style={{
                      backgroundColor: statisticsEnabled ? "#0e88a5" : "white",
                      borderColor: statisticsEnabled ? "#0e88a5" : "#d1d5db",
                    }}
                  >
                    {statisticsEnabled && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Statistiche anonime</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Contiamo le visite alle pagine e i PDF scaricati. Nessun dato personale o sanitario.
                  </p>
                </div>
              </label>
            </div>

            {/* bottone salva */}
            <button
              onClick={save}
              className="w-full px-4 py-2.5 text-sm text-white rounded-xl font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#0e88a5" }}
            >
              Salva preferenze
            </button>

            <p className="text-xs text-gray-400 text-center">
              Puoi modificare le tue preferenze in qualsiasi momento.{" "}
              <a href="/privacy" className="hover:underline" style={{ color: "#0e88a5" }}>
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}