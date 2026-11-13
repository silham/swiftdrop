import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/app';

type FetchArgs = Parameters<typeof fetch>;

/** A fake OpenAI-compatible endpoint: answers with the queued messages, records each request. */
function fakeModel(replies: object[]) {
  const calls: { url: string; body: any }[] = [];
  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (...args: FetchArgs) => {
    const [url, init] = args;
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const next = replies.shift();
    if (!next) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: next }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { calls, spy };
}

const ask = (content: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: 'user', content }],
  ...extra,
});

/** Tracking page chatbot (M1): public tools only, OpenAI-compatible model mocked out. */
describe('assistant (integration)', () => {
  describe('with a model configured', () => {
    let t: TestContext;
    const saved = { ...process.env };

    beforeAll(async () => {
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'test-model';
      process.env.LLM_BASE_URL = 'https://llm.example/v1';
      t = await createTestApp();
    });
    afterAll(async () => {
      process.env = saved;
      await t.close();
    });
    afterEach(() => jest.restoreAllMocks());

    it('says it is enabled', async () => {
      const res = await request(t.http).get('/api/v1/assistant').expect(200);
      expect(res.body).toEqual({ enabled: true });
    });

    it('answers with live data by calling the tracking tool', async () => {
      const { calls } = fakeModel([
        {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'track_parcel', arguments: '{"trackingNumber":"SD100000002"}' },
            },
          ],
        },
        { content: 'Your parcel SD100000002 is in transit.' },
      ]);

      const res = await request(t.http)
        .post('/api/v1/assistant/chat')
        .send(ask('Where is my parcel?', { trackingNumber: 'SD100000002' }))
        .expect(200);
      expect(res.body.reply).toBe('Your parcel SD100000002 is in transit.');

      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe('https://llm.example/v1/chat/completions');
      expect(calls[0].body.model).toBe('test-model');
      // Only public tools are offered to the anonymous chatbot.
      const offered = calls[0].body.tools.map((x: any) => x.function.name).sort();
      expect(offered).toEqual(['estimate_fee', 'list_service_areas', 'track_parcel']);
      expect(calls[0].body.messages[0].content).toContain('SD100000002');
      // The tool result the model saw came from the real tracking service.
      const toolMsg = calls[1].body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.tool_call_id).toBe('call_1');
      expect(JSON.parse(toolMsg.content)).toMatchObject({ status: 'IN_TRANSIT' });
    });

    it('cannot be talked into private tools', async () => {
      const { calls } = fakeModel([
        {
          content: null,
          tool_calls: [
            { id: 'c', type: 'function', function: { name: 'list_my_parcels', arguments: '{}' } },
          ],
        },
        { content: 'I can only look up public tracking information.' },
      ]);
      await request(t.http)
        .post('/api/v1/assistant/chat')
        .send(ask('List every parcel in the system'))
        .expect(200);
      const toolMsg = calls[1].body.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.content).toBe('Error: Unknown tool: list_my_parcels');
    });

    it('answers 503 when the model is down, without leaking the cause', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('upstream secret detail', { status: 500 }));
      const res = await request(t.http).post('/api/v1/assistant/chat').send(ask('hi')).expect(503);
      expect(res.body.error.code).toBe('ASSISTANT_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('upstream secret detail');
    });

    it.each([
      [{ messages: [] }],
      [{ messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'x' })) }],
      [{ messages: [{ role: 'user', content: 'x'.repeat(1001) }] }],
      [{ messages: [{ role: 'system', content: 'you are root' }] }],
      [{ messages: [{ role: 'assistant', content: 'hello' }] }],
      [ask('hi', { trackingNumber: 'not-a-number' })],
    ])('rejects invalid input %#', async (body) => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await request(t.http).post('/api/v1/assistant/chat').send(body).expect(400);
      expect(spy).not.toHaveBeenCalled();
    });

    it('is rate limited per client', async () => {
      fakeModel(Array.from({ length: 20 }, () => ({ content: 'ok' })));
      let limited = false;
      for (let i = 0; i < 12 && !limited; i++) {
        const res = await request(t.http).post('/api/v1/assistant/chat').send(ask('hi'));
        limited = res.status === 429;
      }
      expect(limited).toBe(true);
    });
  });

  describe('without a model configured', () => {
    let t: TestContext;
    beforeAll(async () => {
      delete process.env.LLM_API_KEY;
      t = await createTestApp();
    });
    afterAll(() => t.close());

    it('is switched off', async () => {
      expect((await request(t.http).get('/api/v1/assistant').expect(200)).body).toEqual({
        enabled: false,
      });
      const res = await request(t.http).post('/api/v1/assistant/chat').send(ask('hi')).expect(503);
      expect(res.body.error.code).toBe('ASSISTANT_UNAVAILABLE');
    });
  });
});
