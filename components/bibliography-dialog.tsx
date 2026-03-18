"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bibliographyReferences } from "@/lib/bibliography";
import { BookOpen } from "lucide-react";

export function BibliographyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <BookOpen className="w-4 h-4 mr-2" />
          Consulta la Bibliografia
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Bibliografia</DialogTitle>
          <DialogDescription>
            riferimenti bibliografici e linee guida utilizzate per l&apos;algoritmo
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed pr-2">
          {bibliographyReferences.map((ref, index) => (
            <div key={ref.id} className="border-l-2 border-primary/30 pl-4 py-2">
              <p className="text-foreground">
                <strong>{index + 1}. {ref.authors}.</strong>
                {' '}
                <a 
                  href={`https://doi.org/${ref.doi}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {ref.title}
                </a>.
                {' '}<span className="italic">{ref.journal}.</span> {ref.year}
                {ref.volume && `;${ref.volume}`}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                DOI:{' '}
                <a 
                  href={`https://doi.org/${ref.doi}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {ref.doi}
                </a>
                {' '}| PMID:{' '}
                <a 
                  href={`https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {ref.pmid}
                </a>
                {ref.pmcid && (
                  <>
                    {' '}| PMCID:{' '}
                    <a 
                      href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${ref.pmcid}/`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {ref.pmcid}
                    </a>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

