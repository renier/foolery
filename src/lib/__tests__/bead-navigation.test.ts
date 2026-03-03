import { describe, expect, it } from "vitest";
import { buildBeadFocusHref, stripBeadPrefix } from "@/lib/bead-navigation";

describe("stripBeadPrefix", () => {
  it("removes the leading repo prefix from bead id", () => {
    expect(stripBeadPrefix("foolery-xmvb")).toBe("xmvb");
  });

  it("returns original value when no hyphen exists", () => {
    expect(stripBeadPrefix("xmvb")).toBe("xmvb");
  });
});

describe("buildBeadFocusHref", () => {
  it("sets bead while preserving existing query params", () => {
    expect(buildBeadFocusHref("foolery-xmvb", "repo=/tmp/repo&view=finalcut")).toBe(
      "/beads?repo=%2Ftmp%2Frepo&view=finalcut&bead=foolery-xmvb",
    );
  });

  it("updates detailRepo when provided", () => {
    expect(
      buildBeadFocusHref("foolery-xmvb", "repo=one", {
        detailRepo: "/tmp/repo",
      }),
    ).toBe("/beads?repo=one&bead=foolery-xmvb&detailRepo=%2Ftmp%2Frepo");
  });
});
