/** Outcome of one item in a bulk delete. `blocked` is refused by the server, `failed` is any other error. */
export type BulkStatus = 'deleted' | 'blocked' | 'failed';

/** One line of the bulk-delete report: what happened to one selected card. */
export interface BulkResult {
  key: string;
  title: string;
  status: BulkStatus;
  message?: string;
}
