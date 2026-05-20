export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { image, mediaType } = JSON.parse(event.body);
    if (!image) return { statusCode: 400, body: JSON.stringify({ error: "Geen afbeelding meegestuurd" }) };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
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

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || "API-fout" }) };
    }

    const firstPass = data.content?.[0]?.text || "";

    // Second pass: verify transcription against the image
    const res2 = await fetch("https://api.anthropic.com/v1/messages", {
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
              text: `Hier is een transcriptie van de tekst in deze afbeelding:\n\n${firstPass}\n\n---\n\nVergelijk deze transcriptie woord voor woord met wat er letterlijk in de afbeelding staat. Corrigeer uitsluitend de woorden of tekens waar de transcriptie afwijkt van de afbeelding — inclusief spelfouten, typfouten en verkeerde interpunctie die wél in de afbeelding staan maar niet in de transcriptie.\n\nBelangrijk:\n- Voeg GEEN verbeteringen toe die niet in de afbeelding staan\n- Verander NIETS wat al correct is overgenomen, ook niet als het een fout bevat\n- Geef alleen de gecorrigeerde volledige tekst terug, geen uitleg`
            }
          ]
        }]
      })
    });

    const data2 = await res2.json();
    if (!res2.ok) {
      // If second pass fails, return first pass result
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: firstPass })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: data2.content?.[0]?.text || firstPass })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
