"use client";

export default function PrintButton() {
  return (
    <div className="print-bar no-print">
      <button type="button" onClick={() => window.print()} className="print-btn">
        Print / Save as PDF
      </button>
    </div>
  );
}
