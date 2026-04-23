import { Response } from 'express';
import { ApiResponseBuilder } from './api-response-builder.js';

export type TraceResponse = Response & {
  locals: {
    traceId: string;
  };
};

export function sendSuccess<TData>(res: Response, data: TData, message = 'Success', status = 200) {
  const traceId = String(res.locals.traceId ?? '');
  return res.status(status).json(
    ApiResponseBuilder.create<TData>()
      .traceId(traceId)
      .message(message)
      .data(data)
      .build(),
  );
}

export function sendError(res: Response, status: number, code: string, message: string, data: unknown = {}) {
  const traceId = String(res.locals.traceId ?? '');
  return res.status(status).json(
    ApiResponseBuilder.create()
      .code(code)
      .message(message)
      .traceId(traceId)
      .data(data)
      .build(),
  );
}
