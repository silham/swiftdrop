import { z } from 'zod';
import { AssistantService, MAX_TOOL_ROUNDS } from './assistant.service';

describe('AssistantService (unit)', () => {
  const tool = {
    name: 'track_parcel',
    description: 'Track',
    input: z.object({ trackingNumber: z.string().describe('SD…') }),
  };
  const aiTools = {
    toolsFor: jest.fn().mockReturnValue([tool]),
    execute: jest.fn().mockResolvedValue({ ok: true, text: '{"status":"CREATED"}' }),
  };
  const llm = { enabled: true, complete: jest.fn() };
  const svc = new AssistantService(llm as never, aiTools as never);
  const toolCall = {
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'c1', type: 'function', function: { name: 'track_parcel', arguments: '{bad json' } },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it('builds OpenAI tool specs from the zod schemas of the public tools only', () => {
    const [spec] = svc.publicToolSpecs();
    expect(aiTools.toolsFor).toHaveBeenCalledWith(null);
    expect(spec.function.name).toBe('track_parcel');
    expect(spec.function.parameters).toMatchObject({
      type: 'object',
      properties: { trackingNumber: { type: 'string' } },
      required: ['trackingNumber'],
    });
    expect(spec.function.parameters).not.toHaveProperty('$schema');
  });

  it('runs tools as an anonymous caller and tolerates malformed arguments', async () => {
    llm.complete.mockResolvedValueOnce(toolCall).mockResolvedValueOnce({ content: ' Done. ' });
    await expect(svc.reply([{ role: 'user', content: 'where?' }])).resolves.toBe('Done.');
    expect(aiTools.execute).toHaveBeenCalledWith('track_parcel', {}, null);
  });

  it('stops calling tools after the round limit and asks for a final answer', async () => {
    llm.complete.mockResolvedValue(toolCall);
    llm.complete.mockResolvedValueOnce(toolCall);
    for (let i = 1; i < MAX_TOOL_ROUNDS; i++) llm.complete.mockResolvedValueOnce(toolCall);
    llm.complete.mockResolvedValueOnce({ content: 'Final.' });
    await expect(svc.reply([{ role: 'user', content: 'loop' }])).resolves.toBe('Final.');
    expect(llm.complete).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(llm.complete.mock.calls.at(-1)?.[1]).toEqual([]); // last call offers no tools
  });

  it('treats an empty answer as unavailable', async () => {
    llm.complete.mockResolvedValueOnce({ content: '' });
    await expect(svc.reply([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'ASSISTANT_UNAVAILABLE',
    });
  });
});
