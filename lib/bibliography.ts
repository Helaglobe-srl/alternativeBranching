// bibliografia e riferimenti bibliografici per l'algoritmo mronj

export interface BibliographyReference {
  id: string;
  authors: string;
  title: string;
  journal: string;
  year: string;
  volume?: string;
  pages?: string;
  doi: string;
  pmid: string;
  pmcid?: string;
}

export const bibliographyReferences: BibliographyReference[] = [
  {
    id: "campisi2020",
    authors: "Campisi G, Mauceri R, Bertoldo F, Bettini G, Biasotto M, Colella G, Consolo U, Di Fede O, Favia G, Fusco V, Gabriele M, Lo Casto A, Lo Muzio L, Marcianò A, Mascitti M, Meleti M, Mignogna MD, Oteri G, Panzarella V, Romeo U, Santarelli A, Vescovi P, Marchetti C, Bedogni A",
    title: "medication-related osteonecrosis of jaws (MRONJ) prevention and diagnosis: italian consensus update 2020",
    journal: "int j environ res public health",
    year: "2020",
    volume: "17(16):5998",
    doi: "10.3390/ijerph17165998",
    pmid: "32824826",
    pmcid: "PMC7460511",
  },
  {
    id: "bedogni2024",
    authors: "Bedogni A, Mauceri R, Fusco V, Bertoldo F, Bettini G, Di Fede O, Lo Casto A, Marchetti C, Panzarella V, Saia G, Vescovi P, Campisi G",
    title: "italian position paper (SIPMO-SICMF) on medication-related osteonecrosis of the jaw (MRONJ)",
    journal: "oral dis",
    year: "2024",
    volume: "30(6):3679-3709",
    doi: "10.1111/odi.14887",
    pmid: "38317291",
  },
  {
    id: "bertoldo2024",
    authors: "Bertoldo F, Eller-Vainicher C, Fusco V, Mauceri R, Pepe J, Bedogni A, Palermo A, Romeo U, Guglielmi G, Campisi G",
    title: "medication related osteonecrosis (MRONJ) in the management of CTIBL in breast and prostate cancer patients. joint report by SIPMO AND SIOMMMS",
    journal: "j bone oncol",
    year: "2024",
    volume: "50:100656",
    doi: "10.1016/j.jbo.2024.100656",
    pmid: "39807373",
    pmcid: "PMC11728904",
  },
  {
    id: "ali2025",
    authors: "Ali DS, Khan AA, Morrison A, Tetradis S, Mirza RD, El Rabbany M, Abrahamsen B, Aghaloo TL, Al-Alwani H, Al-Dabagh R, Anastasilakis AD, Bhandari M, Body JJ, Brandi ML, Brignardello-Petersen R, Brown JP, Cheung AM, Compston J, Cooper C, Diez-Perez A, Ferrari SL, Guyatt G, Hanley D, Harvey NC, Josse RG, Kendler DL, Khan S, Kim S, Langdahl BL, Magopoulos C, Masri BK, Morgan SL, Morin SN, Napoli N, Obermayer-Pietsch B, Palermo A, Pepe J, Peters E, Pierroz DD, Rizzoli R, Saunders DP, Stanford CM, Sulimani R, Taguchi A, Tanaka S, Watts NB, Zamudio J, Zillikens MC, Ruggiero SL",
    title: "antiresorptive therapy to reduce fracture risk and effects on dental implant outcomes in patients with osteoporosis: a systematic review and osteonecrosis of the jaw taskforce consensus statement",
    journal: "endocr pract",
    year: "2025",
    volume: "31(5):686-698",
    doi: "10.1016/j.eprac.2025.02.016",
    pmid: "40335186",
  },
];

