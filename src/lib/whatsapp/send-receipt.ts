export async function sendReceiptViaWhatsApp(phone: string, pdfUrl: string, fileName: string) {
  // Extract digits only from phone
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error("Invalid phone number");
  }

  const response = await fetch('https://ee-baileys-production.up.railway.app/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'eternalgy-auth',
      to: cleanPhone,
      documentUrl: pdfUrl,
      fileName: fileName,
      caption: 'Here is your Official Receipt from Eternalgy Sdn Bhd.'
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return await response.json();
}
