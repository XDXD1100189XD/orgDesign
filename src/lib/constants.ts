export const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_WEBHOOK_URL ||
  'https://n8n.srv1579407.hstgr.cloud/webhook-test/get-data';

export const ANALYSIS_PROMPT = [
  'Analyze this org chart image.',
  '- Identify all individuals and roles',
  '- Explain reporting relationships clearly',
  '- Describe hierarchy from top to bottom',
  '- Do not assume missing connections',
].join('\n');
