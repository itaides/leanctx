/**
 * Anthropic — leanctx's minimal, zero-dependency Anthropic client.
 *
 * This is a *minimal client*, not a drop-in replacement for
 * `@anthropic-ai/sdk`: it covers `messages.create` (non-streaming) over raw
 * fetch, with request-side compression and leanctx telemetry on the response.
 * Users who need the full official SDK surface should keep their own SDK and
 * integrate via `leanctxFetch` or `wrap` instead.
 *
 *     import { Anthropic } from "leanctx";
 *     const client = new Anthropic({ apiKey, leanctxConfig: { mode: "on" } });
 *     const response = await client.messages.create({ model, max_tokens, messages });
 *     // response.usage.leanctxTokensSaved etc.
 */

import { Middleware } from "./middleware.js";
import { attachTelemetry } from "./telemetry.js";
import type { ChatMessage, LeanctxConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

export interface LeanctxClientOptions {
    apiKey?: string;
    baseUrl?: string;
    leanctxConfig?: LeanctxConfig;
    /** Injectable fetch for tests. Defaults to globalThis.fetch. */
    fetchImpl?: typeof fetch;
}

export interface AnthropicMessageParams {
    model: string;
    max_tokens: number;
    messages: ChatMessage[];
    system?: unknown;
    [key: string]: unknown;
}

export class Anthropic {
    readonly messages: AnthropicMessages;

    constructor(options: LeanctxClientOptions = {}) {
        const apiKey =
            options.apiKey ??
            (globalThis as { process?: { env?: Record<string, string> } }).process?.env
                ?.ANTHROPIC_API_KEY ??
            "";
        const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        const middleware = new Middleware(options.leanctxConfig ?? {});
        this.messages = new AnthropicMessages(
            baseUrl,
            apiKey,
            middleware,
            options.fetchImpl ?? fetch,
        );
    }
}

class AnthropicMessages {
    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly middleware: Middleware,
        private readonly fetchImpl: typeof fetch,
    ) {}

    async create(params: AnthropicMessageParams): Promise<Record<string, unknown>> {
        const [compressed, stats] = await this.middleware.compressMessagesAsync(
            params.messages,
        );
        const body = { ...params, messages: compressed };

        const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
                `Anthropic request failed: HTTP ${response.status} ${detail.slice(0, 300)}`,
            );
        }
        const json = (await response.json()) as Record<string, unknown>;
        attachTelemetry(json, stats);
        return json;
    }
}
