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

  console.log(`[researcher] Researching customer: ${customerName} / module: ${moduleName}`);

  const prompt = `Research the company "${customerName}" using web search. You are preparing personalized technical documentation for a DevonWay quality and compliance platform implementation. The module being deployed is called "${moduleName}".

Your job is to produce a rich JSON object that will be used to personalize professional PDF documents for this customer. Be SPECIFIC — avoid generic boilerplate. Name real programs, real regulations, real operational challenges, real equipment types or incident categories that are authentic to this customer's industry. Write as a subject matter expert who understands both this customer's business and how quality/compliance management software is used in their industry.

Use web search to research the company, then return a JSON object with exactly these fields:

- "name": the company's official name (string)
- "industry": their primary industry in 1-4 words (string)
- "description": 2-3 sentences describing what the company does, who they serve, and their scale (string)
- "tagline": their official slogan or mission statement if findable, otherwise null
- "size": approximate company size — one of: "Fortune 500", "large enterprise", "mid-size", "small business", "startup" (string or null)
- "homepageUrl": their primary website URL (string or null)
- "moduleContext": 2-3 sentences explaining specifically how a "${moduleName}" module on a quality and compliance management platform would benefit this company — reference their actual industry, operations, regulatory environment, or known business challenges (string)
- "exampleRecords": an array of exactly 5 concrete, realistic record types this customer would actually manage in a "${moduleName}" module. Each entry is a short string of 10-25 words describing a specific type of record. Do NOT use generic descriptions like "a safety incident" or "a quality issue". Instead, name real things — equipment types, standards, named programs, specific incident categories — that are real to this customer's world. For example, for a utility company's CAPA module: "NERC CIP-007 corrective action triggered by a failed patch management audit", "Lockout/Tagout (LOTO) procedure gap identified during Cal-OSHA inspection of Fresno substation", "Gas leak corrective action from third-party contractor damage to distribution main". (array of 5 strings)
- "workflowNarrative": exactly 2 paragraphs of prose explaining WHY records flow through the workflow in this module, what business decisions are made at each stage, and what the overall process means operationally for this customer. Write in present tense as if describing the live system. Be specific to this customer's industry and operations. Separate the two paragraphs with <br><br>. Do not use markdown. (string)
- "roleNarratives": an object where each key is a generic role type that would exist in a "${moduleName}" module (e.g. "Initiator", "Reviewer", "Approver", "Administrator", "Quality Manager", "Safety Officer", "Supervisor", "Engineer") and each value is 2 sentences: what that role-holder's actual job function is at this customer's organization, and what they are specifically looking for when they open or interact with this module. Use this customer's actual industry context and terminology. (object with string values)
- "operationalBenefits": an array of exactly 4 specific benefits this module delivers to this customer. NOT generic statements like "improves efficiency" but specific, named outcomes like "Replaces manual spreadsheet tracking of OSHA 300 injury logs across 47 service centers with a single searchable system of record" or "Provides auditable corrective action records required for NERC CIP-007 annual compliance reporting to WECC". (array of 4 strings)
- "regulatoryContext": 1-2 sentences naming the SPECIFIC regulations, standards, or programs that drive the need for this type of module at this customer — for example: NERC CIP-007, OSHA 29 CFR 1910.147, EPA Risk Management Program (40 CFR Part 68), FDA 21 CFR Part 820, The Joint Commission accreditation standards, ISO 9001:2015, DOT 49 CFR Part 192. Be specific to this customer's industry. (string)
- "whyThisModule": exactly 3 paragraphs explaining the operational pain point this module solves and why users engage the system. Paragraph 1: what the problem looked like before — manual processes, spreadsheet tracking, email chains, audit failures, regulatory risk. Paragraph 2: how the module changes daily operations — what users do in it, how records are initiated, how work gets routed. Paragraph 3: the business outcome — what leadership, safety teams, and auditors get from the system. Write in present tense. Be specific to this customer. Separate paragraphs with <br><br>. Do not use markdown. (string)
- "industryInsight": 1-2 sentences of subject matter context about how this type of module is commonly used in this customer's specific industry — what peer organizations typically struggle with, what regulatory bodies expect, or what operational risks the module mitigates. (string)
- "scraped": true

Return ONLY a valid JSON object. No markdown code fences, no explanation, no commentary before or after. Just the raw JSON.`;

  try {
    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
    const messages = [{ role: 'user', content: prompt }];

    let response = await c.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      tools,
      messages,
    });

    // Agentic loop: keep going until stop_reason is 'end_turn' or no more tool use
    while (response.stop_reason === 'tool_use') {
      console.log('[researcher] Tool use in progress, continuing...');

      // Append assistant turn
      messages.push({ role: 'assistant', content: response.content });

      // Build tool results for all tool_use blocks
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: b.type === 'tool_use' ? (b.content || '') : '',
        }));

      messages.push({ role: 'user', content: toolResults });

      response = await c.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools,
        messages,
      });
    }

    // Find the final text block
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length === 0) {
      console.warn('[researcher] No text block in final response — using name-only context');
      return { name: customerName, scraped: false };
    }

    const raw = textBlocks[textBlocks.length - 1].text.trim();

    // Strip markdown code fences if Claude added them anyway
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const parsed = JSON.parse(jsonStr);

    // Normalize array fields in case Claude returned objects instead of arrays
    if (parsed.exampleRecords && !Array.isArray(parsed.exampleRecords))
      parsed.exampleRecords = Object.values(parsed.exampleRecords);
    if (parsed.operationalBenefits && !Array.isArray(parsed.operationalBenefits))
      parsed.operationalBenefits = Object.values(parsed.operationalBenefits);

    console.log(`[researcher] Success — industry: ${parsed.industry || 'unknown'}, records: ${Array.isArray(parsed.exampleRecords) ? parsed.exampleRecords.length : 0}`);

    // Always preserve the customer name exactly as typed
    return { ...parsed, name: customerName, scraped: true };
  } catch (err) {
    console.error('[researcher] Failed:', err.message);
    return { name: customerName, scraped: false };
  }
}

module.exports = { researchCustomer };
