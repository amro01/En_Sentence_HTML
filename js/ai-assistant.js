/**
 * ====================================================================
 * En_Sentence_HTML - AI 助手（生成器端）
 * Copyright (c) 2026 amro01 (https://github.com/amro01/En_Sentence_HTML)
 *
 * This program is licensed under CC BY-NC-SA 4.0.
 * Unauthorized commercial repackaging or selling is strictly prohibited.
 * ====================================================================
 *
 * 只服务生成器页面：读取本地 AI 配置、构造教研 Prompt、解析模型 JSON、
 * 发起 OpenAI 兼容的 /chat/completions 请求。
 *
 * 安全约束：
 *   - API Key 只写入生成器所在域的 localStorage（EnSentence_AI_Config），
 *     不会进入生成出来的练习 HTML；
 *   - 所有模型文本在写入页面前一律转义，本模块只负责数据校验。
 */

import { splitStarter } from './starter.js';
import { chunkSentence, findErrorChunk, peerSpeechLine } from './peer-relay.js';

export const AI_CONFIG_STORAGE_KEY = 'EnSentence_AI_Config';

export const AI_DEFAULT_CONFIG = Object.freeze({
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'GLM-4.7-Flash'
});

export const AI_MODEL_OPTIONS = Object.freeze([
    Object.freeze({ value: 'GLM-4.7-Flash', label: 'GLM-4.7-Flash（推荐）' }),
    Object.freeze({ value: 'GLM-4-Flash-250414', label: 'GLM-4-Flash-250414（极速备选）' })
]);

export const AI_SYSTEM_PROMPT = `你是一个资深儿童英语教研专家。请根据中文（及可选的标准英文参考），生成供孩子练习的数据。
要求：
1. variants：提供 2~3 个不同风格（教材标准/日常口语/礼貌询问）的正确表达，并提取前 2~3 词作为 starter。
2. peer_trap（若需要生成错句）：制造一个中国小学生极易犯的典型错误（如介词混淆、第三人称单数漏 -s、时态错用），并拆分成 3~4 个自然意群胶囊 chunks，明确标出错误索引和简短温和的讲解。

请严格仅输出如下 JSON：
{
  "variants": [
    { "starter": "Where are...", "full_sentence": "Where are the books about music, please?", "tag": "教材标准" },
    { "starter": "Could you tell...", "full_sentence": "Could you tell me where the music books are?", "tag": "礼貌询问" }
  ],
  "peer_trap": {
    "sentence": "Where are the books on music, please?",
    "chunks": ["Where are", "the books", "on music,", "please?"],
    "error_chunk_index": 2,
    "error_explanation": "关于某主题的书籍，应该用 about 而不是 on 哦！"
  }
}`;

function getStorage(storage) {
    if (storage) return storage;
    try {
        return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch (e) {
        return null;
    }
}

export function normalizeBaseUrl(value) {
    return String(value == null ? '' : value).trim().replace(/\/+$/, '');
}

export function normalizeAIConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        baseUrl: normalizeBaseUrl(source.baseUrl) || AI_DEFAULT_CONFIG.baseUrl,
        apiKey: String(source.apiKey == null ? '' : source.apiKey).trim(),
        // 显式空字符串保留为空，方便 UI 提示「请填写模型」；缺省时才回退默认模型。
        model: source.model == null ? AI_DEFAULT_CONFIG.model : String(source.model).trim()
    };
}

export function isAIConfigReady(config) {
    const source = config && typeof config === 'object' ? config : {};
    return !!(
        normalizeBaseUrl(source.baseUrl || AI_DEFAULT_CONFIG.baseUrl)
        && String(source.apiKey == null ? '' : source.apiKey).trim()
        && String(source.model == null ? AI_DEFAULT_CONFIG.model : source.model).trim()
    );
}

/**
 * 读取 localStorage 中的 AI 配置；损坏或不可用时回退到默认值。
 * @param {Storage} [storage] 测试时可注入
 */
export function loadAIConfig(storage) {
    const store = getStorage(storage);
    if (!store) return normalizeAIConfig(AI_DEFAULT_CONFIG);
    try {
        const raw = store.getItem(AI_CONFIG_STORAGE_KEY);
        if (!raw) return normalizeAIConfig(AI_DEFAULT_CONFIG);
        return normalizeAIConfig(JSON.parse(raw));
    } catch (e) {
        return normalizeAIConfig(AI_DEFAULT_CONFIG);
    }
}

