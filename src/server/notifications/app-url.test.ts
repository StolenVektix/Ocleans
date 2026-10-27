import { describe, expect, it } from "vitest";
import { appUrl } from "./delivery";

describe("appUrl", () => {
  it("préfère APP_URL, puis l'URL Vercel, puis localhost", () => {
    expect(appUrl({ APP_URL: "https://ocleans-demo.vercel.app" })).toBe("https://ocleans-demo.vercel.app");
    expect(appUrl({ VERCEL_URL: "ocleans-abc.vercel.app" })).toBe("https://ocleans-abc.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
