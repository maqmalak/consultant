import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "@/components/common/states";
import { humanizeError } from "@/services/frappe";

const frappeError = {
  response: { data: { exc_type: "ValidationError",
    _server_messages: JSON.stringify([JSON.stringify({ message: "<b>2 of 5</b> required documents are not verified yet" })]) } },
};

describe("API errors", () => {
  it("turns Frappe _server_messages into plain text", () => {
    expect(humanizeError(frappeError)).toBe("2 of 5 required documents are not verified yet");
  });
  it("shows the message and retries", () => {
    const retry = vi.fn();
    render(<ErrorState error={frappeError} onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("required documents are not verified yet");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