/**
 * 保存 AI 配置。隐私模式 / 配额满时静默失败，不阻断生成。
 * @param {object} config
 * @param {Storage} [storage]
 */
export function saveAIConfig(config, storage) {
    const value = normalizeAIConfig(config);
    const store = getStorage(storage);
    if (store) {
        try { store.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
    return value;
}

/** 兼容用户直接粘贴带 /chat/completions 的完整地址。 */
export function resolveChatEndpoint(baseUrl) {
    const base = normalizeBaseUrl(baseUrl) || AI_DEFAULT_CONFIG.baseUrl;
    if (/\/chat\/completions$/i.test(base)) return base;
    return base + '/chat/completions';
}

function cleanSentence(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function starterFor(fullSentence, provided) {
    const starter = cleanSentence(provided);
    if (starter) return starter;
    return splitStarter(fullSentence).starter;
}

/**
 * 解析模型返回的 JSON（允许 ```json 围栏或前后解释文本）。
 * 使用括号配对而不是正则，避免句子里的花括号截断。
 */
export function extractJSONObject(content) {
    const text = String(content == null ? '' : content).trim();
    if (!text) throw new Error('AI 返回了空内容');

    const candidates = [text];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) candidates.unshift(fenced[1].trim());

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (e) { /* 继续尝试截取 */ }

        // 从每个 `{` 起点尝试括号配对，跳过正文里的无效花括号。
        let searchFrom = 0;
        while (searchFrom < candidate.length) {
            const start = candidate.indexOf('{', searchFrom);
            if (start === -1) break;
            let depth = 0;
            let inString = false;
            let escaped = false;
            let matchedEnd = -1;
            for (let i = start; i < candidate.length; i++) {
                const ch = candidate[i];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === '"') inString = false;
                    continue;
                }
                if (ch === '"') { inString = true; continue; }
                if (ch === '{') depth += 1;
                else if (ch === '}') {
                    depth -= 1;
                    if (depth === 0) { matchedEnd = i; break; }
                }
            }
            if (matchedEnd === -1) break;
            try {
                const parsed = JSON.parse(candidate.slice(start, matchedEnd + 1));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (e) { /* 当前花括号不是有效对象，继续找下一个 */ }
            searchFrom = start + 1;
        }
    }

    throw new Error('AI 返回的内容不是有效 JSON，请重试或更换模型');
}

export function normalizeVariants(rawVariants) {
    const list = Array.isArray(rawVariants) ? rawVariants : [];
    const variants = [];
    for (const item of list) {
        const source = item && typeof item === 'object' ? item : { full_sentence: item };
        const fullSentence = cleanSentence(source.full_sentence);
        if (!fullSentence) continue;
        variants.push({
            starter: starterFor(fullSentence, source.starter),
            full_sentence: fullSentence,
            tag: cleanSentence(source.tag)
        });
        if (variants.length >= 3) break;
    }
    if (!variants.length) {
        throw new Error('AI 未返回可用的正确表达（variants），请重试');
    }
    return variants;
}

export function normalizePeerTrap(rawTrap, correctSentence) {
    if (!rawTrap) return null;
    const source = typeof rawTrap === 'string' ? { sentence: rawTrap } : rawTrap;
    if (!source || typeof source !== 'object') return null;

    const sentence = cleanSentence(source.sentence);
    if (!sentence) return null;

    const reference = cleanSentence(correctSentence);
    if (reference && peerSpeechLine(sentence).toLowerCase() === peerSpeechLine(reference).toLowerCase()) {
        return null;
    }

    // 没有词面差异就不是「同伴错句」，避免孩子被要求找一个不存在的错误。
    const detected = reference ? findErrorChunk(sentence, reference) : null;
    if (reference && !detected) return null;

    let chunks = Array.isArray(source.chunks)
        ? source.chunks.map(cleanSentence).filter(Boolean)
        : [];
    if (!chunks.length) chunks = chunkSentence(sentence);

    let errorChunkIndex = parseInt(source.error_chunk_index, 10);
    if (!Number.isFinite(errorChunkIndex) || errorChunkIndex < 0 || errorChunkIndex >= chunks.length) {
        errorChunkIndex = detected ? detected.chunkIndex : 0;
    }

    const explanation = cleanSentence(source.error_explanation)
        || (detected ? detected.explanation : '')
        || '这句话好像有点不对劲，再仔细看看哦！';

    return {
        sentence,
        chunks,
        error_chunk_index: errorChunkIndex,
        error_explanation: explanation
    };
}

