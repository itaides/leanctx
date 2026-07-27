/**
 * OpenAI — leanctx's minimal, zero-dependency OpenAI client.
 *
 * This is a *minimal client*, not a drop-in replacement for the `openai`
 * package: it covers `chat.completions.create` (non-streaming) over raw
 * fetch, with request-side compression and leanctx telemetry on the response.
 * Users who need the full official SDK surface should keep their own SDK and
 * integrate via `leanctxFetch` or `wrap` instead.
 *
 *     import { OpenAI } from "leanctx";
 *     const client = new OpenAI({ apiKey, leanctxConfig: { mode: "on" } });
 *     const response = await client.chat.completions.create({ model, messages });
 *     // response.usage.leanctxTokensSaved etc.
 */

import { Middleware } from "./middleware.js";
import { attachTelemetry } from "./telemetry.js";
import type { ChatMessage, LeanctxConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com";

export interface OpenAILeanctxClientOptions {
    apiKey?: string;
    baseUrl?: string;
    leanctxConfig?: LeanctxConfig;
    /** Injectable fetch for tests. Defaults to globalThis.fetch. */
    fetchImpl?: typeof fetch;
}

export interface OpenAIChatParams {
    model: string;
    messages: ChatMessage[];
    [key: string]: unknown;
}

export class OpenAI {
    readonly chat: { completions: OpenAICompletions };

    constructor(options: OpenAILeanctxClientOptions = {}) {
        const apiKey =
            options.apiKey ??
            (globalThis as { process?: { env?: Record<string, string> } }).process?.env
                ?.OPENAI_API_KEY ??
            "";
        const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        const middleware = new Middleware(options.leanctxConfig ?? {});
        this.chat = {
            completions: new OpenAICompletions(
                baseUrl,
                apiKey,
                middleware,
                options.fetchImpl ?? fetch,
            ),
        };
    }
}

class OpenAICompletions {
    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly middleware: Middleware,
        private readonly fetchImpl: typeof fetch,
    ) {}

    async create(params: OpenAIChatParams): Promise<Record<string, unknown>> {
        const [compressed, stats] = await this.middleware.compressMessagesAsync(
            params.messages,
        );
        const body = { ...params, messages: compressed };

        const response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
                `OpenAI request failed: HTTP ${response.status} ${detail.slice(0, 300)}`,
            );
        }
        const json = (await response.json()) as Record<string, unknown>;
        if (params.stream !== true) {
            attachTelemetry(json, stats);
        }
        return json;
    }
}
