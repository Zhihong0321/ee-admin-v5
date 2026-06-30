export const RECEIPT_TEMPLATE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 0;
      background: white;
      color: #000;
      font-size: 11px;
    }

    .container {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm;
      box-sizing: border-box;
      margin: 0 auto;
    }

    .header-info {
      text-align: center;
      margin-bottom: 25px;
      line-height: 1.4;
    }

    .company-name {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .company-details {
      font-size: 11px;
    }

    .title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      margin-top: 30px;
      margin-bottom: 30px;
      letter-spacing: 0.5px;
    }

    .top-grid {
      display: grid;
      grid-template-columns: 140px 1fr 100px 150px;
      margin-bottom: 20px;
      line-height: 1.5;
    }

    .address-box {
      grid-column: 2;
      text-transform: uppercase;
    }

    .voucher-label {
      grid-column: 3;
      text-align: right;
      padding-right: 10px;
    }
    
    .voucher-val {
      grid-column: 4;
    }

    .sum-row {
      display: flex;
      margin-top: 20px;
      margin-bottom: 5px;
    }

    .sum-label {
      width: 140px;
    }

    .sum-val {
      text-decoration: underline;
      font-weight: 500;
    }

    .section-title {
      font-style: italic;
      margin-top: 15px;
      margin-bottom: 5px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }

    .payment-table {
      width: 50%;
      border: 1px solid #000;
    }

    .payment-table th, .payment-table td {
      border: 1px solid #000;
      padding: 5px 8px;
      text-align: left;
    }
    
    .payment-table th:last-child, .payment-table td:last-child {
      text-align: right;
    }

    .desc-table th {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 8px;
      text-align: left;
    }

    .desc-table th:last-child {
      text-align: right;
    }

    .desc-table td {
      padding: 8px;
      border-bottom: 1px solid #000;
    }

    .desc-table td:last-child {
      text-align: right;
    }

    .total-row {
      display: flex;
      justify-content: flex-end;
      padding: 8px 10px;
      font-weight: bold;
      border-bottom: 1px solid #000;
      font-size: 13px;
    }
    
    .total-label {
      margin-right: 30px;
    }

    .footer {
      margin-top: 20px;
      font-size: 10px;
      line-height: 1.4;
    }

    .footer-title {
      margin-bottom: 5px;
    }
    
    .footer-points {
      padding-left: 0;
      list-style-type: none;
      margin: 0;
    }
    
    .footer-sig {
      margin-top: 15px;
      font-weight: bold;
      text-transform: uppercase;
    }

  </style>
</head>
<body>
  <div class="container">
    <div class="header-info">
      <div class="company-name">Eternalgy Sdn. Bhd.</div>
      <div class="company-details">
        202301029164 (1523087-A)<br>
        TIN No. : C5815978903<br>
        23-01, Jalan Mutiara Emas 10/19, Taman Mount Austin, 81100 Johor Bahru, Johor, Malaysia
      </div>
    </div>

    <div class="title">OFFICIAL RECEIPT</div>

    <div class="top-grid">
      <div>RECEIVED FROM</div>
      <div class="address-box">
        <div>{{customerName}}</div>
        {{#if customerAddress}}
          <div>{{customerAddress}}</div>
        {{/if}}
      </div>
      <div class="voucher-label">
        <div>Voucher No.:</div>
        <div style="margin-top: 10px;">Date:</div>
      </div>
      <div class="voucher-val">
        <div>{{voucherNo}}</div>
        <div style="margin-top: 10px;">{{receiptDate}}</div>
      </div>
    </div>

    <div class="sum-row">
      <div class="sum-label">RECEIVE THE SUM OF</div>
      <div class="sum-val">{{amountInWords}}</div>
    </div>

    <div class="section-title">Payment Issued</div>
    <table class="payment-table">
      <thead>
        <tr>
          <th>Payment By</th>
          <th>Cheque No.</th>
          <th>Payment Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{{paymentMethod}}</td>
          <td>{{chequeNo}}</td>
          <td>{{paymentAmount}}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Paid For</div>
    <table class="desc-table">
      <thead>
        <tr>
          <th style="width: 15%">Acc. No.</th>
          <th style="width: 65%">Description</th>
          <th style="width: 20%">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{{invoiceRef}}</td>
          <td>{{description}}</td>
          <td>{{paymentAmount}}</td>
        </tr>
      </tbody>
    </table>

    <div class="total-row">
      <span class="total-label">TOTAL:</span>
      <span>{{paymentAmount}}</span>
    </div>

    <div class="footer">
      <div class="footer-title">Refund Policy :</div>
      <ul class="footer-points">
        <li>1. 5% Downpayment Refund (Before ATAP /SELCO Application) - Refund will exclude a non-refundable administrative fee of RM600.</li>
        <li>2. 5% + 60% Refund (After ATAP/SELCO Application) - Refund will be subject to deductions on non-refundable charges (RM1,500)</li>
        <li>3. 35% Payment After Installation Complete (Non-Refundable) - This amount covers the cost of products and services provided by Eternalgy and includes any applicable warranties for the installed solar PV system.</li>
        <li>4. For Oversize customer Assessment Fee RM 1,000 (non-refundable).For submited CCC/PSS application form to TNB.</li>
      </ul>
      <div class="footer-sig">ETERNALGY SDN. BHD.</div>
    </div>
  </div>
</body>
</html>
`;

export function getReceiptHtml(data: any): string {
  let html = RECEIPT_TEMPLATE_HTML;

  const replaceMap: Record<string, string> = {
    '{{customerName}}': data.customerName || '',
    '{{customerAddress}}': (data.customerAddress || '').split('\\n').join('<br>'),
    '{{voucherNo}}': data.voucherNo || '',
    '{{receiptDate}}': data.receiptDate || '',
    '{{amountInWords}}': data.amountInWords || '',
    '{{paymentMethod}}': data.paymentMethod || '',
    '{{chequeNo}}': data.chequeNo || '',
    '{{paymentAmount}}': data.paymentAmount || '0.00',
    '{{invoiceRef}}': data.invoiceRef || '',
    '{{description}}': data.description || '',
  };

  // Remove address section if empty
  if (!data.customerAddress) {
    html = html.replace('{{#if customerAddress}}', '<!--');
    html = html.replace('{{/if}}', '-->');
  } else {
    html = html.replace('{{#if customerAddress}}', '');
    html = html.replace('{{/if}}', '');
  }

  for (const [key, value] of Object.entries(replaceMap)) {
    html = html.split(key).join(value);
  }

  return html;
}
