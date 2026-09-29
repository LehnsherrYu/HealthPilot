// Ordinary language aliases, not clinical codes. Keep UI translations separate.
export const DICTIONARY_VERSION = '1.0.0';
export const symptomDictionary = [
  { key: 'shoulder_neck', pattern: /肩颈(?:不适|疼痛|酸痛|痛)/gi },
  { key: 'headache', pattern: /头痛|头疼|\bheadaches?\b/gi },
  {
    key: 'shoulder',
    pattern:
      /肩(?:膀|部)?(?:疼痛|不适|酸痛|疼|痛)|\bshoulder (?:pain|discomfort)\b/gi,
  },
  {
    key: 'neck',
    pattern:
      /(?:颈部|颈|脖子)(?:疼痛|不适|酸痛|疼|痛)|\bneck (?:pain|discomfort)\b/gi,
  },
  {
    key: 'back',
    pattern:
      /(?:腰背部|腰背|腰部|腰|下背部)(?:疼痛|不适|酸痛|疼|痛)|\b(?:lower back|back) (?:pain|discomfort)\b/gi,
  },
  {
    key: 'buttock',
    pattern:
      /(?:臀部|屁股|臀)(?:疼痛|不适|酸痛|疼|痛)|\b(?:buttock|gluteal|glute) (?:pain|discomfort)\b/gi,
  },
  { key: 'bloating', pattern: /腹胀|肚子胀|\bbloating\b/gi },
  { key: 'nausea', pattern: /恶心|想吐|\bnausea\b|\bnauseous\b/gi },
  { key: 'fatigue', pattern: /疲劳|乏力|疲倦|\bfatigue\b|\bfeeling tired\b/gi },
] as const;

export const locationDictionary = [
  /(?:(?:右侧|左侧|右|左)\s*|(?:right|left)\s+)?(?:太阳穴|temple\b)/gi,
  /(?:(?:右侧|左侧|右|左)\s*|(?:right|left)\s+)?(?:肩颈|肩膀|肩部|肩|颈部|脖子|颈|腰背部|腰背|腰部|腰|下背部|臀部|屁股|臀|\bshoulder\b|\bneck\b|\blower back\b|\bback\b|\bbuttock\b|\bgluteal\b|\bglute\b)/gi,
  /腹部|肚子|\babdomen\b|\babdominal area\b/gi,
];

// A reported improvement describes the user's experience, not medical causation.
const chineseReliefAfter =
  '(?:以后|后)(?:症状)?(?:有所)?(?:缓解|好一点|好多了|好转|舒服(?:些|多了)|减轻)';
export const chineseReliefAfterPattern = new RegExp(`^${chineseReliefAfter}`);
const chineseRelief = `(休息|走动|喝水|热敷)${chineseReliefAfter}`;
export const chineseReliefPattern = new RegExp(chineseRelief, 'gi');
export const reliefFactorPattern = new RegExp(
  `${chineseRelief}|(?<=improved after )(?:rest|walking|water)|(?<=better after )(?:rest|walking|water)`,
  'gi'
);

export const contextPatterns = {
  negated:
    /没有|没(?:有)?(?:出现|感到)|无|否认|不(?!适)|并非|\b(?:no|not|without|denies|deny|never|(?:do|does|did|have|has|had|is|was|are|were|ca|could|would|wo)n['’]t)\b/i,
  other:
    /妈妈|母亲|爸爸|父亲|孩子|宝宝|儿子|女儿|朋友|妻子|丈夫|家人|他|她|\b(?:mother|mom|mum|father|dad|child|baby|son|daughter|friend|wife|husband|he|she|they|you)\b/i,
  self: /(?:^|[，,。.!?；;\s])我(?:的|有|感到|现在|今天|昨天)?|\b(?:I|my)\b/i,
  hypothetical:
    /如果|假如|假设|以后|将来|可能会|准备|打算|计划|将要|是否|吗|\b(?:if|would|might|may develop|in future|in the future)\b/i,
  unsupported:
    /[<>]|```|https?:\/\/|\b(?:select|drop|insert|delete)\s+(?:table|from|into)|忽略规则|执行命令|读取\s*\/|\bignore (?:all |previous )?(?:rules|instructions)\b|\b(?:execute|run) (?:commands?|shell)\b/i,
};
