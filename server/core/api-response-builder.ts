import { ApiResponse } from './api-response.js';
import { PaginationMetadata } from './pagination-metadata.js';

export class ApiResponseBuilder<TData = unknown> {
  private _code = 'TG_CORE_200';
  private _message = 'Success';
  private _traceId = '';
  private _data = {} as TData;
  private _metadata = new PaginationMetadata();

  code(code: string): this {
    this._code = code;
    return this;
  }

  message(message: string): this {
    this._message = message;
    return this;
  }

  traceId(traceId: string): this {
    this._traceId = traceId;
    return this;
  }

  data(data: TData): this {
    this._data = data;
    return this;
  }

  metadata(metadata: PaginationMetadata): this {
    this._metadata = metadata;
    return this;
  }

  build(): ApiResponse<TData> {
    return new ApiResponse<TData>({
      code: this._code,
      message: this._message,
      traceId: this._traceId,
      data: this._data,
      metadata: this._metadata,
    } as ApiResponse<TData>);
  }

  static create<T>(): ApiResponseBuilder<T> {
    return new ApiResponseBuilder<T>();
  }
}
