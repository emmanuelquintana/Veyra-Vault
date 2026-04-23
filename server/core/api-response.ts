import { PaginationMetadata } from './pagination-metadata.js';

export type ApiResponseParams<TData> = {
  code: string;
  message: string;
  traceId: string;
  data: TData;
  metadata: PaginationMetadata;
};

export class ApiResponse<TData = unknown> {
  code: string;
  message: string;
  traceId: string;
  data: TData;
  metadata: PaginationMetadata;

  constructor(params: ApiResponseParams<TData>) {
    this.code = params.code;
    this.message = params.message;
    this.traceId = params.traceId;
    this.data = params.data;
    this.metadata = params.metadata;
  }
}
