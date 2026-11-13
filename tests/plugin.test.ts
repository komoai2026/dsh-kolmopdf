import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import * as plugin from "../src/index.js";

describe("plugin apply", () => {
  it("registers tools, system prompt, and suppresses auto settings form without importing removed exports", async () => {
    const tools: string[] = [];
    const sections: string[] = [];
    let autoFlag: boolean | undefined;
    const ctx = new Context();
    ctx.provide("tools", {
      register(def: { name: string }) {
        tools.push(def.name);
        return () => {};
      },
    });
    ctx.provide("systemPrompt", {
      section(def: { name: string }) {
        sections.push(def.name);
        return () => {};
      },
    });
    ctx.provide("settings", {
      configure(presentation: { auto?: boolean }) {
        autoFlag = presentation.auto;
        return () => {};
      },
    });

    const fiber = await ctx.plugin(plugin, {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tools).toEqual([
      "kolmopdf_parse_pdf",
      "kolmopdf_translate_pdf",
      "kolmopdf_convert_markdown",
      "kolmopdf_estimate_cost",
      "kolmopdf_check_balance",
      "kolmopdf_get_task_status",
    ]);
    expect(sections).toEqual(["tool:kolmopdf"]);
    expect(autoFlag).toBe(false);
    await fiber.dispose();
  });

  it("activates cleanly when the optional settings service is absent (headless mode)", async () => {
    const tools: string[] = [];
    const ctx = new Context();
    ctx.provide("tools", {
      register(def: { name: string }) {
        tools.push(def.name);
        return () => {};
      },
    });
    ctx.provide("systemPrompt", {
      section() {
        return () => {};
      },
    });

    const fiber = await ctx.plugin(plugin, {});
    expect(tools).toHaveLength(6);
    await fiber.dispose();
  });
});
