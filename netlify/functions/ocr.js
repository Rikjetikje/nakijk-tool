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
        system: "Je bent een OCR-systeem. Je taak is uitsluitend het letterlijk overtikken van tekst uit afbeeldingen. Je verbetert nooit iets — geen spelfouten, geen typfouten, geen interpunctie. De docent doet de controle zelf. Jij tikt alleen over wat je ziet, teken voor teken.",
        messages: [
          {
            role: "user",
            content: "Ik ga je zo een screenshot sturen van een leerlingtekst. Het is heel belangrijk dat je de tekst exact overtikt zoals hij er staat. Spelfouten, typfouten, verkeerde interpunctie — alles moet gewoon blijven zoals het is. Kun je dat doen?"
          },
          {
            role: "assistant",
            content: "Ja, ik tik de tekst exact over zoals hij er staat. Ik verander niets — geen spelfouten, geen interpunctie, niets. Stuur de afbeelding maar."
          },
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType || "image/png", data: image }
              },
              {
                type: "text",
                text: "Tik deze tekst exact over."
              }
            ]
          }
        ]
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
