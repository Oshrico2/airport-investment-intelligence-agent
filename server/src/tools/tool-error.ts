/** Expected, user-explainable tool failures (bad argument, unknown airport). Mapped to 4xx / tool error results. */
export class ToolError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message);
    this.name = 'ToolError';
  }
}
