"use client";

import Link from "next/link";

export function LegalFooter() {
  return (
    <div className="w-full max-w-6xl mx-auto px-5 py-6 space-y-3">
      {/* Disclaimer medico */}
      <div className="text-center text-xs text-gray-500 space-y-1 leading-relaxed">
        <p>
          <strong>Uso esclusivo per professionisti sanitari.</strong>{" "}
          Questo strumento è un supporto decisionale basato sulle linee guida SIPMO-SICMF e SIPMO-SIOMMMS.
          Non sostituisce il giudizio clinico, la diagnosi o la prescrizione terapeutica.
        </p>
        <p>
          © {new Date().getFullYear()} Helaglobe S.r.l. —{" "}
          <Link href="/privacy" className="hover:underline" style={{ color: '#0e88a5' }}>
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}