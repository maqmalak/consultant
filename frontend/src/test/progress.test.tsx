import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressTracker, STEPS } from "@/components/common/progress-tracker";

describe("progress tracker", () => {
  it("marks the current step", () => {
    render(<ProgressTracker step={4} />);
    const current = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent(STEPS[4]);
  });
  it("has no current step once the acknowledgment is received", () => {
    render(<ProgressTracker step={6} />);
    expect(screen.getAllByRole("listitem").some((li) => li.getAttribute("aria-current"))).toBe(false);
  });
});
