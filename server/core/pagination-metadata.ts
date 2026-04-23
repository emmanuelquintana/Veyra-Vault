export class PaginationMetadata {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;

  constructor(params?: Partial<PaginationMetadata>) {
    this.page = params?.page ?? 1;
    this.pageSize = params?.pageSize ?? 0;
    this.total = params?.total ?? 0;
    this.totalPages = params?.totalPages ?? 0;
  }
}
