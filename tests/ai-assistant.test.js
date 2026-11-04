import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AI_CONFIG_STORAGE_KEY,
    AI_DEFAULT_CONFIG,
    AI_SYSTEM_PROMPT,
    buildAIGenerationPrompt,
    describeAIError,
    extractJSONObject,
    generateCardData,
    isAIConfigReady,
    loadAIConfig,
    normalizeAIConfig,
    parseAIGenerationResponse,
    requestChatCompletion,
    resolveChatEndpoint,
    saveAIConfig,
    testAIConnection
} from '../js/ai-assistant.js';

function memoryStorage(initial) {
    const data = new Map(Object.entries(initial || {}));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
        removeItem: key => { data.delete(key); },
        dump: () => Object.fromEntries(data)
    };
}

const SAMPLE = {
    variants: [
        {
            starter: 'Where are...',
            full_sentence: 'Where are the books about music, please?',
            tag: '教材标准'
        },
        {
            starter: 'Could you tell...',
            full_sentence: 'Could you tell me where the music books are?',
            tag: '礼貌询问'
        }
    ],
    peer_trap: {
        sentence: 'Where are the books on music, please?',
        chunks: ['Where are', 'the books', 'on music,', 'please?'],
        error_chunk_index: 2,
        error_explanation: '关于某主题的书籍，应该用 about 而不是 on 哦！'
    }
};

test('AI 配置：默认值、localStorage 往返、损坏数据回退', () => {
    assert.equal(AI_CONFIG_STORAGE_KEY, 'EnSentence_AI_Config');
    assert.equal(AI_DEFAULT_CONFIG.baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
    assert.equal(AI_DEFAULT_CONFIG.model, 'GLM-4.7-Flash');

    const store = memoryStorage();
    saveAIConfig({ baseUrl: 'https://example.com/v1/', apiKey: ' sk-test ', model: 'GLM-4-Flash-250414' }, store);
    assert.deepEqual(loadAIConfig(store), {
        baseUrl: 'https://example.com/v1',
        apiKey: 'sk-test',
        model: 'GLM-4-Flash-250414'
    });
    assert.equal(store.getItem(AI_CONFIG_STORAGE_KEY).includes('sk-test'), true);

    store.setItem(AI_CONFIG_STORAGE_KEY, '{broken');
    assert.deepEqual(loadAIConfig(store), AI_DEFAULT_CONFIG);
});

test('AI 配置：显式空模型不会被静默替换成默认模型', () => {
    const value = normalizeAIConfig({ baseUrl: 'https://x/v1', apiKey: 'k', model: '' });
    assert.equal(value.model, '');
    assert.equal(isAIConfigReady(value), false);
    assert.equal(isAIConfigReady({ ...value, model: 'custom-model' }), true);
    assert.equal(isAIConfigReady({ baseUrl: 'https://x/v1', model: 'm' }), false);
});

test('AI 端点：容忍尾斜杠与完整 /chat/completions 地址', () => {
    assert.equal(resolveChatEndpoint('https://x/v1/'), 'https://x/v1/chat/completions');
    assert.equal(resolveChatEndpoint('https://x/v1/chat/completions'), 'https://x/v1/chat/completions');
});

test('AI JSON：允许 ```json 围栏、前后解释，并能处理字符串里的花括号', () => {
    const wrapped = '好的，结果如下：\n```json\n' + JSON.stringify(SAMPLE) + '\n```\n请查收。';
    assert.deepEqual(extractJSONObject(wrapped), SAMPLE);
    assert.deepEqual(extractJSONObject(JSON.stringify(SAMPLE)), SAMPLE);
    assert.deepEqual(extractJSONObject('说明 {not json} 然后 ' + JSON.stringify(SAMPLE)), SAMPLE);

    const withBraces = SAMPLE.variants[0].full_sentence;
    const nested = JSON.stringify({
        variants: [{ full_sentence: withBraces, starter: 'Where are', tag: 'x { y }' }]
    });
    assert.equal(extractJSONObject(nested).variants[0].tag, 'x { y }');
    assert.throws(() => extractJSONObject('没有 JSON'), /不是有效 JSON/);
});

test('AI 响应：生成 variants 与 peer_trap，并保留 AI 意群与错误下标', () => {
    const result = parseAIGenerationResponse(JSON.stringify(SAMPLE), { wantPeerTrap: true });
    assert.equal(result.variants.length, 2);
    assert.equal(result.variants[0].starter, 'Where are...');
    assert.deepEqual(result.peer_trap, SAMPLE.peer_trap);
});

test('AI 响应：未要求错句时忽略 peer_trap；错句与正确句相同则拒绝', () => {
    const noTrap = parseAIGenerationResponse(JSON.stringify(SAMPLE), { wantPeerTrap: false });
    assert.equal(noTrap.peer_trap, null);
    assert.equal(noTrap.variants.length, 2);

    const sameTrap = JSON.stringify({
        ...SAMPLE,
        peer_trap: { ...SAMPLE.peer_trap, sentence: SAMPLE.variants[0].full_sentence }
    });
    assert.throws(
        () => parseAIGenerationResponse(sameTrap, { wantPeerTrap: true }),
        /未返回有效的同伴错句/
    );

    assert.throws(
        () => parseAIGenerationResponse(JSON.stringify({ variants: [] }), { wantPeerTrap: false }),
        /未返回可用的正确表达/
    );
});

test('AI 响应：缺 starter 时按前 2~3 词补全，错误下标越界时自动定位', () => {
    const payload = {
        variants: [{ full_sentence: 'She goes to school by bike every day.' }],
        peer_trap: {
            sentence: 'She go to school by bike every day.',
            chunks: ['She go', 'to school', 'by bike', 'every day.'],
            error_chunk_index: 99,
            error_explanation: ''
        }
    };
    const result = parseAIGenerationResponse(JSON.stringify(payload), { wantPeerTrap: true });
    assert.equal(result.variants[0].starter, 'She goes to');
    assert.equal(result.peer_trap.error_chunk_index, 0);
    assert.match(result.peer_trap.error_explanation, /应该|漏|多余|不对劲/);
});

test('AI Prompt：包含中文、参考英文，并按需声明 peer_trap', () => {
    const withTrap = buildAIGenerationPrompt({
        chinese: '请问关于音乐的书在哪里？',
        referenceEnglish: 'Where are the books about music, please?',
        wantPeerTrap: true
    });
    assert.match(withTrap, /^中文：/);
    assert.match(withTrap, /标准英文参考：/);
    assert.match(withTrap, /需要生成 peer_trap/);

    const withoutTrap = buildAIGenerationPrompt({ chinese: '你好', wantPeerTrap: false });
    assert.match(withoutTrap, /省略 peer_trap/);
    assert.throws(() => buildAIGenerationPrompt({ chinese: '  ' }), /请先填写中文或英文参考/);

    assert.match(AI_SYSTEM_PROMPT, /"variants"/);
    assert.match(AI_SYSTEM_PROMPT, /"peer_trap"/);
    assert.match(AI_SYSTEM_PROMPT, /error_chunk_index/);
});

test('AI 请求：Bearer 头、温度、max_tokens 与错误状态透传', async () => {
    let seen = null;
    const fakeFetch = async (url, init) => {
        seen = { url, init };
        return new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 });
    };
    const result = await requestChatCompletion(
        { baseUrl: 'https://api.example.com/v1/', apiKey: 'secret', model: 'test-model' },
        [{ role: 'user', content: 'ping' }],
        { temperature: 0.2, maxTokens: 1, fetchImpl: fakeFetch }
    );
    assert.equal(result.content, 'pong');
    assert.equal(seen.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.Authorization, 'Bearer secret');
    const body = JSON.parse(seen.init.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.temperature, 0.2);
    assert.equal(body.max_tokens, 1);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'ping' }]);

    const failingFetch = async () => new Response(
        JSON.stringify({ error: { message: 'invalid api key' } }),
        { status: 401 }
    );
    await assert.rejects(
        () => requestChatCompletion({ baseUrl: 'https://x/v1', apiKey: 'bad', model: 'm' },
            [{ role: 'user', content: 'ping' }], { fetchImpl: failingFetch }),
        error => error.status === 401 && /invalid api key/.test(error.message)
    );
});

