import DataLoader from 'dataloader';

/**
 * Request-scoped DataLoaders. Every nested field reachable from a list resolves through
 * one of these, so a page costs a fixed number of queries (design reference 7.3, contract 5).
 * Loaders are created lazily per request and never shared across requests.
 */
export class LoaderRegistry {
  private readonly loaders = new Map<string, DataLoader<unknown, unknown>>();
  private readonly memos = new Map<string, Promise<unknown>>();

  /** Computes a value once per request (for example the org's "today"), however many fields ask. */
  memo<T>(name: string, compute: () => Promise<T>): Promise<T> {
    let value = this.memos.get(name) as Promise<T> | undefined;
    if (!value) {
      value = compute();
      this.memos.set(name, value);
    }
    return value;
  }

  get<K, V>(name: string, batch: DataLoader.BatchLoadFn<K, V>): DataLoader<K, V> {
    let loader = this.loaders.get(name) as DataLoader<K, V> | undefined;
    if (!loader) {
      loader = new DataLoader<K, V>(batch);
      this.loaders.set(name, loader as DataLoader<unknown, unknown>);
    }
    return loader;
  }
}
