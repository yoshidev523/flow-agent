export class FlowError extends Error {
  constructor(
    message: string,
    public code = "contract",
    public exitCode = 3,
  ) {
    super(message);
  }
}
export function requireCondition(
  ok: unknown,
  message: string,
  condition = false,
): asserts ok {
  if (!ok)
    throw new FlowError(
      message,
      condition ? "condition" : "contract",
      condition ? 2 : 3,
    );
}