test('AI 生成：发送 system + user，解析围栏 JSON；连接测试只发 1 token', async () => {
    const requests = [];
    const fakeFetch = async (url, init) => {
        const body = JSON.parse(init.body);
        requests.push({ url, body });
        const content = body.max_tokens === 1
            ? 'OK'
            : '```json\n' + JSON.stringify(SAMPLE) + '\n```';
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    };

    const result = await generateCardData(
        { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
        { chinese: '请问关于音乐的书在哪里？', wantPeerTrap: true },
        { fetchImpl: fakeFetch }
    );
    assert.equal(result.variants.length, 2);
    assert.deepEqual(result.peer_trap.chunks, SAMPLE.peer_trap.chunks);

    const body = requests[0].body;
    assert.equal(body.temperature, 0.7);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, AI_SYSTEM_PROMPT);
    assert.match(body.messages[1].content, /请问关于音乐的书在哪里/);

    const tested = await testAIConnection(
        { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
        { fetchImpl: fakeFetch }
    );
    assert.deepEqual(tested, { ok: true, content: 'OK' });
    assert.equal(requests[1].body.max_tokens, 1);
    assert.equal(requests[1].body.temperature, 0);
});

test('AI 错误翻译：CORS/超时/HTTP 状态给家长可执行提示', () => {
    const cors = new TypeError('Failed to fetch');
    assert.match(describeAIError(cors), /CORS/);
    assert.match(describeAIError({ name: 'AbortError', message: 'aborted' }), /超时/);
    assert.match(describeAIError({ status: 429, message: 'rate limited' }), /HTTP 429/);
});
