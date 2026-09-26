import DataLoader from 'dataloader';

/**
 * Request-scoped DataLoaders. Every nested field reachable from a list resolves through
 * one of these, so a page costs a fixed number of queries (design reference 7.3, contract 5).
 * Loaders are created lazily per request and never shared across requests.
 */
export class LoaderRegistry {
  private readonly loaders = new Map<string, DataLoader<unknown, unknown>>();

  get<K, V>(name: string, batch: DataLoader.BatchLoadFn<K, V>): DataLoader<K, V> {
    let loader = this.loaders.get(name) as DataLoader<K, V> | undefined;
    if (!loader) {
      loader = new DataLoader<K, V>(batch);
      this.loaders.set(name, loader as DataLoader<unknown, unknown>);
    }
    return loader;
  }
}