/**
 * @param {string} content 模型 message.content
 * @param {{wantPeerTrap?: boolean}} [options]
 */
export function parseAIGenerationResponse(content, options) {
    const wantPeerTrap = !!(options && options.wantPeerTrap);
    const parsed = extractJSONObject(content);
    const variants = normalizeVariants(parsed.variants);
    const peerTrap = normalizePeerTrap(parsed.peer_trap, variants[0].full_sentence);
    if (wantPeerTrap && !peerTrap) {
        throw new Error('AI 未返回有效的同伴错句，请重试或检查 Prompt 是否被模型忽略');
    }
    return {
        variants,
        peer_trap: wantPeerTrap ? peerTrap : null
    };
}

export function buildAIGenerationPrompt(params) {
    const source = params || {};
    const lines = [];
    const chinese = cleanSentence(source.chinese);
    const referenceEnglish = cleanSentence(source.referenceEnglish);
    if (chinese) lines.push('中文：' + chinese);
    if (referenceEnglish) lines.push('标准英文参考：' + referenceEnglish);
    if (!lines.length) throw new Error('请先填写中文或英文参考');
    lines.push(source.wantPeerTrap
        ? '本次需要生成 peer_trap：请制造一个中国小学生常犯的错误，并给出 3~4 个意群胶囊。'
        : '本次不需要同伴错句：请省略 peer_trap 字段。');
    return lines.join('\n');
}

function messageFromErrorPayload(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;
    if (payload.error && payload.error.message) return String(payload.error.message);
    if (payload.message) return String(payload.message);
    return fallback;
}

/**
 * 发起 OpenAI 兼容的 chat/completions 请求。
 * 返回 { content, data }；HTTP 错误抛 Error（带 status）。
 */
export async function requestChatCompletion(config, messages, options) {
    const value = normalizeAIConfig(config);
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
    if (typeof fetchImpl !== 'function') throw new Error('当前浏览器不支持 fetch，请升级浏览器');
    if (!value.apiKey) throw new Error('请先填写 API Key');
    if (!value.model) throw new Error('请先选择或填写模型名称');

    const body = {
        model: value.model,
        messages: Array.isArray(messages) ? messages : [],
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;

    const response = await fetchImpl(resolveChatEndpoint(value.baseUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + value.apiKey
        },
        body: JSON.stringify(body),
        signal: opts.signal
    });

    const rawText = await response.text();
    let data = null;
    if (rawText) {
        try { data = JSON.parse(rawText); } catch (e) { data = null; }
    }

    if (!response.ok) {
        const fallback = rawText ? rawText.slice(0, 300) : ('HTTP ' + response.status);
        const error = new Error(messageFromErrorPayload(data, fallback));
        error.status = response.status;
        throw error;
    }

    const content = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    return { content: typeof content === 'string' ? content : '', data };
}

/**
 * 极简 1-token 连接测试。成功返回模型回显内容（可能为空）。
 */
export async function testAIConnection(config, options) {
    const opts = options || {};
    const { content } = await requestChatCompletion(
        config,
        [{ role: 'user', content: 'ping' }],
        {
            temperature: 0,
            maxTokens: 1,
            fetchImpl: opts.fetchImpl,
            signal: opts.signal
        }
    );
    return { ok: true, content };
}

/** 生成一张卡片的 variants + 可选 peer_trap。 */
export async function generateCardData(config, params, options) {
    const opts = options || {};
    const prompt = buildAIGenerationPrompt(params);
    const { content } = await requestChatCompletion(
        config,
        [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ],
        {
            temperature: 0.7,
            fetchImpl: opts.fetchImpl,
            signal: opts.signal
        }
    );
    return parseAIGenerationResponse(content, { wantPeerTrap: !!(params && params.wantPeerTrap) });
}

/**
 * 把网络异常翻译成家长能看懂的提示（含 CORS / 超时）。
 */
export function describeAIError(error) {
    if (!error) return '未知错误';
    if (error.name === 'AbortError') return '请求超时，请检查网络或 API 地址';
    const message = String(error.message || error);
    if (error.status) return 'API 请求失败（HTTP ' + error.status + '）：' + message;
    if (error instanceof TypeError || /fetch|network|failed to fetch|load failed/i.test(message)) {
        return '网络请求失败。请依次检查：\n1. API Base URL 是否正确；\n2. 该服务是否允许浏览器直连（CORS）；\n3. 网络/代理是否可达。\n原始错误：' + message;
    }
    return message;
}
