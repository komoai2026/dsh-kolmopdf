import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';

declare const SETTINGS_NAMESPACE = "kolmopdf";

interface ResolvedConfig {
    apiKey?: string;
    apiKeyEnv: string;
    baseUrl: string;
    outputDir: string;
    pollIntervalMs: number;
    maxPollMinutes: number;
    httpTimeoutMs: number;
    uploadTimeoutMs: number;
}
interface Config {
    apiKey?: string;
    apiKeyEnv?: string;
    baseUrl?: string;
    outputDir?: string;
    pollIntervalMs?: number;
    maxPollMinutes?: number;
    httpTimeoutMs?: number;
    uploadTimeoutMs?: number;
}
declare const Config: z<Config>;

interface ClientOptions {
    apiKey: string;
    baseUrl: string;
    httpTimeoutMs: number;
    uploadTimeoutMs: number;
}
interface SubmitResult {
    task_id: string;
    status: string;
    points_deducted: number;
    remaining_points: number;
    queue_info?: {
        position: number;
        ahead_tasks: number;
    };
}
interface JobResultMeta {
    task_id: string;
    download_url?: string;
    filename?: string | null;
    kind?: string | null;
    content_type?: string | null;
    sha256?: string | null;
    bytes?: number | null;
    files?: Array<{
        name: string;
        kind: string;
    }> | null;
}
interface StatusResult {
    success: boolean;
    status: string;
    message?: string;
    error_code?: string;
    queue_info?: {
        position: number;
        ahead_tasks: number;
    };
    result?: JobResultMeta;
}
interface BalanceResult {
    success: boolean;
    points: number;
    api_key: string;
}
declare class KolmoPdfClient {
    private readonly options;
    constructor(options: ClientOptions);
    private headers;
    private json;
    private uploadForm;
    private submit;
    parse(filePath: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<SubmitResult>;
    translate(filePath: string, options: Record<string, unknown>, signal?: AbortSignal): Promise<SubmitResult>;
    convert(filePath: string, targetFormat: string, signal?: AbortSignal): Promise<SubmitResult>;
    getStatus(taskId: string, signal?: AbortSignal): Promise<StatusResult>;
    openEvents(taskId: string, signal?: AbortSignal): Promise<Response>;
    download(taskId: string, destination: string, signal?: AbortSignal): Promise<{
        contentType: string | null;
        bytesWritten: number;
    }>;
    getBalance(signal?: AbortSignal): Promise<BalanceResult>;
}

interface KolmoPdfErrorOptions {
    message?: string;
    httpStatus?: number | null;
    remediation?: string;
    pointsRequired?: number;
    currentPoints?: number;
    cause?: unknown;
}
declare class KolmoPdfError extends Error {
    readonly code: string;
    readonly httpStatus: number | null;
    readonly remediation: string;
    readonly pointsRequired: number | undefined;
    readonly currentPoints: number | undefined;
    constructor(code: string, options?: KolmoPdfErrorOptions);
}

declare const name = "kolmopdf";
declare const inject: string[];
declare function apply(ctx: Context, config: Config): void;

export { Config, KolmoPdfClient, KolmoPdfError, Config as PluginConfig, type ResolvedConfig, SETTINGS_NAMESPACE, apply, inject, name };
