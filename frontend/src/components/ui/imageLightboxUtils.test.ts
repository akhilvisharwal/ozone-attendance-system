import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canPanImage,
  clampPan,
  computeFitScale,
} from "./imageLightboxUtils";

describe("imageLightboxUtils", () => {
  it("fits large images inside the container without upscaling small ones", () => {
    assert.equal(computeFitScale({ width: 800, height: 600 }, { width: 1600, height: 1200 }), 0.5);
    assert.equal(computeFitScale({ width: 800, height: 600 }, { width: 200, height: 150 }), 1);
  });

  it("allows panning only when the image exceeds the viewport", () => {
    const natural = { width: 2000, height: 1500 };
    const container = { width: 800, height: 600 };
    const fit = computeFitScale(container, natural);
    assert.equal(canPanImage(fit, natural, container, fit), false);
    assert.equal(canPanImage(1, natural, container, fit), true);
  });

  it("clamps pan offsets inside image bounds", () => {
    const pan = clampPan({ x: 500, y: -500 }, 1, { width: 2000, height: 1500 }, { width: 800, height: 600 });
    assert.ok(Math.abs(pan.x) <= 600);
    assert.ok(Math.abs(pan.y) <= 450);
  });
});
