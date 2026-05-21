export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const { image, mediaType } = req.body;
    if (!image) return res.status(400).json({ error: "Geen afbeelding meegestuurd" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/png", data: image }
            },
            {
              type: "text",
              text: "Je bent een OCR-systeem. Deze afbeelding bevat een screenshot van digitaal getypte tekst in een standaard lettertype. De tekst is dus perfect leesbaar — lees hem letter voor letter over zoals hij er staat.\n\nDe getranscribeerde tekst wordt daarna door een docent nagelezen en handmatig nagekeken op fouten. Het is dus niet jouw taak om fouten te verbeteren — dat doet de docent zelf. Jouw enige taak is zo nauwkeurig mogelijk overtikken.\n\nRegels:\n- Lees wat er letterlijk staat, NIET wat er logisch zou staan in de context\n- Vervang NOOIT een woord door een ander woord, ook niet als het er onlogisch uitziet\n- Kopieer spelfouten, grammaticafouten, dubbele spaties en interpunctiefouten exact over\n- Gebruik dezelfde alinea-indeling en regelafbrekingen als in het origineel\n- Geef alleen de getranscribeerde tekst terug, geen uitleg of commentaar"
            }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "API-fout" });
    }

    return res.status(200).json({ text: data.content?.[0]?.text || "" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
