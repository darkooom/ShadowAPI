import { defineConfig } from "@shadowapi/core";

export default defineConfig({
  target: "http://localhost:3000",
  proxy: { port: 9000 },
  recording: {
    ignorePaths: ["/health", "/metrics"],
    redactHeaders: ["authorization", "cookie"],
    redactFields: ["password", "token", "secret"],
    bodySizeLimit: 1_048_576,
  },
  inference: {
    enum: {
      minimumObservations: 10,
      maximumUniqueValues: 10,
      maximumUniqueRatio: 0.2,
    },
  },
});
