#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import {
  loadConfig,
  ShadowProject,
  type EndpointPattern,
  type RecordedExchange,
} from "@shadowapi/core";

const banner = `${pc.cyan("╭─────────────────────────────╮")}
${pc.cyan("│")}         ${pc.bold("ShadowAPI")}           ${pc.cyan("│")}
${pc.cyan("│")}   API traffic intelligence  ${pc.cyan("│")}
${pc.cyan("╰─────────────────────────────╯")}`;

interface GlobalOptions {
  config?: string;
  verbose?: boolean;
  target?: string;
  port?: string;
}

async function projectFor(command: Command): Promise<ShadowProject> {
  const options = command.optsWithGlobals<GlobalOptions>();
  return new ShadowProject({ config: await loadConfig(process.cwd(), options.config) });
}

function exchangeLine(exchange: RecordedExchange): string {
  const method = exchange.request.method.padEnd(7);
  const path = exchange.request.pathname.padEnd(28);
  return `${pc.cyan(method)} ${path} ${String(exchange.response.status).padEnd(4)} ${Math.round(exchange.durationMs)}ms`;
}

async function runProxy(
  command: Command,
  local: { target?: string; port?: string },
): Promise<void> {
  const project = await projectFor(command);
  const global = command.optsWithGlobals<GlobalOptions>();
  const target = local.target ?? global.target ?? project.config.target;
  const port = Number(local.port ?? global.port ?? project.config.proxy?.port ?? 9000);
  const host = project.config.proxy?.host ?? "127.0.0.1";
  const server = project.createProxy({
    ...(target ? { target } : {}),
    ...(global.verbose !== undefined ? { verbose: global.verbose } : {}),
    onExchange: (exchange) => console.log(exchangeLine(exchange)),
  });
  await server.listen({ port, host });
  console.log(
    `\n${banner}\n\n${pc.bold("Target:")}\n${target}\n\n${pc.bold("Proxy:")}\n${server.listeningOrigin}\n\n${pc.yellow("Recording local traffic. Sensitive values are redacted before storage.")}\n`,
  );
  const stop = async () => {
    await server.close();
    project.close();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

function endpointLine(endpoint: EndpointPattern): string {
  return `${endpoint.method.padEnd(7)} ${endpoint.pathTemplate}`;
}

const program = new Command();
program
  .name("shadowapi")
  .description("Turn real API traffic into documentation, mocks and contracts.")
  .version("0.1.0")
  .option("--config <path>", "configuration file")
  .option("--verbose", "enable debug logging")
  .option("--target <url>", "target API (convenience mode)")
  .option("--port <port>", "listening port")
  .action(async (options: { target?: string; port?: string }, command) => {
    if (!options.target) {
      command.help();
      return;
    }
    await runProxy(command, options);
  });

program
  .command("proxy")
  .description("proxy and learn from API traffic")
  .option("--no-store", "proxy without persisting observations")
  .action(async (options: { store: boolean }, command) => {
    const global = command.optsWithGlobals() as GlobalOptions;
    if (!options.store) {
      const project = await projectFor(command);
      const server = project.createProxy({
        ...(global.target ? { target: global.target } : {}),
        ...(global.verbose !== undefined ? { verbose: global.verbose } : {}),
      });
      const save = project.store.save.bind(project.store);
      project.store.save = async () => {};
      await server.listen({
        port: Number(global.port ?? project.config.proxy?.port ?? 9000),
        host: project.config.proxy?.host ?? "127.0.0.1",
      });
      console.log(`${banner}\n\nProxy: ${server.listeningOrigin}\nStorage disabled.`);
      process.once("SIGINT", () => {
        project.store.save = save;
        void server.close().then(() => project.close());
      });
      return;
    }
    await runProxy(command, {});
  });

program
  .command("inspect")
  .description("inspect the learned API")
  .argument("[endpoint]", "path template to inspect")
  .action(async (path: string | undefined, _options, command) => {
    const project = await projectFor(command);
    try {
      const model = await project.model();
      const endpoints = path
        ? model.endpoints.filter((endpoint) => endpoint.pathTemplate === path)
        : model.endpoints;
      if (path && endpoints.length === 0) throw new Error(`No learned endpoint matches ${path}.`);
      console.log(
        `${pc.bold("ShadowAPI Project")}\n\nRequests recorded: ${model.exchangeCount}\nEndpoints learned: ${model.endpoints.length}\n\n${pc.bold("Endpoints")}\n`,
      );
      for (const endpoint of endpoints) {
        console.log(endpointLine(endpoint));
        if (path)
          console.log(
            `  Observed: ${endpoint.sampleCount}\n  Confidence: ${Math.round(endpoint.confidence * 100)}%\n  Responses: ${endpoint.responses.map((response) => `${response.status} (${response.count})`).join(", ")}`,
          );
      }
    } finally {
      project.close();
    }
  });

program
  .command("export")
  .description("generate an OpenAPI 3.1 document")
  .option("--format <format>", "json or yaml", "yaml")
  .option("--output <path>", "output path")
  .action(async (options: { format: string; output?: string }, command) => {
    if (options.format !== "json" && options.format !== "yaml")
      throw new Error("--format must be json or yaml");
    const project = await projectFor(command);
    try {
      const output = options.output ?? `openapi.${options.format === "json" ? "json" : "yaml"}`;
      const filename = await project.exportOpenApi(options.format, output);
      console.log(`${pc.green("✓")} OpenAPI 3.1 written to ${filename}`);
    } finally {
      project.close();
    }
  });

program
  .command("mock")
  .description("serve responses from learned routes")
  .action(async (_options, command) => {
    const project = await projectFor(command);
    const global = command.optsWithGlobals() as GlobalOptions;
    const server = await project.createMock(
      global.verbose !== undefined ? { verbose: global.verbose } : {},
    );
    await server.listen({
      port: Number(global.port ?? project.config.mock?.port ?? 4010),
      host: project.config.mock?.host ?? "127.0.0.1",
    });
    const model = await project.model();
    console.log(
      `${pc.bold("ShadowAPI Mock Server")}\n\n${model.endpoints.map(endpointLine).join("\n")}\n\nListening:\n${server.listeningOrigin}`,
    );
    process.once("SIGINT", () => void server.close().then(() => project.close()));
  });

program
  .command("snapshot")
  .description("save the current learned contract")
  .action(async (_options, command) => {
    const project = await projectFor(command);
    try {
      console.log(`${pc.green("✓")} Snapshot written to ${(await project.snapshot()).filename}`);
    } finally {
      project.close();
    }
  });

program
  .command("diff")
  .description("compare the current contract with the latest snapshot")
  .action(async (_options, command) => {
    const project = await projectFor(command);
    try {
      const result = await project.diff();
      console.log(pc.bold("ShadowAPI Contract Diff"));
      for (const heading of [
        ["Breaking changes", result.breaking],
        ["Non-breaking changes", result.nonBreaking],
      ] as const) {
        if (heading[1].length === 0) continue;
        console.log(
          `\n${heading[0] === "Breaking changes" ? pc.yellow("⚠") : pc.green("+")} ${pc.bold(heading[0])}`,
        );
        let previous = "";
        for (const change of heading[1]) {
          if (change.endpoint !== previous) console.log(`\n${change.endpoint}`);
          console.log(`${change.severity === "breaking" ? "-" : "+"} ${change.message}`);
          previous = change.endpoint;
        }
      }
      console.log(
        `\n${result.breaking.length} breaking change${result.breaking.length === 1 ? "" : "s"} detected.`,
      );
      if (result.breaking.length > 0) process.exitCode = 1;
    } finally {
      project.close();
    }
  });

program
  .command("reset")
  .description("remove locally recorded traffic and snapshots")
  .option("--yes", "skip confirmation")
  .action(async (options: { yes?: boolean }, command) => {
    if (!options.yes)
      throw new Error("Reset deletes local observations. Re-run with --yes to confirm.");
    const project = await projectFor(command);
    try {
      await project.reset();
      console.log(`${pc.green("✓")} Local ShadowAPI data reset.`);
    } finally {
      project.close();
    }
  });

program.showHelpAfterError();
program.parseAsync().catch((error: unknown) => {
  console.error(
    pc.red(`ShadowAPI error: ${error instanceof Error ? error.message : String(error)}`),
  );
  process.exitCode = 2;
});
