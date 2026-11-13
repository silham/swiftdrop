import { serverApi } from '@/lib/api/server';
import { AssistantChat } from './AssistantChat';

/** Server wrapper: asks the API whether a model is configured, then renders the chat. Owner: M1. */
export async function AssistantLauncher({ trackingNumber }: { trackingNumber?: string }) {
  const api = await serverApi();
  const { data } = await api.GET('/api/v1/assistant');
  return <AssistantChat enabled={data?.enabled ?? false} trackingNumber={trackingNumber} />;
}
