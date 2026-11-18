import { presetModels, providerBaseUrl } from "@source/ai/providers/registry.ts";
import type { ProviderRecord } from "@source/desktop/shared/bridge.ts";

function pick(models: ReturnType<typeof presetModels>, ids: string[]) {
  return ids.map((id) => {
    const found = models.find((model) => model.id === id);
    if (!found) throw new Error(`ZPI 模型目录缺少 ${id}`);
    return found;
  });
}
export const demoProviders: ProviderRecord[] = [
  {
    id: "demo",
    name: "OpenAI",
    preset: "openai",
    api: "openai-responses",
    baseUrl: providerBaseUrl("openai-api", "openai-responses"),
    hasApiKey: true,
    models: pick(presetModels("openai-api", "openai-responses"), [
      "gpt-6.2-sol",
      "gpt-6.2-astra",
      "gpt-6.1-terra",
      "gpt-6-luna",
    ]),
  },
  {
    id: "demo-deepseek",
    name: "DeepSeek",
    preset: "deepseek",
    api: "openai-completions",
    baseUrl: providerBaseUrl("deepseek", "openai-completions"),
    hasApiKey: true,
    models: pick(presetModels("deepseek", "openai-completions"), ["deepseek-flash"]),
  },
];
export const defaultSelection = { provider: "demo", modelId: "gpt-6.2-astra", reasoning: "high" };
