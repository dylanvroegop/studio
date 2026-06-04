export interface SpendingCategoryBreakdown {
  category: string;
  totalAmount: number;
  sharePct: number;
  businessPct: number;
  personalPct: number;
  explanation: string;
}

export interface SpendingAnalysisReport {
  periodSummary: {
    transactionCount: number;
    outgoingCount: number;
    totalOutgoing: number;
    shortConclusion: string;
  };
  categoryBreakdown: SpendingCategoryBreakdown[];
  businessPersonalSummary: {
    businessAmount: number;
    personalAmount: number;
    mixedOrUnknownAmount: number;
    explanation: string;
  };
  neededVsAvoidable: {
    likelyNeeded: string[];
    possiblyAvoidable: string[];
  };
  keyFindings: string[];
  nextActions: string[];
}

function euro(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export async function exportSpendingAnalysisPdf(filename: string, report: SpendingAnalysisReport): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  let y = 52;
  const left = 40;
  const lineGap = 16;

  const addLine = (text: string, bold = false): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const parts = doc.splitTextToSize(text, 510) as string[];
    for (const part of parts) {
      doc.text(part, left, y);
      y += lineGap;
      if (y > 790) {
        doc.addPage();
        y = 52;
      }
    }
  };

  addLine('Uitgavenanalyse rapport', true);
  addLine(`Gegenereerd op: ${dateLabel(new Date())}`);
  y += 6;

  addLine('Kernsamenvatting', true);
  addLine(`Aantal transacties: ${report.periodSummary.transactionCount}`);
  addLine(`Aantal uitgaven: ${report.periodSummary.outgoingCount}`);
  addLine(`Totale uitgaven: ${euro(report.periodSummary.totalOutgoing)}`);
  addLine(report.periodSummary.shortConclusion || '');
  y += 6;

  addLine('Business vs Personal', true);
  addLine(`Business: ${euro(report.businessPersonalSummary.businessAmount)}`);
  addLine(`Personal: ${euro(report.businessPersonalSummary.personalAmount)}`);
  addLine(`Mixed/Onzeker: ${euro(report.businessPersonalSummary.mixedOrUnknownAmount)}`);
  if (report.businessPersonalSummary.explanation) addLine(report.businessPersonalSummary.explanation);
  y += 6;

  addLine('Categorie verdeling', true);
  if (report.categoryBreakdown.length === 0) {
    addLine('Geen categorieen gevonden.');
  } else {
    report.categoryBreakdown.forEach((item, index) => {
      addLine(`${index + 1}. ${item.category}: ${euro(item.totalAmount)} (${item.sharePct.toFixed(1)}%)`, true);
      addLine(`Business ${item.businessPct.toFixed(1)}% | Personal ${item.personalPct.toFixed(1)}%`);
      if (item.explanation) addLine(item.explanation);
    });
  }
  y += 6;

  addLine('Wat was waarschijnlijk nodig?', true);
  if (report.neededVsAvoidable.likelyNeeded.length === 0) {
    addLine('Geen specifieke punten.');
  } else {
    report.neededVsAvoidable.likelyNeeded.forEach((item, index) => addLine(`${index + 1}. ${item}`));
  }
  y += 6;

  addLine('Wat had mogelijk voorkomen kunnen worden?', true);
  if (report.neededVsAvoidable.possiblyAvoidable.length === 0) {
    addLine('Geen specifieke punten.');
  } else {
    report.neededVsAvoidable.possiblyAvoidable.forEach((item, index) => addLine(`${index + 1}. ${item}`));
  }
  y += 6;

  addLine('Belangrijkste bevindingen', true);
  if (report.keyFindings.length === 0) {
    addLine('Geen extra bevindingen.');
  } else {
    report.keyFindings.forEach((item, index) => addLine(`${index + 1}. ${item}`));
  }
  y += 6;

  addLine('Aanbevolen vervolgstappen', true);
  if (report.nextActions.length === 0) {
    addLine('Geen vervolgstappen geadviseerd.');
  } else {
    report.nextActions.forEach((item, index) => addLine(`${index + 1}. ${item}`));
  }

  doc.save(filename);
}
