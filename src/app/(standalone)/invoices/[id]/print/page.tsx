import { notFound } from "next/navigation";
import { getInvoiceDetails } from "@/app/(app)/invoices/actions";
import { getInvoiceIdDisplay } from "@/lib/invoice-display";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const money = (value: unknown) =>
  `RM ${(Number(value) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value: unknown) => {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const isDeduction = (item: any) =>
  item?.inv_item_type === "discount" || item?.inv_item_type === "voucher";

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const version = v === "v1" ? "v1" : "v2";

  const invoiceId = Number(id);
  if (Number.isNaN(invoiceId)) notFound();

  const invoice: any = await getInvoiceDetails(invoiceId, version);
  if (!invoice) notFound();

  const template = invoice.template || {};
  const items: any[] = invoice.items || [];

  const lineItems = items.filter((i) => !isDeduction(i));
  const deductions = items.filter((i) => isDeduction(i));

  const subtotal = lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const deductionTotal = deductions.reduce((sum, i) => sum + Math.abs(Number(i.amount) || 0), 0);
  const total = Number(invoice.total_amount) || subtotal - deductionTotal;
  const paid = Number(invoice.total_payments) || 0;
  const balance = total - paid;

  const invoiceNo = getInvoiceIdDisplay(invoice);
  const status = invoice.status || (invoice.paid ? "Paid" : "Pending");

  const companyName = template.company_name || "Atap Solar";
  const customerName = invoice.customer_name_snapshot || invoice.customer_data?.name || "—";

  return (
    <>
      <style>{css}</style>
      <PrintButton />

      <main className="sheet">
        {/* Header */}
        <header className="head">
          <div className="head-company">
            {template.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="logo" src={template.logo_url} alt={companyName} />
            ) : (
              <div className="company-name">{companyName}</div>
            )}
            <div className="company-meta">
              <div className="company-name-sm">{companyName}</div>
              {template.company_address ? <div>{template.company_address}</div> : null}
              {template.company_phone ? <div>Tel: {template.company_phone}</div> : null}
              {template.company_email ? <div>{template.company_email}</div> : null}
            </div>
          </div>

          <div className="head-doc">
            <div className="doc-title">INVOICE</div>
            <div className="doc-no">{invoiceNo}</div>
            <div className="doc-status">{status}</div>
          </div>
        </header>

        <hr className="rule" />

        {/* Meta: Bill To + dates */}
        <section className="meta">
          <div className="bill-to">
            <div className="label">Bill To</div>
            <div className="bill-name">{customerName}</div>
            {invoice.customer_address_snapshot ? (
              <div className="muted">{invoice.customer_address_snapshot}</div>
            ) : null}
            <div className="muted">
              {invoice.customer_phone_snapshot ? <span>Tel: {invoice.customer_phone_snapshot}</span> : null}
              {invoice.customer_phone_snapshot && invoice.customer_email_snapshot ? <span> · </span> : null}
              {invoice.customer_email_snapshot ? <span>{invoice.customer_email_snapshot}</span> : null}
            </div>
          </div>

          <div className="meta-dates">
            <div className="meta-row">
              <span className="label">Invoice Date</span>
              <span className="meta-val">{formatDate(invoice.invoice_date)}</span>
            </div>
            <div className="meta-row">
              <span className="label">Invoice No.</span>
              <span className="meta-val">{invoiceNo}</span>
            </div>
          </div>
        </section>

        {/* Line items */}
        <table className="items">
          <thead>
            <tr>
              <th className="col-desc">Description</th>
              <th className="col-qty">Qty</th>
              <th className="col-price">Unit Price</th>
              <th className="col-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">No items</td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const deduct = isDeduction(item);
                const amount = Number(item.amount) || 0;
                return (
                  <tr key={item.id ?? idx} className={deduct ? "deduct" : ""}>
                    <td className="col-desc">{item.description || "—"}</td>
                    <td className="col-qty">{deduct ? "" : item.qty ? Number(item.qty) : ""}</td>
                    <td className="col-price">{deduct ? "" : item.unit_price ? money(item.unit_price) : ""}</td>
                    <td className="col-amt">
                      {deduct ? `- ${money(Math.abs(amount))}` : money(amount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Totals */}
        <section className="totals-wrap">
          <div className="totals">
            <div className="t-row">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {deductionTotal > 0 ? (
              <div className="t-row deduct">
                <span>Discount</span>
                <span>- {money(deductionTotal)}</span>
              </div>
            ) : null}
            <div className="t-row t-total">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            {paid > 0 ? (
              <>
                <div className="t-row">
                  <span>Amount Paid</span>
                  <span>{money(paid)}</span>
                </div>
                <div className="t-row t-balance">
                  <span>Balance Due</span>
                  <span>{money(balance)}</span>
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* Footer: bank + terms */}
        <footer className="foot">
          {(template.bank_name || template.bank_account_no || template.bank_account_name) && (
            <div className="foot-block">
              <div className="label">Payment Details</div>
              {template.bank_name ? <div className="muted">Bank: {template.bank_name}</div> : null}
              {template.bank_account_no ? <div className="muted">Account No: {template.bank_account_no}</div> : null}
              {template.bank_account_name ? <div className="muted">Account Name: {template.bank_account_name}</div> : null}
            </div>
          )}

          {template.terms_and_conditions ? (
            <div className="foot-block">
              <div className="label">Terms &amp; Conditions</div>
              <div className="terms">{template.terms_and_conditions}</div>
            </div>
          ) : null}

          <div className="foot-sign">
            <span className="muted">Invoice created by {invoice.created_by_user_name || "System"}</span>
            <span className="thanks">Thank you for your business</span>
          </div>
        </footer>
      </main>
    </>
  );
}

const css = `
  :root { --ink:#1a1a1a; --muted:#6b6b6b; --line:#e3e3e3; --line-strong:#1a1a1a; }
  * { box-sizing: border-box; }
  body { background:#f4f4f5; margin:0; }
  .sheet {
    font-family: var(--font-inter), -apple-system, Segoe UI, sans-serif;
    color: var(--ink);
    width: 210mm;
    min-height: 297mm;
    margin: 24px auto;
    padding: 18mm 16mm;
    background: #fff;
    box-shadow: 0 8px 30px -12px rgba(0,0,0,.25);
    font-size: 11px;
    line-height: 1.5;
  }
  .label { font-size: 8px; text-transform: uppercase; letter-spacing: .09em; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
  .muted { color: var(--muted); }
  .rule { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }

  .head { display:flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo { height: 44px; object-fit: contain; margin-bottom: 8px; }
  .company-name { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
  .company-name-sm { font-weight: 600; color: var(--ink); }
  .company-meta { font-size: 10px; color: var(--muted); line-height: 1.45; }
  .head-doc { text-align: right; flex-shrink: 0; }
  .doc-title { font-size: 26px; font-weight: 700; letter-spacing: .12em; }
  .doc-no { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .doc-status { display:inline-block; margin-top: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 2px 8px; }

  .meta { display:flex; justify-content: space-between; gap: 32px; margin-bottom: 22px; }
  .bill-name { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
  .bill-to .muted { font-size: 10px; line-height: 1.5; }
  .meta-dates { text-align: right; min-width: 160px; }
  .meta-row { margin-bottom: 8px; }
  .meta-row .label { margin-bottom: 1px; }
  .meta-val { font-weight: 600; font-size: 11px; }

  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.items thead th {
    text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); font-weight: 600; padding: 0 0 8px; border-bottom: 1px solid var(--line-strong);
  }
  table.items tbody td { padding: 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .col-qty { width: 8%; text-align: right; }
  .col-price { width: 18%; text-align: right; }
  .col-amt { width: 20%; text-align: right; font-variant-numeric: tabular-nums; }
  .col-desc { width: 54%; }
  th.col-qty, th.col-price, th.col-amt { text-align: right; }
  tr.deduct td { color: #b42318; }
  td.empty { text-align: center; color: var(--muted); padding: 18px 0; }

  .totals-wrap { display:flex; justify-content: flex-end; margin-top: 14px; }
  .totals { width: 260px; }
  .t-row { display:flex; justify-content: space-between; padding: 5px 0; font-size: 11px; color: var(--muted); }
  .t-row span:last-child { color: var(--ink); font-variant-numeric: tabular-nums; }
  .t-row.deduct, .t-row.deduct span:last-child { color: #b42318; }
  .t-total { border-top: 1px solid var(--line-strong); margin-top: 4px; padding-top: 10px; font-size: 14px; font-weight: 700; color: var(--ink); }
  .t-total span:last-child { font-size: 16px; }
  .t-balance { font-weight: 700; color: var(--ink); }
  .t-balance span:last-child { font-weight: 700; }

  .foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); display:flex; flex-direction: column; gap: 14px; }
  .foot-block .muted { font-size: 10px; line-height: 1.5; }
  .terms { font-size: 8px; line-height: 1.35; color: var(--muted); text-align: justify; white-space: pre-line; }
  .foot-sign { display:flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 9px; }
  .thanks { text-transform: uppercase; letter-spacing: .14em; color: var(--muted); }

  .print-bar { position: fixed; top: 16px; right: 16px; z-index: 50; }
  .print-btn { font-family: var(--font-inter), sans-serif; background:#1a1a1a; color:#fff; border:0; border-radius: 6px; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px -4px rgba(0,0,0,.4); }
  .print-btn:hover { background:#333; }

  @media print {
    body { background: #fff; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 16mm; }
  }
`;
