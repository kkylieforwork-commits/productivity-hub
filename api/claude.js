export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, max_tokens } = req.body;

    // Chuyển từ format Anthropic → Gemini
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof msg.content === 'string' ? msg.content : msg.content[0].text }]
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: max_tokens || 1000,
            temperature: 0.3,
          },
          systemInstruction: {
            parts: [{ text: 'You must respond with raw JSON only. No markdown, no backticks, no explanation. Just the JSON object.' }]
          }
        })
      }
    );

    const data = await geminiRes.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown backticks nếu Gemini vẫn trả về
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Trả về format Anthropic để App.tsx không cần thay đổi gì
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}