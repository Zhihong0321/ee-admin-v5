import { INVOICE_TEMPLATE_HTML } from "./invoice-template";

export function getInvoiceHtml(invoiceData: any): string {
  const template = invoiceData.template || {};
  const subtotal = parseFloat(invoiceData.subtotal) || 0;
  const sstAmount = parseFloat(invoiceData.sst_amount) || 0;
  const discountAmount = parseFloat(invoiceData.discount_amount) || 0;
  const voucherAmount = parseFloat(invoiceData.voucher_amount) || 0;
  const totalAmount = parseFloat(invoiceData.total_amount) || 0;
  const sstRate = invoiceData.sst_rate || 6;

  const replacements: Record<string, string | number> = {
    '{{INVOICE_NUMBER}}': invoiceData.invoice_number || 'N/A',
    '{{COMPANY_NAME}}': template.company_name || 'Atap Solar',
    '{{COMPANY_ADDRESS}}': template.company_address || '',
    '{{COMPANY_PHONE}}': template.company_phone || '',
    '{{COMPANY_EMAIL}}': template.company_email || '',
    '{{LOGO_URL}}': template.logo_url || 'https://admin.atap.solar/logo-08.png', // Fallback to absolute URL if possible
    '{{STATUS}}': invoiceData.status || 'Draft',
    '{{INVOICE_DATE}}': invoiceData.invoice_date || '',
    '{{DUE_DATE}}': invoiceData.due_date || '',
    '{{CUSTOMER_NAME}}': invoiceData.customer_name_snapshot || 'Valued Customer',
    '{{CUSTOMER_ADDRESS}}': invoiceData.customer_address_snapshot || '',
    '{{CUSTOMER_PHONE}}': invoiceData.customer_phone_snapshot || '',
    '{{CUSTOMER_EMAIL}}': invoiceData.customer_email_snapshot || '',
    '{{SUBTOTAL}}': subtotal.toFixed(2),
    '{{SST_RATE}}': sstRate,
    '{{SST_AMOUNT}}': sstAmount.toFixed(2),
    '{{DISCOUNT_AMOUNT}}': Math.abs(discountAmount).toFixed(2),
    '{{VOUCHER_AMOUNT}}': Math.abs(voucherAmount).toFixed(2),
    '{{TOTAL_AMOUNT}}': totalAmount.toFixed(2),
    '{{BANK_NAME}}': template.bank_name || '',
    '{{BANK_ACCOUNT_NO}}': template.bank_account_no || '',
    '{{BANK_ACCOUNT_NAME}}': template.bank_account_name || '',
    '{{TERMS}}': template.terms_and_conditions || '',
    '{{CREATED_BY}}': invoiceData.created_by_user_name || 'System'
  };

  // 1. Initial string replacement for simple placeholders
  let html = INVOICE_TEMPLATE_HTML;
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(placeholder, 'g'), String(value || ''));
  }

  // 2. Handle conditional visibility (display: none)
  const toggles = [
    { id: 'discount-row', show: discountAmount !== 0 },
    { id: 'voucher-row', show: voucherAmount !== 0 },
    { id: 'sst-row', show: sstAmount !== 0 },
    { id: 'terms-section', show: !!template.terms_and_conditions },
    { id: 'created-by-section', show: !!invoiceData.created_by_user_name }
  ];

  for (const { id, show } of toggles) {
    if (!show) {
      // Find the element with this ID and add style="display: none;" or remove it
      // Simple string replacement for these specific IDs
      html = html.replace(new RegExp(`id="${id}"`, 'g'), `id="${id}" style="display: none;"`);
    } else {
      html = html.replace(new RegExp(`id="${id}" style="display: none;"`, 'g'), `id="${id}"`);
    }
  }

  // 3. Render items list
  const items = invoiceData.items || [];
  const itemsHtml = items.map((item: any) => {
    const isDiscount = item.item_type === 'discount' || item.item_type === 'voucher';
    const priceClass = isDiscount ? 'text-red-600' : 'text-slate-900';
    const price = parseFloat(item.total_price) || 0;

    return `
      <div class="px-3 py-3 flex gap-3 items-start">
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-900 leading-snug">${item.description}</p>
          ${!isDiscount && item.qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${parseFloat(item.qty)}</p>` : ''}
        </div>
        <div class="text-right w-24">
          <p class="text-sm font-semibold ${priceClass}">${isDiscount ? '-' : ''}RM ${Math.abs(price).toFixed(2)}</p>
        </div>
      </div>
    `;
  }).join('');

  html = html.replace('<!-- Items will be rendered here via JavaScript -->', itemsHtml);

  // 4. Clean up the script tag since it's not needed for the PDF generator
  html = html.replace(/<script>[\s\S]*?<\/script>/, '');

  return html;
}
