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
              text: "Transcribeer de handgeschreven of gedrukte tekst in deze afbeelding zo nauwkeurig mogelijk. Regels:\n- Kopieer de tekst exact zoals hij er staat, inclusief spelfouten, doorhalingen, afkortingen en interpunctiefouten\n- Verbeter NIETS — geen spelfouten, geen grammatica, geen interpunctie\n- Gebruik dezelfde alinea-indeling en regelafbrekingen als in het origineel\n- Geef alleen de tekst terug, geen uitleg, geen commentaar, geen aanhalingstekens eromheen"
            }
          ]
        }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.error?.message || "API-fout" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: data.content?.[0]?.text || "" })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
