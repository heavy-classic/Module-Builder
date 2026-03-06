const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

async function researchCustomer(customerName, moduleName) {
  const c = getClient();
  if (!c) {
    console.log('[researcher] ANTHROPIC_API_KEY not set — using name-only context');
    return { name: customerName, scraped: false };
  }

  console.log(`[researcher] Researching customer: ${customerName}`);

  const prompt = `Research the company "${customerName}" using web search. Then return a JSON object with exactly these fields:
- "name": the company's official name (string)
- "industry": their primary industry in 1-3 words (string)
- "description": 2-3 sentences describing what the company does, who they serve, and their scale (string)
- "tagline": their official slogan or mission statement if findable, otherwise null
- "size": approximate company size such as "Fortune 500", "large enterprise", "mid-size", "small business", or "startup" (string or null)
- "homepageUrl": their primary website URL (string or null)
- "moduleContext": 2-3 sentences explaining specifically how a "${moduleName}" module on a quality and compliance management platform like DevonWay would benefit this company — reference their actual industry, operations, regulatory environment, or known business challenges (string)
- "scraped": true

Return ONLY a valid JSON object. No markdown code fences, no explanation, no commentary before or after. Just the raw JSON.`;

  try {
    const response = await c.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    });

    // Find the final text block (after any tool use turns)
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length === 0) {
      console.warn('[researcher] No text block in response — using name-only context');
      return { name: customerName, scraped: false };
    }

    const raw = textBlocks[textBlocks.length - 1].text.trim();

    // Strip markdown code fences if Claude added them anyway
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const parsed = JSON.parse(jsonStr);
    console.log(`[researcher] Success — industry: ${parsed.industry || 'unknown'}`);

    // Always preserve the customer name exactly as typed
    return { ...parsed, name: customerName, scraped: true };
  } catch (err) {
    console.error('[researcher] Failed:', err.message);
    return { name: customerName, scraped: false };
  }
}

module.exports = { researchCustomer };
