const PDF_API_URL = "https://pdf-gen-production-6c81.up.railway.app";

export async function generateGenericPdf(html: string): Promise<string> {
  const response = await fetch(`${PDF_API_URL}/api/generate-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "https://admin.atap.solar",
      options: {
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.5cm",
          right: "0.5cm",
          bottom: "0.5cm",
          left: "0.5cm",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PDF API error: ${errorText}`);
  }

  const data = await response.json();
  const pdfId = data.pdfId;

  if (!pdfId) {
    throw new Error("PDF ID not received from API");
  }

  return pdfId;
}
