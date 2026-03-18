import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full border-t border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="text-center space-y-8">
          {/* sponsors section */}
          <div className="flex flex-col items-center">
            {/* patrocinio */}
            <div className="flex flex-col items-center space-y-3 pt-6 border-t border-border/40">
              <p className="text-sm" style={{ color: "#0e88a5" }}>
                Un progetto
              </p>

              <div className="relative w-40 h-16 md:w-48 md:h-20">
                <Image
                  src="/images/logo_hg.webp"
                  alt="HELAGLOBE"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            {/* <div className="flex flex-col items-center gap-3 mb-8">
              <p className="text-sm" style={{ color: "#0e88a5" }}>
                con il patrocinio di:
              </p>

              <div className="relative w-[250px] h-20">
                <Image
                  src="/images/Logo_GIBIS.png"
                  alt="GIBIS"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div> */}

            {/* contributo
            <p className="text-sm mb-6" style={{ color: "#0e88a5" }}>
              e con il contributo non condizionante di:
            </p>

            <div className="flex flex-row flex-wrap items-center justify-center gap-8 md:gap-12">
              <div className="relative w-32 h-12 md:w-40 md:h-16">
                <Image
                  src="/images/sponsor/sandoz.webp"
                  alt="Sandoz"
                  fill
                  className="object-contain"
                />
              </div>

              <div className="relative w-32 h-12 md:w-40 md:h-16">
                <Image
                  src="/images/sponsor/theramex.webp"
                  alt="Theramex"
                  fill
                  className="object-contain"
                />
              </div>
            </div>*/}
          </div> 
        </div>
      </div>

      {/* legal info bar */}
      <div className="border-t border-border/20 bg-muted/40">
        <div className="max-w-6xl mx-auto px-5 py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Helaglobe Srl</span>
            {" · "}Sede legale: Via L. Da Vinci 16, 50132 Firenze
            {" · "}Sede operativa: Via della Cernaia, 6 – 50129 Firenze
            {" · "}P.IVA 06326550487
            {" · "}Tel.{" "}
            <a href="tel:+390554939527" className="hover:underline">
              055 49 39 527
            </a>
            {" · "}Email:{" "}
            <a href="mailto:info@helaglobe.com" className="hover:underline">
              info@helaglobe.com
            </a>
            {" · "}
            <span className="whitespace-nowrap">
              PEC:{" "}
              <a href="mailto:helaglobe@pec.it" className="hover:underline">
                helaglobe@pec.it
              </a>
            </span>
            {" · "}
            <Link href="/privacy" className="hover:underline" style={{ color: "#0e88a5" }}>
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}