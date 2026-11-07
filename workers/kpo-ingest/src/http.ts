export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  requestId: string
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

export function errorResponse(error: HttpError, requestId: string): Response {
  return jsonResponse(
    error.status,
    {
      error: {
        code: error.code,
        message: error.message,
        request_id: requestId,
      },
    },
    requestId
  );
}
