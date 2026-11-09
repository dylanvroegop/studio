export interface InvoicePdfSettings {
  issueDateISO: string;
  paymentTermDays: number;
  invoiceDescription: string;
  showLogo: boolean;
  showQuoteReference: boolean;
  showSpecification: boolean;
  showTotalsBreakdown: boolean;
  showMaterialLaborBreakdown: boolean;
  showTransportBreakdown: boolean;
  showHourlyRateOnInvoice: boolean;
  showBankDetails: boolean;
  customPaymentText: string;
}

type InvoiceCostBreakdownSettings = Pick<InvoicePdfSettings,
  'showMaterialLaborBreakdown' | 'showTransportBreakdown' | 'showHourlyRateOnInvoice'>;

type InvoicePdfDefaultSettings = Omit<InvoicePdfSettings,
  'issueDateISO' | 'invoiceDescription' | keyof InvoiceCostBreakdownSettings>;

/** Kosten blijven een bewuste keuze per factuur, ook bij oude accountinstellingen. */
export function resolveInvoiceCostBreakdownSettings(
  stored: Partial<InvoicePdfSettings> & { showHoursBreakdown?: boolean } = {},
): InvoiceCostBreakdownSettings {
  return {
    showMaterialLaborBreakdown: stored.showMaterialLaborBreakdown === true,
    showTransportBreakdown: stored.showTransportBreakdown === true,
    showHourlyRateOnInvoice: (stored.showHourlyRateOnInvoice ?? stored.showHoursBreakdown) === true,
  };
}

export function buildInvoicePdfDefaultSettings(settings: InvoicePdfSettings): InvoicePdfDefaultSettings {
  return {
    paymentTermDays: settings.paymentTermDays,
    showLogo: settings.showLogo,
    showQuoteReference: settings.showQuoteReference,
    showSpecification: settings.showSpecification,
    showTotalsBreakdown: settings.showTotalsBreakdown,
    showBankDetails: settings.showBankDetails,
    customPaymentText: settings.customPaymentText,
  };
}
