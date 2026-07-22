function validateResponse(value, optionCount) {
  return value
    && Number.isInteger(value.answerIndex)
    && value.answerIndex >= 0
    && value.answerIndex < optionCount
    && typeof value.complete === 'boolean'
    && typeof value.ambiguous === 'boolean';
}

export function mergeJuryResponses(responses, optionCount = 4) {
  const valid = responses.filter(value => validateResponse(value, optionCount));
  return {
    modelAnswers: valid.map(value => value.answerIndex),
    modelComplete: valid.length >= 3 && valid.every(value => value.complete && !value.ambiguous),
    modelReasons: valid.map(value => String(value.reason || '')).filter(Boolean),
  };
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = new Error(`DeepSeek HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(4_000, 500 * (2 ** attempt))));
  }
  throw lastError;
}

export async function callDeepSeekJury(question, role, apiKey) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  const response = await fetchWithRetry(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      temperature: role.includes('批判') ? 0 : 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `你是${role}。独立解题，不采信题库答案。只返回JSON：{"answerIndex":0,"complete":true,"ambiguous":false,"reason":"推理"}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            question: question.question,
            code: question.code,
            options: question.options,
            children: question.children,
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const data = await response.json();
  const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  if (!validateResponse(result, question.options.length)) throw new Error('DeepSeek returned invalid jury JSON');
  return result;
}

export async function verifyOrRepairExplanation(question, answerLocked, apiKey) {
  if (!answerLocked || !apiKey) return { explanationVerified: false, publishedExplanation: null };
  const ask = async (explanation, role) => {
    const synthetic = {
      ...question,
      question: `${question.question}\n待检查解析：${explanation}`,
    };
    return callDeepSeekJury(synthetic, role, apiKey);
  };
  const checks = await Promise.all([
    ask(question.explanation, '解析正确性批判器A'),
    ask(question.explanation, '解析正确性批判器B'),
  ]);
  const accepted = checks.every(result => result.complete
    && !result.ambiguous
    && result.answerIndex === question.answer.correctIndex);
  return {
    explanationVerified: accepted,
    publishedExplanation: accepted ? question.explanation : null,
    explanationChecks: checks.map(result => result.reason),
  };
}
