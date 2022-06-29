import React from "react";
import invariant from "invariant";

/**
 * Force `this` to not be used
 */
type FacadeInterface = { [hookName: string]: (this: void, ...args: any[]) => any };

type ImplementationProvider<T extends FacadeInterface> = React.ComponentType<
  React.PropsWithChildren<{
    implementation: T;
  }>
> & {
  __UNSAFE_Partial: React.ComponentType<React.PropsWithChildren<{ implementation: Partial<T> }>>;
};

const isBrowser = typeof window !== "undefined" && !!window.document?.createElement;
const useSafeEffect = isBrowser ? React.useLayoutEffect : React.useEffect;

export function createFacade<T extends FacadeInterface>(
  displayName: string = "Facade"
): [T, ImplementationProvider<T>] {
  const providerNotFound = Symbol();

  const Context = React.createContext<T | typeof providerNotFound>(providerNotFound);
  Context.displayName = `ImplementationProviderContext(${displayName})`;

  /**
   * Keep track of wrapped hooks as they are called so that they always have
   * the same reference. The hook doesn't close over the concrete implementation
   * (because it relies on injecting through context) so it's safe to cache by name.
   */
  const hookCache = {} as T;

  const hooks: T = new Proxy({} as T, {
    get<K extends keyof T & string>(_target: T, key: K): T[K] {
      if (key in hookCache) {
        return hookCache[key];
      }

      const hook = ((...args: Parameters<T[K]>): ReturnType<T[K]> => {
        const concrete = React.useContext(Context);
        React.useDebugValue(key);

        invariant(
          concrete !== providerNotFound,
          `Component using "${key}" must be wrapped in provider ${Context.displayName}`
        );

        return concrete[key](...args);
      }) as T[K];

      /**
       * Do this to preserve the name of the wrapped function.
       */
      Object.defineProperty(hook, "name", { value: key, writable: false });
      Object.freeze(hook);

      hookCache[key] = hook;

      return hook;
    },
    has() {
      return false;
    },
    ownKeys() {
      return [];
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
    getPrototypeOf() {
      return null;
    },
    preventExtensions() {
      return true;
    },
    isExtensible() {
      return false;
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  });

  const ImplementationProvider: ImplementationProvider<T> = (props) => {
    const parent = React.useContext(Context);

    /**
     * Prevent the root ImplementationProvider from being nested inside of
     * another ImplementationProvider.
     */
    invariant(
      parent === providerNotFound,
      `${ImplementationProvider.displayName} should not be rendered inside of another ${ImplementationProvider.displayName}.`
    );

    const ref = React.useRef<T>(props.implementation);

    /**
     * Always update the ref when the value changes, but do it outside
     * of the render loop to avoid bugs.
     */
    useSafeEffect(() => {
      ref.current = props.implementation;
    }, [props.implementation]);

    /**
     * Make sure that we always proxy the ref object. This is to ensure that
     * context value is always referentially the same; thus, any components
     * using one of these hooks will no re-render because `props.implementation`
     * changes.
     *
     * It would actually be a very bad idea to swap out the actual hook mid-session, though.
     */
    const proxy = React.useMemo(() => {
      return new Proxy({} as T, {
        get<K extends keyof T & string>(_target: {}, key: K): T[K] {
          const concrete = ref.current[key];

          invariant(concrete, `${Context.displayName} does not provide a hook named "${key}"`);

          return concrete;
        },
        has(_target: {}, key: string) {
          return Reflect.has(ref.current, key);
        },
        ownKeys(_target: {}) {
          return Reflect.ownKeys(ref.current);
        },
        getOwnPropertyDescriptor(_target: {}, key: string) {
          return Reflect.getOwnPropertyDescriptor(ref.current, key);
        },
        getPrototypeOf() {
          return null;
        },
        preventExtensions() {
          return true;
        },
        isExtensible() {
          return false;
        },
        set() {
          return false;
        },
        deleteProperty() {
          return false;
        },
      });
    }, []);

    return <Context.Provider value={proxy}>{props.children}</Context.Provider>;
  };
  ImplementationProvider.displayName = `ImplementationProvider(${displayName})`;

  /**
   * Used to create a partial context to reduce setup tedium in test scenarios.
   */
  ImplementationProvider.__UNSAFE_Partial = (props) => {
    return (
      <ImplementationProvider implementation={props.implementation as any}>{props.children}</ImplementationProvider>
    );
  };
  ImplementationProvider.__UNSAFE_Partial.displayName = `ImplementationProvider.__UNSAFE_Partial(${displayName})`;

  return [hooks, ImplementationProvider];
}
